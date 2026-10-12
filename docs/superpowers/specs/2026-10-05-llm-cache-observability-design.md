# 模型输入缓存统计与上下文复用设计

日期：2026-10-05。状态：规划完成，尚未实施；本文不表示代码已具备所述能力。

## 目标与范围

让用户在 AI 实况和新导演用量记录中看到两项真实统计：**缓存命中 Tokens**、**缓存未命中 Tokens**。后台按协议归一化厂商返回的数据，覆盖一次性调用、流式调用、修复与重试；随后通过稳定 Prompt 前缀提高连续章节的复用机会。

本轮规划不要求用户理解缓存类型，也不新增缓存开关到开书流程。不展示推测命中了哪些内容，不承诺命中率或节省比例。缓存统计不能改变全自动/半自动模式、人工确认策略、正文保存、质量债务或恢复状态。

不纳入本轮实施：生成结果缓存、自动跳过验收、跨厂商共享缓存、价格表与费用预估、Gemini 显式缓存对象的创建/删除/存储计费、付费预热调用、取消并重发请求以追求命中。

## 当前证据

- 工作区 `D:/code/ai-director-rebuild`，基线 `refactor/director-rebuild@6013efa1`；其他人的 10 份旧计划、交接文档和 `server/_iso.cjs` 必须保留。
- `server/src/llm/usageTracking.ts` 的 `LlmTokenUsageSnapshot` 只有输入、输出、思考和合计；提取器忽略缓存字段，并在选择第一个可用 usage 后停止，可能错过其他 metadata 的缓存明细。
- `server/src/llm/debugLogging.ts` 的流式日志重新组装 usage，只保留基础计数，缓存明细会丢失。
- `server/src/llm/anthropicClient.ts` 的流式路径只转发文字，丢弃 `message_start`、`message_delta` 中的 usage；需要先修复用量采集。
- 当前 `@langchain/openai` 支持将 `prompt_tokens_details.cached_tokens` 映射为 `usage_metadata.input_token_details.cache_read`。SDK 支持不等于上游、中转及当前日志一定返回该字段。
- 新导演正文以 `generationJobId` 跟踪总量，旧 `DirectorLlmUsageRecord` 外键连接旧导演任务/run，不能把新 run ID 写入其中。
- `shared/types/llmLive.ts`、AI 实况、浏览器 IndexedDB 缓存可以承载向后兼容的统计扩展；服务端实况保留短期数据，不能充当持久调用台账。
- writer 请求的 HumanMessage 先出现章节编号和任务，结构化输出骨架追加在动态正文后，限制跨章节前缀复用。
- 第 9 章实际 7 次调用、63234 输入、24624 输出、87858 总 Tokens；事实提取截断后的 JSON 修复额外消耗 9714。缓存不能消除这次输出截断，也不能让总 Tokens 自动下降。

## 方案选择

1. 仅修改 UI：改动小，但拿不到被丢弃的字段，无法跨服务重启查看，否决。
2. 统一用量采集 + 实况 + 独立调用台账 + 分阶段前缀优化：推荐。先拿到可信数字，再通过同阶段复用验证效果。
3. 同时建设费用中心、显式缓存对象管理、结果缓存和全部阶段统一上下文：范围过大，增加过期资产和重复写入风险，留待独立方案。

## 统计契约

在 `shared/types/llmUsage.ts` 定义共享结构，LLM 实况、调用台账 API 消费同一结构：

```ts
export interface LlmInputCacheUsage {
  cacheHitTokens: number | null;
  cacheMissTokens: number | null;
  cacheWriteTokens: number | null; // 内部解释厂商计费与口径，不在基础 UI 展示
  cacheUsageStatus: "reported" | "unavailable" | "invalid";
}
```

规则：

