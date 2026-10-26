# 计划 05 页面验收故障排查与修复方案

> **执行约定：** 使用 executing-plans 逐项执行；不创建子代理或工作树，不修改冻结目录。用户手动启动后已授权继续修复，代码部分已实施；真实数据库迁移仍独立遵守路线图 G2。

**Goal:** 让正文新内核在结构和模型配置未就绪时提前拒绝执行，保留可读的暂停原因与来源页，并通过内置浏览器完成第 1 章生成、保存和恢复验收。

**Architecture:** 复用既有迁移、prepareOpen、运行控制、事件和来源页恢复接口。app 层检查生产前置条件；director 的只读诊断不依赖生产扩展表；前端将轮询故障放在页面内展示。未知进度保持未知，不降级为旧引擎或虚构完成事实。

**Tech Stack:** TypeScript、Prisma 7、SQLite / PostgreSQL 迁移、React Query、Axios、Node test、Codex 内置浏览器。

**Spec:** `docs/superpowers/specs/2026-10-22-production-kernel-design.md`；`docs/superpowers/plans/2026-10-22-production-kernel-00-roadmap.md`；本轮证据见 `docs/superpowers/reports/production-kernel/05-2026-10-26.md`。

## 约束

- 工作区为 D:/code/ai，分支 refactor/production-kernel；保留全部既有改动。
- V1、短篇及冻结目录零修改，不增加第三方依赖。
- 不重置数据库、不使用 db push 掩盖迁移历史、不删除或覆盖已有正文。
- 编码验证只用新建临时库；真实数据库的连接、备份及迁移需要 G2 明确授权。
- 模型窗口来自准确提供方 / 模型元数据；未知窗口和不可执行输出上限继续拒发。
- 来源页承担恢复操作，运行记录只读；轮询不确认暂停，不自动恢复任务。
- 正式开关默认关闭；浏览器验收可在本次测试进程打开，结束后恢复。
- 不自动提交、推送、合入或发布；本地待提交清单只登记本轮实际产物。

## 1. 排查结论与证据等级

| 问题 | 结论 | 证据与影响 |
| --- | --- | --- |
| 生产进度表缺失 | 已确认，环境 / 部署就绪问题 | 实跑 P2021，ProductionUnitRun 查询失败。两种数据库的 20261022151000_production_unit_run 迁移均已存在，不能归因为未编写迁移。 |
| Web 启动未部署迁移 | 已确认 | 上轮使用 node dist/app.js 启动；ensureRuntimeDatabaseReady 在非 desktop 模式直接返回。编译启动并不升级现有 Web 库。上轮在完成结构就绪检查前打开测试开关，是验收前置检查的遗漏。 |
| 模型窗口配置缺失 | 配置与拒绝行为已确认；尚未读取原始暂停事件作最终归因 | PRODUCTION_KERNEL_MODEL_WINDOWS 未配置；captureKernelModelPolicy 对空窗口表抛出“模型缺少明确的上下文窗口配置。”。两项定向测试重新验证通过，不能认为补表后一定可以写稿。 |
| 暂停读取掩盖原始原因 | 已确认，实现缺陷 | readProductionProjection 选中 kernel 后先读暂停预算；该查询异常使 ProjectionService.get 失败。/runs/:id 用 Promise.all 同时读投影和事件，投影失败后事件也无法返回。 |
| 单条故障拖垮列表 | 已确认，实现缺陷 | /records 用 Promise.all；RecordProjection 仅兼容 FactIntegrityError 和 UnknownPlanVersionError，P2021 继续抛出。 |
| 原始技术错误与弹窗刷屏 | 已确认，实现缺陷 | errorHandler 将未知 Error.message 原样返回；Axios 对轮询 500 自动弹窗。小说页摘要和详情均每 4 秒轮询，详情函数再次请求摘要；这些读取重复放大错误。 |
| 开关关闭不能修复当前测试任务 | 代码证据已确认 | 读取按已保存的批次实现绑定选择；新绑定 kernel 的任务不随环境开关变成 legacy。恢复必须尊重原身份和快照。 |

2026-10-26 用户手动 pnpm dev 后只读核实：Prisma db push 已补齐 ProductionUnitRun 的 14 列、主键、两个索引和两条外键；迁移历史未登记本次增量，结构同步不等同 migrate deploy。原始 execution_failure（seq 4、5）均为“模型缺少明确的上下文窗口配置。”，其后 seq 6 记录重试耗尽暂停。缺表是后续读取故障，未覆盖原始原因。

