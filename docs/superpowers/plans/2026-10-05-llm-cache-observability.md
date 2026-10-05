# 模型缓存统计与前缀复用 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 项目要求单代理顺序执行；未经本次明确批准不得创建、恢复或分派子代理，获准时只可显式使用 Luna。

**Goal:** 为模型调用提供可信的缓存命中/未命中统计，在 AI 实况和新导演只读用量记录展示，并分阶段改善稳定 Prompt 前缀。

**Architecture:** 原始协议在平台 LLM usage 模块归一化，旧 usageTracking 保留现有业务计数。实况传递同一统计结构，独立台账保留逐次调用；Prompt 布局在现有预算选择之后执行，不触及导演领域层。

**Tech Stack:** TypeScript、LangChain ChatOpenAI、自有 Anthropic adapter、Prisma SQLite/PostgreSQL、Node test、React、SSE、IndexedDB。

**Spec:** `docs/superpowers/specs/2026-10-05-llm-cache-observability-design.md`。状态：开发中，按阶段记录完成情况。

## Global Constraints

- 工作区 `D:/code/ai-director-rebuild`；当前基线 `refactor/director-rebuild@6013efa1`，执行时重新检查 HEAD/状态，不覆盖现有 10 份旧计划、交接文档、`server/_iso.cjs`。
- 不在 main 开发；不合并 beta/main、不 push、不恢复暂停作业、不发起额外付费请求。
- 不在真实数据库运行测试；破坏性操作须明确批准、具体备份和验证。本计划不含破坏性操作。
- 仅展示命中、未命中两项；未知不是 0；厂商写入量在内部保留，属于未命中，不重复加入总 Tokens。
- 旧历史不回填推算；异常预算不扣缓存；局部质量债务/人工恢复保持既有规则。
- 新产品 Prompt 只能在 `server/src/prompting` 注册；不能以关键词判断内容稳定性。
- 源文件超过 1300 行必须模块化；平台新能力使用明确责任目录与门面。`promptRunner.ts` 基线 1264 行，缓存逻辑不得堆入该文件。
- UI 默认代码级验证、交互验收交给用户；不启动浏览器或调用真实模型来验收规划。
- 每个完成阶段按 README 发布说明技能检查再提交。下面列出的测试在相关文件最后修改后运行一次，不重复昂贵构建。

## 文件与接口约定

新增共享类型 `shared/types/llmUsage.ts`，接口字段与 spec 一致。`shared/types/llmLive.ts` 的 `LlmLiveTokenUsage` 扩展 `inputCache?`。

新增平台门面 `server/src/platform/llm/usage/index.ts`，导出：

```ts
type UsageProtocol = "openai-compatible" | "anthropic" | "gemini-native";
interface UsageDecodeOptions { protocol?: UsageProtocol; }
// 返回原有基础计数加 inputCache，无足够基础计数时返回 null。
function extractLlmTokenUsage(output: unknown, options?: UsageDecodeOptions): LlmTokenUsageSnapshot | null;
function mergeStreamTokenUsage(a: LlmTokenUsageSnapshot | null, b: LlmTokenUsageSnapshot | null): LlmTokenUsageSnapshot | null;
```

`LlmTokenUsageSnapshot` 继续由旧 facade 兼容导出，底层新类型放 `usage/domain/types.ts`，不得底层反向 import facade 导致环。

逐次登记接口：

```ts
interface InvocationUsageIdentity {
  invocationId: string; provider: string | null; model: string | null;
  requestProtocol: UsageProtocol;
  runId: string | null; generationJobId: string | null; workflowTaskId: string | null;
  novelId: string | null; chapterId: string | null; stage: string | null;
  promptId: string | null; promptVersion: string | null;
}
interface InvocationUsageRecord extends InvocationUsageIdentity {
  status: "completed" | "partial" | "failed";
  startedAt: Date; finishedAt: Date;
  usage: LlmTokenUsageSnapshot | null;
}
interface InvocationUsageRepository {
  record(input: InvocationUsageRecord): Promise<void>; // 同 invocationId 不重复
}
```

查询契约在 `shared/types/llmUsage.ts` 定义 `LlmInvocationUsageItem`、`LlmInvocationUsagePage`：items、nextCursor、recordedSummary（inputCache、recordedCallCount、unknownCallCount、invalidCallCount、partialCallCount）。统计对象不携带正文。