1. `reported` 表示两项均为有限、非负、安全整数，且 `cacheHitTokens + cacheMissTokens === promptTokens`。`cacheWriteTokens` 已包含在未命中中，不可再加进总输入。
2. `unavailable` 表示厂商没返回足够明细、旧记录或流尚未提供输入用量；两项为 null。不能把省略字段视作 0。显式返回命中 0 且总输入有效才允许计算全部未命中。
3. `invalid` 表示负数、非整数、超过安全整数、命中大于输入或多个可信来源冲突；两项为 null，原有合法基础用量保留，并记录不含正文/密钥的诊断原因。
4. 允许使用厂商总输入与明确命中数确定性计算未命中；不使用字符数、上下文相似度、估算 Token 或费用折扣推算。
5. 解码优先读取最终标准化 SDK 基础用量，同时从原始 metadata 补齐同一次调用的缓存信息；不能跨请求、重试或流片段身份拼接。
6. 原始协议语义必须先归一化，不能只根据 UI 厂商名称识别。OpenAI 兼容通道、Anthropic 兼容通道和未来 Gemini 原生通道分别解码。
7. 旧共享类型新增可选 `inputCache?: LlmInputCacheUsage | null`；升级后的写入路径总是写入完整结构，旧 payload 缺字段仍能读取。

### 厂商字段映射

| 实际协议/返回形态 | 命中 | 未命中 | 注意事项 |
|---|---|---|---|
| DeepSeek 原始 usage | `prompt_cache_hit_tokens` | `prompt_cache_miss_tokens`，或总输入减明确命中 | 两字段均存在时校验与 `prompt_tokens` 相等 |
| OpenAI 兼容及 SDK | `prompt_tokens_details.cached_tokens` / `input_tokens_details.cached_tokens` / `input_token_details.cache_read` | 总输入减命中 | 不假定 SDK 一定保留写入信息 |
| Anthropic 原生 | `cache_read_input_tokens` | `input_tokens + cache_creation_input_tokens` | 总输入为 read + creation + input；SDK 已归一化总输入时不能再次加 read/creation |
| 百炼 OpenAI 兼容 | `prompt_tokens_details.cached_tokens`，部分通道 `cached_tokens` | 总输入减命中 | 同名厂商可能走不同协议；创建量不是总输入之外的额外 Token |
| Gemini 原生 generateContent（仅返回适配能力） | `usageMetadata.cachedContentTokenCount` | `promptTokenCount - cachedContentTokenCount` | 当前 factory 走 OpenAI 兼容时只读实际兼容字段，不虚构原生支持 |
| Kimi/GLM/MiniMax/Grok/SiliconFlow/自定义/Ollama | 实际返回的标准兼容字段 | 数据充分时计算 | 未核验专用机制时不加供应商特例，不假定支持显式缓存 |

返回缓存 0 是有效事实；字段缺失是未知。协议不支持也不能伪装成 0。供应商扩展字段的增加属于运行时统计适配，不涉及 AI 意图识别。

### 流式与修复

- 每次物理模型尝试拥有一个 `invocationId`（服务端 UUID）；编号不进入 Prompt。业务重试生成新编号，SSE 重连不会产生新调用。
- batch 如果内部调用已被 invoke 包装观察，外层不得再次登记同一请求。未被底层观察的批量返回逐项登记；一次 HTTP 批量调用也应保留各物理生成尝试的边界，不能把数组求和后伪装成一次单章调用。
- 同一调用的 usage 通常累计返回，取最新有效累计快照，不能逐片段相加；final usage 缺缓存字段时保留此前同次调用的合法缓存明细，但必须与最终输入一致。
- 如果累计计数不合理地倒退或冲突，保留已知合法总量用于原有预算，并把缓存标记 invalid；不能用各字段独立取 max 拼出互相矛盾的缓存组合。
- Anthropic `message_start.message.usage` 保存输入/read/creation，`message_delta.usage` 更新累计输出，合成为 SDK 标准形态；文本片段按原顺序转发，不增加消费方。
- 断流有 usage 时标记 `partial`，没有 usage 时记录调用存在、用量未知；不能称为最终计费量。观察错误不得吞掉原调用错误。
- 同一 Prompt 实况会话可能包含初次调用、JSON 修复和语义重试。台账分别记账，实况显示这些尝试的去重合计。任一尝试缺完整明细，合计显示未知，避免只展示最近一次修复用量。
- 用户打开/关闭实况、切换页、刷新和 SSE 重连均为只读，不发起额外模型调用。

## 模块边界与持久化

新增 `server/src/platform/llm/usage/`：

- `domain/`：协议统计归一化、同次流合并、跨调用完整性汇总，纯函数，不读 DB、不调用模型。
- `application/`：逐次调用观察与结束登记；一次调用一次台账写入。
- `infrastructure/`：Prisma 写入、按 run/job/章节查询，只存统计与身份。
- `index.ts`：稳定门面，旧 `llm/usageTracking.ts` 保留兼容导出和现有业务总量更新责任。