本轮完成情况：Task 1～3 和 Task 5 已通过，本地相关回归 745/745；用户明确批准关闭全局资料检索后，原作品第 1 章完成 2,928 字、approved/completed、回填成功，刷新/后端重启不重复调用或报告，本书用量 44 次 / 272,756 Tokens。保留 1 项写法检查未完成提醒。Task 4 的真实迁移属于独立运维门槛，本轮不执行；用户手动 pnpm dev 已同步实际开发结构，不能冒称迁移历史部署成功。检索开启的真实服务场景仍待外部额度恢复。

主因分类：运行前置条件未完成，叠加状态读取与错误呈现缺少故障隔离。模型认证可正常使用；本书已记录 37 次真实调用，不需要重新向用户索取 API 密钥。

## 2. 修复顺序

1. 恢复独立诊断与逐条运行记录，读取原始暂停事件。
2. 增加正文提交与恢复前的只读就绪检查。
3. 收口公共错误信息及轮询提示，保留已保存的作品资料。
4. 在授权范围内完成一致性备份、迁移副本演练和模型能力配置；最后才处理真实库。
5. 从现有测试作品的第 1 章继续内置浏览器验收，避免重新开书消耗。

### Task 1：独立诊断、状态读取与列表隔离

**Files:**
- Create: `shared/types/director/runtimeStatus.ts`
- Create: `server/src/modules/director/application/diagnostics/index.ts`
- Create: `server/src/modules/director/application/diagnostics/runStatus.ts`
- Create: `server/src/modules/director/application/diagnostics/errors.ts`
- Modify: `server/src/modules/director/application/index.ts`
- Modify: `server/src/modules/director/application/recordProjection.ts`
- Modify: `server/src/modules/director/http/routes.ts`
- Modify: `server/src/app/director/projections/productionProgress.ts`
- Test: `server/tests/directorNext/application/runtimeDiagnosticsSqlite.test.js`
- Test: `server/tests/directorNext/http/directorNextHttp.test.js`

**接口约定：** 新增只读 GET `/novels/:novelId/runtime-status`。使用现有 readCurrentRunId、getContract、getControl 和 eventLog.list，核对契约归属后返回；不调用完整生产投影，不查询 ProductionUnitRun，不写库。

```ts
export interface DirectorRuntimeStatus {
  runId: string;
  novelId: string;
  status: 'queued' | 'running' | 'waiting_gate' | 'paused' | 'completed' | 'failed' | 'cancelled';
  controlVersion: number;
  pause: {kind: 'manual_recovery' | 'replan' | 'safety'; reason: string} | null;
  lastFailure: {stepId: string | null; message: string; createdAt: string} | null;
  sourceRoute: string;
}

export class DirectorProjectionUnavailableError extends Error {
  readonly statusCode = 503;
  readonly code = 'director_projection_unavailable';
  constructor(readonly reasonCode: 'production_storage_not_ready') {
    super('创作服务尚未完成准备，本书内容已保留。请完成服务配置后重新检查。');
  }
}
```

状态类型置于 shared 文件，错误类置于 director application 文件，并通过 application/index.ts 导出。app 只把已识别的结构未就绪错误转换成该类；未知异常仍记录并明确标记不可读取，不按文字匹配错误。失败消息经过公开消息映射；完整异常只写服务器诊断日志。不得把完整 contract、模型参数或原始事件 payload 整体暴露给页面。没有可靠控制记录时返回读取失败，不生成伪状态。

- [x] 先增加反例：完整生产投影抛出缺表错误，独立诊断仍能返回真实 paused、控制版本与来源路由；读取前后数据库内容不变。
- [x] 增加列表反例：一条扩展投影失败，另一条正常记录仍可读取；故障项明确显示“进度暂不可读”，不标记完成或 0% 进度。
- [x] 对 app 层识别的前置条件故障使用具名的投影不可用错误；RecordProjection 从真实 contract/control 构建只读故障记录，复用现有完整性故障处理方式。
- [x] /records 改为逐条收集结果。无法取得可靠身份的失败项通过响应 warnings 显示，不静默丢弃；数据库整体不可用时仍返回明确错误。
- [x] 原始暂停原因与扩展预算读取错误分开展示，不用后者覆盖 control.pause.reason。
- [x] 运行并确认定向测试通过：