## Task 1：统一缓存口径与流累计合并

**Files:**
- Create: `shared/types/llmUsage.ts`。
- Create: `server/src/platform/llm/usage/domain/types.ts`、`normalizeUsage.ts`、`mergeUsage.ts`、`summarizeUsage.ts`。
- Create: `server/src/platform/llm/usage/index.ts`、`README.md`。
- Modify: `server/src/llm/usageTracking.ts`（提取/合并移入平台，保留 export）。
- Modify: `shared/types/llmLive.ts`。
- Test: `server/tests/llmCacheUsage.test.js`、既有 `server/tests/llmUsageTracking.test.js`。

**Interfaces:** Produces `extractLlmTokenUsage`、`mergeStreamTokenUsage` 和共享 inputCache；不消费 DB。

- [x] 先添加失败测试，覆盖下面样例：

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractLlmTokenUsage, mergeStreamTokenUsage } = require('../dist/platform/llm/usage');
test('明确命中与总输入计算未命中', () => {
  const result = extractLlmTokenUsage({usage_metadata: {
    input_tokens: 1000, output_tokens: 100, total_tokens: 1100,
    input_token_details: {cache_read: 800}
  }});
  assert.equal(result.promptTokens, 1000);
  assert.equal(result.inputCache.cacheHitTokens, 800);
  assert.equal(result.inputCache.cacheMissTokens, 200);
});
test('Anthropic 创建量属于未命中且不重复统计', () => {
  const result = extractLlmTokenUsage({response_metadata: {usage: {
    input_tokens: 20, cache_read_input_tokens: 800,
    cache_creation_input_tokens: 180, output_tokens: 100
  }}}, {protocol: 'anthropic'});
  assert.equal(result.promptTokens, 1000);
  assert.equal(result.totalTokens, 1100);
  assert.equal(result.inputCache.cacheMissTokens, 200);
});
```

- [x] 为 DeepSeek hit/miss、OpenAI Responses details、百炼 cached_tokens、Gemini usageMetadata 写表驱动样例；各自验证 800/200/1000。
- [x] 缺失字段→unavailable/null；明确 hit=0→reported/0/1000；hit=1001、-1、NaN、0.5、冲突来源→invalid/null。标准 SDK 无缓存但 raw 有缓存时正确补齐，不双算 Anthropic SDK 总输入。
- [x] 流样例相同 final frame 重复两次后总量仍 1100；最后帧无缓存时保留此前同调用有效 800/200；输入变更导致失配时 invalid。多个独立请求才求和。
- [x] 运行共享构建、服务端构建与聚焦测试确认失败，然后实现纯解码/合并/汇总函数；不引用 Prisma、不连接模型。
- [x] 旧基础计数测试逐个复核；若新增可选 inputCache 改变 deepEqual，只更新明确的结构期待，不能放松输入/输出/合计断言。
- [x] 执行 `pnpm --filter @ai-novel/shared build`、`pnpm --filter @ai-novel/server build`、`node --test server/tests/llmCacheUsage.test.js server/tests/llmUsageTracking.test.js`。
- [x] 更新模块 README：unknown、write 包含关系、原生/SDK 区分、流累计规则；按发布说明技能提交本阶段（内部能力，无产品入口时不写发布说明）。

## Task 2：补齐上游采集、日志与实况

**Files:**
- Modify: `server/src/llm/anthropicClient.ts`、`factory.ts`、`debugLogging.ts`、`usageTracking.ts`。
- Modify: `server/src/platform/llm/live/LlmLiveBroker.ts`、`server/src/prompting/core/promptRunner.ts`（薄接入）、`server/src/llm/structuredInvoke.ts`。
- Create: `server/src/platform/llm/usage/application/InvocationUsageObserver.ts`。
- Test: `server/tests/anthropicUsageStream.test.js`、`llmDebugUsage.test.js`、`llmLiveBroker.test.js`、`llmCacheUsageLive.test.js`。

**Interfaces:** Consumes Task 1 解码；produces invocationId 和一次调用结束事件，Task 3 订阅登记。Observer 不依赖 DB。

- [x] mock fetch 构造 Anthropic SSE：message_start input=20/read=800/creation=180，两个 text_delta，message_delta output=100，message_stop；断言文字顺序、输入1000、合计1100、缓存800/200。
- [x] 添加 UTF-8 分包、CRLF、usage-only 帧、无缓存字段、断流、原始错误透传用例。无 usage 时保留未知，不写计费估计。
- [x] 先跑失败测试，再让 Anthropic adapter 传递标准化 usage 与原始 metadata。使用唯一消费者，不为了拿 usage 再 invoke。
- [x] 调整 factory 把真实 requestProtocol 传入解码；OpenAI-compatible 不注入其他厂商专有参数，确认 stream usage 选项和当前 SDK 兼容。
- [x] 每次 invoke/stream 尝试生成 invocationId；batch 内每个独立结果各有 ID。若 batch 内部已经过包装后的 invoke，外层不再登记/计数；若 SDK 子结果未被观察则逐项登记。mock 三次物理请求断言三个唯一 ID、各一次业务计数，不能维护已证实的重复统计；若发现既有重复计数，应在该阶段明确报告修复影响。
- [x] 流式 debug 日志使用同一 normalized inputCache；不要重建只有 input/output 的对象。不保存新增密钥或全量原始响应。
- [x] 实况一个会话含多个尝试时，用 invocationId 合计替换每次尝试快照；初次1000/修复500总输入为1500，重复通知修复仍为1500。增加依赖边界清晰的小模块，不能使 promptRunner 超1300行。
- [x] 运行 `node --test server/tests/anthropicUsageStream.test.js server/tests/llmDebugUsage.test.js server/tests/llmLiveBroker.test.js server/tests/llmCacheUsageLive.test.js`，必要时只在源码变更后重建服务端。
- [x] 按发布说明技能提交；更新 `docs/wiki/workflows/llm-live-execution.md` 的真实计数/多尝试规则。

## Task 3：独立逐次调用台账与新导演归属

**Files:**
- Create: `server/src/platform/llm/usage/infrastructure/PrismaInvocationUsageRepository.ts`。
- Create: `server/src/platform/llm/usage/application/InvocationUsageQueryService.ts`。
- Modify: `server/src/prisma/schema.prisma`、`schema.sqlite.prisma`。
- Create: `server/src/prisma/migrations/20261005010000_llm_invocation_usage/migration.sql`、`migrations.sqlite/20261005010000_llm_invocation_usage/migration.sql`。
- Modify: `server/src/llm/usageTracking.ts`（观察接入）、`server/src/app/director/productionComposition.ts`、`server/src/services/novel/production/NovelPipelineExecutor.ts`。
- Create: `server/src/app/director/usage/withStepUsage.ts`、`README.md`。
- Test: `server/tests/llmInvocationUsageRepository.test.js`、`llmInvocationUsageAttribution.test.js`。

**Interfaces:** Consumes Observer、InvocationUsageRecord；produces `InvocationUsageRepository.record` 与 `InvocationUsageQueryService.getRunUsage(runId, query)`。

- [x] 对 repo stub 添加记录去重、两次真实尝试两条、未返回 usage 仍有失败记录、记录身份不混旧 run 的测试。
- [x] 用 `node:os.tmpdir()` 创建一次性 SQLite 文件，在该连接创建最小已有 schema 后应用新增迁移；插入一条用户章节作为保护样本，迁移后正文和旧计数原样保留。禁止加载 server/.env 的 DATABASE_URL。
- [x] 编写 additive Prisma model，字段/索引按 spec，nullable 用量，invocationId 唯一；不关联旧 DirectorRun 外键，不删除旧表、不回填历史。

两套 schema 新增同一模型（纯调用身份不建旧导演外键）：

```prisma
model LlmInvocationUsageRecord {
  id                 String   @id
  runId              String?
  generationJobId    String?
  workflowTaskId     String?
  novelId            String?
  chapterId          String?
  stage              String?
  provider           String?
  model              String?
  requestProtocol    String
  promptId           String?
  promptVersion      String?
  status             String
  startedAt          DateTime
  finishedAt         DateTime
  promptTokens       Int?
  completionTokens   Int?
  totalTokens        Int?
  cacheHitTokens     Int?
  cacheMissTokens    Int?
  cacheWriteTokens   Int?
  cacheUsageStatus   String
  cacheDiagnostic    String?
  @@index([runId, startedAt, id])
  @@index([generationJobId, startedAt, id])
  @@index([novelId, chapterId, startedAt, id])
}
```

迁移仅 CREATE TABLE/CREATE INDEX。SQLite 用 TEXT/INTEGER/DATETIME，PostgreSQL 用 TEXT/INTEGER/TIMESTAMP(3)；两份迁移均不得出现 DROP、DELETE、重建 Chapter 等操作。单次用量写入需落在数据库 Int 范围；超范围记录统计不可用并诊断，不截断计数、不改 generationJob 原始总量。

- [x] repository 对同 ID 重复 insert 使用 createMany skipDuplicates（按数据库支持验证）或 upsert 不改首次终态记录；重复记录不得再次 increment 业务计数。测试不同内容同 ID 的冲突必须诊断，不能安静覆盖。
- [x] 在 app 包装 planning StepRegistry 的 handler，显式 runId/novelId/stage 上下文；production worker 使用 persisted `directorNext.runId`，不假设 ALS 跨进程存活。
- [x] 旧 generationJob/task 增量逻辑保留单一入口。repository 失败写诊断但不自动暂停/重试模型；台账与预算不得相互替代。
- [x] QueryService 按 run 和稳定游标分页；汇总整个已记录范围，不按当前页。测试未知记录传播 null、部分断流覆盖、没有记录、其他 run 隔离。
- [x] Prisma generate 使用既有配置但不部署迁移；临时 SQLite 集成验证，PostgreSQL 有隔离环境时验证增量迁移，无环境明确记录缺口。已有数据应用迁移仅在备份验证后执行。
- [x] 运行 `node --test server/tests/llmInvocationUsageRepository.test.js server/tests/llmInvocationUsageAttribution.test.js server/tests/directorNext/steps/chapterUsagePipeline.test.js server/tests/directorNext/steps/chapterUsageBudget.test.js`。确认缓存不影响已冻结的章节结束计数与暂停恢复。
- [x] 更新平台 usage 与 app/director/usage 边界文档，按发布说明技能提交。schema 没有实际部署到当前验收库时明确标注。

## Task 4：只读接口与两项数字展示

**Files:**
- Modify: `shared/types/llmUsage.ts`、`server/src/modules/director/http/routes.ts`、`server/src/app/director/services.ts`。
- Modify: `client/src/api/directorNext.ts`、`client/src/pages/directorNext/DirectorRunHistoryPage.tsx`、`client/src/components/directorNext/DirectorPanel.tsx`。
- Modify: `client/src/components/liveExecution/LiveExecutionDialog.tsx`、`client/src/lib/storage/llmLiveCache.ts`。
- Create: `client/src/components/liveExecution/usage/presentation.ts`、`presentation.test.mjs`。
- Create: `client/src/components/directorNext/usage/InvocationUsageList.tsx`、`index.ts`。
- Test: `server/tests/directorNext/http/usageReadOnly.test.js`、`client/src/lib/storage/llmLiveCache.test.mjs`。

**Interfaces:** Consumes QueryService；HTTP deps 注入 `readUsage`，不把 DB 放 domain；GET `/director-next/runs/:runId/usage` 返回共享 Page。

- [ ] 添加 HTTP 404、分页 limit1..100、无效 cursor、run 归属、跨 run 隔离测试；stub mutation 方法全部抛错，GET 仍成功。
- [ ] 添加纯展示测试，锁定以下文本：

```js
// presentation.test.mjs 中先 import node:test、node:assert/strict，
// 沿用项目 .test.mjs 的 TypeScript 模块加载方式 import formatCacheTokens。
// 函数签名：(value: number|null|undefined, phase: string, status?: string) => string。
assert.equal(formatCacheTokens(0, 'completed', 'reported'), '0');
assert.equal(formatCacheTokens(null, 'streaming', 'unavailable'), '统计中');
assert.equal(formatCacheTokens(null, 'completed', 'unavailable'), '未提供');
assert.equal(formatCacheTokens(null, 'completed', 'invalid'), '统计不可用');
assert.equal(formatCacheTokens(undefined, 'completed', undefined), '未记录');
```

- [ ] 实现展示与 GET；实况折叠/展开使用相同 formatter，浏览器旧缓存 payload 缺字段可读，UI 更新不触发模型调用。
- [ ] 新导演“调用用量”显示阶段、模型、调用状态、两项数字；合计未知用中性色说明，不用红色失败样式。运行记录仅查看/导航，保留来源路由。
- [ ] 页面关闭、SSE 重连和 IndexedDB 读取不改变台账/任务。保留现有思考/输入/输出/合计，不新增费用/命中率卡片。
- [ ] 执行共享构建、服务端对应测试、`node --test client/src/components/liveExecution/usage/presentation.test.mjs client/src/lib/storage/llmLiveCache.test.mjs`、`pnpm --filter @ai-novel/client typecheck`。
- [ ] UI 交互验收交给用户；按发布说明技能更新 README/release notes 的“新增”条目，提交本阶段。

## Task 5：正文与验收稳定前缀试点

**Files:**
- Create: `server/src/prompting/core/cache/ContextCacheLayout.ts`、`StructuredHintPlacement.ts`、`index.ts`、`README.md`。
- Modify: `server/src/prompting/core/promptTypes.ts`、`structuredOutputHint.ts`、`promptRunner.ts`（薄调用）。
- Modify: `server/src/prompting/prompts/novel/chapterWriter.prompts.ts`、`chapterAcceptance.prompts.ts`、`context/chapterContextBlocks.ts`、`registry.ts`（明确版本同步）。
- Test: `server/tests/promptCacheLayout.test.js`、`promptCacheTemplateCompatibility.test.js`。

**Interfaces:** `PromptContextBlock` 增加可选 `reuseScope: "book" | "volume" | "request"`，缺省 request；`renderCacheOrderedContextBlocks(context)` 在选定块中按层级与声明顺序渲染，不增删内容。StructuredHintPlacement 只处理资产明确声明的静态骨架。

- [ ] 先构造两个连续章节 fixture：相同书级约束、不同章节编号/任务。断言稳定材料出现在章节信息前；变化只发生在动态尾部。字符前缀只用于离线布局验证，不当作真实缓存命中数。
- [ ] 编辑文风、slots、卷规划后对应文本立即变化；角色位置/状态每章刷新，mixed block 默认动态。不能冻结 book/volume 版本来追求命中。
- [ ] 场景/义务有语义顺序测试保持不变；新增布局不影响 selectedBlockIds/droppedBlockIds/requiredGroups/预算取舍。
- [ ] 实现显式 reuseScope，不用关键词或 regex 判别稳定性；只拆确有结构化来源的混合块。新增 shared 合同字段如有需要必须让 writer/acceptance 同步消费。
- [ ] 将 writer/acceptance 的稳定书级区段先渲染，动态章节标识后置。静态输出格式前移，输入相关 example/note 不误前移，不改变约束优先级。
- [ ] advanced template 走原有消息布局；slots/addendum 保留语义。不得全局重排 raw prompt 或改变 JSON 修复提示。
- [ ] 核对并更新 Prompt version/registry，相关快照只改预期布局，不放宽质量断言；源码文件保持 <=1300 行。
- [ ] 运行 `node --test server/tests/promptCacheLayout.test.js server/tests/promptCacheTemplateCompatibility.test.js server/tests/chapterAcceptanceAssessmentService.test.js server/tests/promptSlotResolution.test.js server/tests/structuredOutputHint.test.js`。构建一次服务端；没有真实模型验证时注明生成质量尚待用户连续章节验收。
- [ ] 更新上下文 module README、`docs/wiki/prompts/llm-input-cache.md`（建立稳定规则），按发布说明技能提交“优化”。

## Task 6：扩展高消耗阶段与显式参数兼容

**Files:**
- Modify: `server/src/prompting/prompts/novel/chapterArtifactDelta.prompts.ts`、`server/src/prompting/prompts/payoff/payoffLedgerSync.prompts.ts`、`server/src/prompting/registry.ts`。
- Create: `server/src/platform/llm/cache/domain/CacheCapabilities.ts`、`infrastructure/CacheRequestAdapter.ts`、`index.ts`、`README.md`。
- Modify: `server/src/llm/factory.ts`、`anthropicClient.ts`、`server/src/prompting/core/promptTypes.ts`（只传明确边界元数据）。
- Test: `server/tests/promptCacheArtifactLayout.test.js`、`llmCacheRequestCompatibility.test.js`。

**Interfaces:** `CacheRequestAdapter` 消费注册 Prompt 声明的稳定边界和已核验 capability；未知模型/自定义通道返回原请求，不发专有参数。该接口不识别创作意图、不选择模型。

```ts
interface PromptCacheBoundary { messageIndex: number; contentBlockIndex: number | null; }
interface CacheCapability {
  protocol: "openai-compatible" | "anthropic";
  mode: "automatic" | "explicit" | "unverified";
  model: string;
}
// adapter 复制请求，不就地改写调用方 messages；只添加对应协议合法字段。
function applyCacheRequestPolicy<T extends Record<string, unknown>>(
  request: T, capability: CacheCapability, boundary: PromptCacheBoundary | null
): T;
```

- [ ] 阅读 `server/src/prompting/prompts/payoff/payoffLedgerSync.prompts.ts` 的 `novel.payoff_ledger.sync` 资产，只修改注册 Prompt，不能服务内新增内联 Prompt。
- [ ] 添加 extraction/ledger fixtures：输出 schema 静态约束稳定；正文、当前资源、角色心智、伏笔账本真实变化时必须更新。测试预算、动态示例和顺序边界。
- [ ] 应用 Task 5 布局，仅携带本阶段所需上下文，不复制 writer 全量上下文。事实提取的输出截断修复另列缺陷任务，本阶段不得声称缓存已解决截断。
- [ ] mock 请求验证：DeepSeek/OpenAI 自动路径不需要增加缓存参数；Claude/百炼显式缓存仅对已核验模型/协议发送合法 cache_control，标记稳定前缀结束位置。
- [ ] 对未知中转、Ollama、未核验模型保持参数原样；400 不自动增加模型重试/移除参数重发。显式策略可在平台配置关闭并于下一次正常调用生效。
- [ ] 先支持默认短 TTL；更长 TTL/费用控制单独规划。Gemini 原生缓存对象管理不在本任务，无原生通道时只返回实际兼容字段。
- [ ] 跑 artifact layout/参数兼容聚焦测试、Anthropic SSE 回归、共享/服务端 build。用户正常授权章节中观察实际数字，不添加预热调用或声称固定收益。
- [ ] 更新平台 cache README、wiki 的协议差异和回退规则；按发布说明技能提交。

## 验证矩阵与交接

| 场景 | 预期 |
|---|---|
| 明确 hit=0 与字段缺失 | 前者显示 0；后者未提供/未记录 |
| Anthropic creation+read | 总输入不漏记、不双记，creation 属于未命中 |
| 断流无 final usage | 已知部分保留，未确认部分未知 |
| 初次+JSON 修复+语义重试 | 每次独立登记，实况按身份去重合计 |
| SSE 重连、重复 final 帧 | 不增加调用/用量/台账 |
| 同 Prompt 跨章与同章修文 | 稳定规则一致，实际正文/状态更新 |
| 用户修改书级设定/模板 | 下一次正常请求使用修改后的内容 |
| 台账查询与运行记录 | 只读，无恢复/取消/重试副作用 |
| 历史未知与混合覆盖 | 不补 0，不伪装完整统计 |
| 章节预算与已暂停第9章 | 总量口径保持实际使用，暂停不自动清除 |
| schema 回退 | 保留新增表和用户数据，仅停用功能接入 |

实施前最后一次核对：官方协议字段、SDK 版本、真实文件名、已有迁移时间戳和运行工作区。执行中独立缺陷修复可先落地，但不能以本计划授权恢复真实数据作业。

完成条件：Tasks 1–4 提供可用统计闭环，Tasks 5–6 提供可回退的前缀优化；定量收益等待正常授权调用证据。开发验证通过与模型生成质量验收分开报告。

规划自审：口径、未知值、流式、多次修复、持久化、新导演归属、UI 只读、动态资产、预算边界、回退、验证均有任务覆盖。该文档阶段只新增规划文件，不更新产品发布说明；wiki 在相关实现落地时更新，避免把计划写成现行规则。

阶段 3 验证：SQLite 增量迁移在临时库保护正文/旧计数；25 项台账、归属、章节预算测试通过。已生成 Prisma Client，未部署到验收库；无隔离 PostgreSQL 实例，PG 迁移仅静态审核。