新增 `LlmInvocationUsageRecord`，在 SQLite/PostgreSQL 两套 schema 和迁移中一致定义：

- `id` 使用 invocationId；`runId`、`generationJobId`、`workflowTaskId`、`novelId`、`chapterId`、`stage` 可空字符串；不外键关联旧导演 run。
- `provider`、`model`、`requestProtocol`、`promptId`、`promptVersion`、`status`（completed/partial/failed）、`startedAt`、`finishedAt`。
- 输入、输出、合计可空；`cacheHitTokens`、`cacheMissTokens`、`cacheWriteTokens` 可空；缓存状态和诊断原因。
- 索引 `[runId, startedAt, id]`、`[generationJobId, startedAt, id]`、`[novelId, chapterId, startedAt, id]`。
- 不保存正文、提示词、API Key、URL 凭据或全量原始响应；没有自动删除台账操作。

台账观察与原有预算计数分开：原有 generationJob/task 总量仍由现有跟踪器更新；新台账不得再次 increment。台账写入失败记录诊断、保留业务运行；查询只说明“已记录调用”的覆盖范围，不把未记录历史声称为完整消耗。

新导演规划步骤在 `app/director/productionComposition.ts` 以包装后的 StepRegistry 提供 run/novel/stage 上下文；正文 worker 在 `NovelPipelineExecutor` 用 `directorNext.runId` 显式传递，不能依靠跨进程 AsyncLocalStorage 继承。`modules/director/domain` 不引用 LLM/Prisma，application 不直接 import 外部平台适配器。旧 lane 保留当前归属。

## 查询与展示

在新导演 HTTP dependencies 注入 `readUsage(runId, {cursor, limit})`；新增只读 `GET /api/director-next/runs/:runId/usage`。

- 先查 run contract/control 验证存在与小说归属，再查询；未知 run 返回 404。遵守现有鉴权与部署边界。
- limit 默认 30、最大 100；基于 startedAt+id 的游标，按时间倒序。返回调用明细、后续游标和“已记录调用”的缓存汇总。
- 明细保留调用阶段、模型、状态与两项缓存数。内部保留 covered/unknown/invalid 计数，不新增完整缓存诊断面板。
- 汇总覆盖整个 run 的已记录调用，不是当前分页；一条未知/invalid/partial 输入不能默默当 0。汇总两项为 null，并给出“部分调用未返回缓存统计”的原因。
- 没有记录的旧 run 明确“未记录”；不从 87858 或历史日志猜算。不要把当前模型选择回填历史模型。
- AI 实况折叠/展开记录都显示两项；生成中未返回为“统计中”，结束后缺失为“未提供”，无效为“统计不可用”；历史缓存缺字段为“未记录”。
- 小说导演台增加轻量“调用用量”折叠区域，运行记录提供只读详情/回到导演台；不添加继续、重试、取消等操作到运行记录。
- 保留现有输入、输出、思考、合计，不新增用户未要求的命中率、费用、缓存写入卡片。采用已有无边框行和语义变量。

## 提高命中机会

先以 writer 和 acceptance 做试点，再扩展 artifact extraction/payoff ledger；每一阶段单独稳定模板，不合并不同业务职责的提示词。

请求布局：阶段固定系统规则 → 固定输出约束（仅确定与输入无关部分）→ 必需稳定书级设定/写法 → 必需卷级信息 → 最新状态 → 当前章节编号/任务/正文/修复意见。

关键要求：