```powershell
node --test tests/directorNext/application/runtimeDiagnosticsSqlite.test.js tests/directorNext/http/directorNextHttp.test.js
```

后端 /records 保留原有成功数据数组，附加可选 warnings；前端在 Task 3 消费。新诊断接口不返回继续、重试等授权动作，已有命令校验继续作为唯一写入口。

### Task 2：新内核提交与恢复的前置检查

**Files:**
- Create: `server/src/app/director/productionKernel/readiness/index.ts`
- Create: `server/src/app/director/productionKernel/readiness/storage.ts`
- Create: `server/src/app/director/productionKernel/readiness/models.ts`
- Modify: `server/src/app/director/productionKernel/index.ts`
- Modify: `server/src/app/director/productionComposition.ts`
- Modify: `server/src/app/director/productionKernel/batch/step.ts`
- Modify: `server/src/app/director/productionKernel/recovery/commands.ts`
- Test: `server/tests/production/productionKernelReadinessSqlite.test.js`
- Modify: `server/scripts/run-tests.cjs`，登记新增 SQLite 测试。

**接口约定：** `inspectProductionStorage(db, provider)` 检查必要表、列、唯一约束和外键，返回明确结果；`inspectKernelStartReadiness(db, contract, sources?)` 组合存储与模型配置检查。检查不执行迁移、不构造 SDK、不发探测请求。

```ts
type KernelReadinessIssue = {
  code: 'production_storage_not_ready' | 'production_model_capability_missing';
  message: string; // 可公开的操作提示
};
type KernelReadiness = {ready: true} | {ready: false; issues: KernelReadinessIssue[]};
```

- [x] 使用既有临时库 fixture，删除该临时库的 ProductionUnitRun 后验证检查返回 storage_not_ready；业务库不作为反例夹具。
- [x] 验证缺列 / 唯一索引缺失也被拒绝；完整迁移结构通过。连接失败不得伪装成“表已就绪”。
- [x] 复用 captureKernelModelPolicy 和原生有效配置解析，检查准确 provider/model 的主备窗口、六类任务的配置输出上限。空元数据不能被按型号猜测补齐。
- [x] 在既有 prepareOpen 中，当本次授权包含 chapter_batch 且新批次将选择 kernel 时，于任何付费准备阶段之前拒绝未就绪请求。不改变准备专用任务或已绑定 legacy 的路径。
- [x] 已绑定 kernel 的批次入口及显式恢复也检查就绪条件，不能因环境开关关闭而绕过。保持原 worker 租约、正文版本、范围、策略与模型快照围栏。
- [x] 保持 CommandService 已有命令重放顺序，不能把新检查放在幂等命令查询之前，导致已成功命令重放被新配置拒绝。
- [x] 早期检查只证明部署和配置前置满足；每次物理调用的完整输入 / 输出 / 纠错预算预检继续保留。

TDD 核心反例使用现有 fixture，不新增产品测试开关：

```js
const {fixture} = require('./batch/fixture.cjs');
const {inspectProductionStorage} = require('../../dist/app/director/productionKernel');
test('missing production storage is rejected before paid preparation', async t => {
  const f = await fixture(t);
  await f.db.$executeRawUnsafe('DROP TABLE "ProductionUnitRun"'); // 仅 fixture 临时库
  const result = await inspectProductionStorage(f.db, 'sqlite');
  assert.equal(result.ready, false);
  assert.equal(result.issues[0].code, 'production_storage_not_ready');
});
```

另通过真实 command / step 装配验证 paid preparation spy 调用为 0，不能只测试一个未接入入口的检查函数。

```powershell
node --test tests/production/productionKernelReadinessSqlite.test.js tests/production/productionKernelModelPolicySqlite.test.js tests/production/productionKernelRecoverySqlite.test.js
```

### Task 3：安全错误响应、页面内错误和轮询收敛

**Files:**
- Modify: `shared/types/api.ts`
- Modify: `server/src/middleware/errorHandler.ts`
- Modify: `server/src/modules/director/http/routes.ts`
- Modify: `client/src/api/client.ts`
- Modify: `client/src/api/directorNext.ts`
- Modify: `client/src/api/queryKeys.ts`
- Modify: `client/src/pages/directorNext/DirectorNovelPage.tsx`
- Modify: `client/src/pages/directorNext/DirectorRunHistoryPage.tsx`
- Test: `server/tests/errorHandler.test.js`
- Test: `client/tests/directorPollingErrors.test.js`
- Test: `client/src/pages/directorNext/polling.test.mjs`

用户 2026-10-26 补充授权：单次输出额度由设置页调整，未填写时默认 8192，不设固定提供商行政上限。涉及 shared/types/llm.ts、llm/modelRouter.ts、llm/structuredFallbackSettings.ts、routes/llm.ts、ModelRouteFields.tsx，以及 modelRouter / modelRouteSettings 测试。实际模型上下文和协议有效性检查继续保留；没有强制写入六条全局路由。

- [x] 增加错误响应测试：未知 Error 含 ORM 调用、绝对路径和伪密钥时，响应不包含这些内容；服务器日志保留可关联的诊断编号。既有 Zod 与已明确允许公开的 AppError 提示保持可用。
- [x] ApiResponse 增加可选 `code?: string`、`requestId?: string`；前置条件故障返回稳定错误码和安全提示。按代码分流，不从异常文字判断恢复权限。
- [x] Axios 请求配置增加 `errorPresentation?: 'toast' | 'inline'`，默认 toast；导演轮询读取显式使用 inline。Promise 仍拒绝，页面能保留错误状态；命令提交错误仍正常提示。
- [x] 摘要为唯一当前运行入口；详情依赖已取得的 runId，使用 getDirectorRunDetail(runId)，查询键包含 runId。移除详情内重复获取摘要的调用链。
- [x] 前置条件未就绪时停止固定周期重试，显示“重新检查”；短暂网络故障采用有限退避。保留已保存的书稿/规划，不把陈旧的正在生成状态当作最新状态。
- [x] 完整投影失败时读取 Task 1 的 runtime-status，展示真实暂停和诊断摘要；未就绪时只提供只读重查、查看资料和返回来源页，不虚构可恢复授权。
- [x] 运行列表显示逐条故障和成功记录，维持只读定位；不能把恢复按钮放进运行记录。
- [x] 内置浏览器经本地隔离故障代理连续 3 次读取失败：仅导演台页内错误、0 toast；第 4 次重查恢复 completed。一次提交失败产生 1 个 toast 及表单错误。代理拒绝所有写请求，实际转发写入数 0；保留截图/AX 与计数证据，结束后关闭代理。该测试是实际正常生成之后的故障注入补充。

```powershell
node --test tests/errorHandler.test.js tests/directorNext/http/directorNextHttp.test.js
pnpm --filter @ai-novel/client test
```

用户提示说明结果及下一步，例如“创作服务尚未完成准备，本书内容已保留。请联系维护人员完成配置后重新检查。”不要求写作新手理解表名、Prisma 或环境变量。

### Task 4：迁移与模型配置就绪——独立运维验收

**Existing files:**
- `server/src/prisma/migrations.sqlite/20261022151000_production_unit_run/migration.sql`
- `server/src/prisma/migrations/20261022151000_production_unit_run/migration.sql`
- `server/prisma.config.ts`
- `server/src/app/director/productionKernel/modelPolicy/README.md`
- `docs/wiki/debugging/database-migration-drift.md`
- `server/tests/prismaMigrationCompleteness.test.js`

本任务不是“立即对业务库运行命令”。真实数据库操作须经 G2 授权，且在下面的准备结果可审阅之后执行。**本轮适用性：** 用户手动 pnpm dev 已同步开发结构，经只读检查可运行；下面未勾选的备份/真实迁移条目为条件性运维工作，不是已执行结果，也不是本轮首章写作验收的前置。正式部署仍须完成这些门槛。PostgreSQL 无真实执行条件，明确未实跑。