1. 缓存布局发生在原有 contextSelection 之后，不改变预算优先级、requiredGroups、冲突处理和资产取舍。
2. 显式声明块的复用层级，默认 request；不按字段名、关键词猜测。一个块混有当前状态时整块按动态处理，必要时通过共享结构化合同拆分。
3. 稳定指相同输入生成相同字节，不代表冻结数据。每次读取最新合法资产，编辑书级设定、用户 slots、模板和卷规划立即进入请求；不会为缓存保留过期角色状态。
4. 同层采用明确展示顺序。只有原来无序的集合可用 stable ID 排序，场景顺序、章节顺序、义务优先级等有语义的数组不能强行排序。
5. 输出骨架、示例、note 有些由输入生成；只把已验证静态部分移到动态正文前。保持规则优先级，不能把 schema 指令提升为高于业务约束。
6. slots/addendum/advanced template 尊重用户模板的布局。无法安全提供缓存边界时，只采集数据、不强行重排。
7. 显式缓存控制独立于用户创作模式。由已核验的协议/模型 capability 决定；未知中转默认不发送扩展参数。先支持 DeepSeek/OpenAI 当前自动路径，Claude/百炼显式缓存作为后续可控试点。
8. 不追加无关世界观、完整历史或占位文本来凑最小缓存长度，不预热、不增加调用次数，不为命中切换模型。

`promptRunner.ts` 当前 1264 行，不能继续堆缓存编排。新增布局与输出提示边界模块到 `prompting/core/cache/`；调用点保持薄接入，如触及 1300 行先按渲染/执行职责抽取。供应商参数归属 `platform/llm/cache/`，不把厂商判断散落到业务 Prompt。

## 与异常用量检查的关系

`promptTokens` 包含命中与未命中；`totalTokens` 仍为厂商实际输入输出总量。不得从 generationJob、章节检查点或 80000 暂停线中扣除缓存命中数。缓存写入也不得重复相加。

本计划不提高暂停阈值、不解除第 9 章暂停。事实提取输出截断与固定阈值误报需要独立修复，并以阶段调用数、重复调用、输出截断等证据制定判断；缓存统计是证据之一，不是恢复命令。

Anthropic 原生总输入补齐属于纠正漏记事实，可能让该协议的实际预算计数增加；必须回归验证，不能以保持旧错误总量为由重复减去缓存。

## 验收与上线

- 离线 fixture 验证五类响应、SDK/raw metadata 补齐、明确 0 与缺失、冲突、非法值、流末 usage、断流、重复累计帧、修复多次调用、SSE 重连去重。
- 同次调用：命中 + 未命中 = 输入；写入属于未命中；思考仍为输出子集。
- 跨调用：真实重试记两次；台账写入重试同 ID 不重复；合计口径明确，对未知覆盖不虚构完整统计。
- 临时 SQLite 验证新增迁移和台账，PostgreSQL 验证迁移语法/已有测试环境。不得指向开发库/验收库运行迁移测试。对已有数据库应用迁移前核对备份。
- UI 用代码级格式化/契约测试和 typecheck；默认不跑浏览器，用户进行交互验收。
- 离线 Prompt fixtures 验证稳定字节、动态信息新鲜度、预算选择、advanced template 保持、没有额外模型请求；不把相同前缀长度称作真实命中。
- 真实收益只在用户之后正常授权的连续章节调用中观察，按同模型/阶段比较实际返回的命中、未命中；统计阶段不添加付费调用。不设未经基线验证的 80%/90% 命中率指标。
- 每阶段独立提交。实施完成更新 wiki/模块 README；用户可见功能完成按发布说明技能更新 README/release notes。规划文档本身不作为产品功能发布。
- 回退先停用 Prompt 布局/显式参数，统计结构保持兼容；新增台账表保留，不通过删表或删数据库回退。不自动解除业务暂停。

## 官方依据（核验日期 2026-10-05）

- [DeepSeek 缓存](https://api-docs.deepseek.com/zh-cn/guides/kv_cache/)：自动前缀复用、hit/miss 字段、尽力而为。
- [OpenAI 缓存](https://developers.openai.com/api/docs/guides/prompt-caching)：cached_tokens、模型相关的保留/边界及写入口径；实施时核验实际使用模型，不能通用写死 TTL。
- [Claude 缓存](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)：read/creation/input 的关系、cache_control、5m/1h。
- [Gemini GenerateContent 缓存](https://ai.google.dev/gemini-api/docs/generate-content/caching)、[返回 schema](https://ai.google.dev/api/generate-content)：原生 cachedContentTokenCount；不等同于 OpenAI 兼容路径。
- [百炼缓存](https://help.aliyun.com/zh/model-studio/context-cache)：兼容协议差异、显式创建和隐式命中。

执行前若厂商文档/实际 SDK 返回变化，更新 fixture 和适配说明，不依赖网页示例中的模型名猜测支持范围。