- [ ] 在临时数据库验证现有 SQLite / PostgreSQL 迁移结构；覆盖空库、历史结构升级、部分对象存在及索引缺失。没有真实 PostgreSQL 验证条件时明确记录未实跑，不将 SQLite 结果替代。
- [ ] 经授权后，对实际数据库建立一致性备份；SQLite 使用 backup API，不能仅复制活跃 .db 而遗漏 WAL。可复用 prune-snapshots.cjs 中 backup + 校验的做法，不执行其清理命令。
- [ ] 核实备份路径、文件大小，恢复到独立副本并运行 integrity_check / foreign_key_check；比较书章行数及正文哈希，不在公开报告复制正文或密钥。
- [ ] 在副本核对 _prisma_migrations 与现有结构。只有基线和待部署序列一致时才使用 prisma:deploy；基线不明时先提交明确的基线修复方案，不能猜测 resolve --applied 或重放全部历史 SQL。
- [ ] 迁移复用已有 ProductionUnitRun SQL，保持增量。已有同名但结构不符的对象应停止并报告，不用 CREATE IF NOT EXISTS 直接视为成功，不运行 db reset / db push。
- [x] 核实 deepseek / deepseek-flash 及启用备用模型的准确上下文窗口与原生请求输出上限，来源为提供方明确元数据或可验证的维护配置；记录来源和版本，不凭名称填写。当前未启用备用；另补 SiliconFlow 准确 embedding 窗口，官方来源见当日报告。
- [x] 按已存在的 PRODUCTION_KERNEL_MODEL_WINDOWS 配置合同，在验收进程提供准确元数据；配置检查只保留能力值与摘要，不记录凭据或端点原文。
- [ ] 副本演练通过并获真实迁移批准后，再应用相同部署序列；迁移后重复结构、完整性、正文哈希和只读来源页检查。

已有核验只证明：新增迁移能在隔离的最小旧结构上建表、建立两条外键和两个索引，并保留合成正文；它不证明实际业务库的历史基线已经正确。

### Task 5：恢复现场并完成内置浏览器验收

**Case:** `director-opening-book-cmvokmv0c0000vovnoimoj1zm`，只处理第 1 章。

- [x] 从新诊断入口读取本次 run 的真实暂停原因、最后 execution_failure 和批次模型绑定情况，补齐排查报告。
- [x] 若模型策略尚未绑定，在原运行的显式恢复流程重试；若已经绑定，先核对/恢复匹配配置。不得覆盖冻结快照；确需新运行时仅复用本书既有准备资源，保留原运行及用量。已沿原 run 恢复并保存 1 份模型策略；未覆盖快照。
- [x] 就绪检查通过后，在测试进程开启新内核；通过页面确认第 1—1 章范围，执行唯一一次提交或显式恢复。
- [x] 核实正文生成、审校、最终选稿保存和回填，记录真实 ProductionUnitRun 及批次绑定证据；不能仅以“导演 V2”标签或调用成功判断完成。
- [x] 刷新页面和重启进程，正文、审校与进度保持；已完成范围不重复生成、不重复报告、不增加模型调用。
- [x] 实际暂停来源页恢复可达、列表保持只读；列表故障隔离及人工编辑拒绝覆盖由临时库真实处理器回归验证，未为测试修改用户正文。
- [x] 保存正文、终态和用量截图；确认未知调用不自动重发，正式默认开关保持关闭。

## 3. 执行核验与收尾

- [x] Task 1～3 各自先看到反例失败再最小修复，禁止只改变测试夹具使结果通过。
- [x] 代码修改后构建 shared / server，并运行上述定向测试；当前真实状态/恢复合同有变化，定向通过后运行 production 与 directorNext 集合。最新 745/745 含执行范围；客户端未再修改，沿用本轮 371/371 和类型检查。
- [x] 检查代码政策、导入边界、文档 manifest、差异格式、冻结目录和暂存范围。
- [x] 更新 productionKernel 各 README 中“尚未安装 productionComposition”等与现状不符的旧说明，保持配置前置、默认关闭和未完成范围一致。
- [x] 同步本轮验收报告、迁移排障 wiki、中央 production-kernel 记录和本地功能清单。

## 4. 完成标准

1. 缺表 / 缺窗口 / 缺有效输出上限时，在新的付费正文准备调用前给出明确拒绝。
2. 原始暂停原因可读，单条异常不拖垮整个列表，没有 ORM 栈和重复弹窗。
3. 需要正式迁移时，必须有备份、副本演练及数据保留证据，真实库操作经过单独授权。本轮仅核实用户已同步的开发结构，不声明正式迁移或 PostgreSQL 验收完成。
4. 同一测试作品在内置浏览器完成第 1 章的写稿、审校、保存、回填和重启复用。
5. RAG / 空伏笔账本边界已有批准后的实现与隔离验证；真实页面在用户批准的关闭检索配置下完成，573 项规则/决策映射待审为 0。检索开启的真实提供方场景另列外部待验，06～08 和正式迁移/发布不因此视为完成。
