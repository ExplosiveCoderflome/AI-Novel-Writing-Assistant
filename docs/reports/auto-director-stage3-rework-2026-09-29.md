# 自动导演阶段三返工记录（2026-09-29）

## 范围与状态

依据 [独立验收报告](auto-director-stage3-acceptance-2026-09-29.md) 的 3-1～3-9、R3/S2 和对账日志缺口执行返工。用户已授权修复、分批提交、不推送。执行分支 `refactor/director-simplification`，返工起点 `eb4fcee7`。

**返工实现与补充复验已完成；用户复验指出的最后一项测试失败已关闭，满足本次阶段三放行条件。** Guard、全仓类型检查及完整 fast/integration 的验证记录见下文；独立代码审阅尚未执行，阶段四的人工动作表决策仍需单独确认。

| 批次 | 对应问题 | 状态 |
| --- | --- | --- |
| 1 状态写入边界 | 3-4、3-6、3-9；候选/重试语义写入口 | 34/34 通过，独立审查及追加复审通过 |
| 2 启动与章节执行 | 3-1、3-2；S2 原模式及小说身份覆盖 | 实现、定向验证及主控复核完成；完整套件待批次 5 |
| 3 有效输入与消费者 | 3-3、3-5；R3 真实读取收敛 | 实现与定向验证完成；完整套件待批次 5 |
| 4 命令与剩余写入 | 3-7、3-8；事实对账日志 | 实现与定向验证完成；完整套件待批次 5 |
| 5 完整复验 | 不变量、Guard、编译、typecheck、完整套件、wiki/台账 | 自动化复验完成；独立代码审阅未执行 |

## 批次 1：状态写入边界

### 原因与修复

- 新运行态方法直接传任务列数据，绕过旧方法的人工锁检查。所有单条、批量及兼容视图更新共用检查，拒绝 false 和 Prisma `{ set: false }`；只有专用清锁方法接受持久用户命令编号。
- 拆分任务视图总会生成 `resumeTarget`，不能据拆分结果判断调用者是否提供恢复目标。改为检查原始输入，省略保留任务列、明确 null 清空、对象替换。
- 启动合同的缺失字段只允许在明确未关联小说的候选任务首次定稿时补齐；已关联任务拒绝补写。候选整体定稿还必须满足 `auto_director + novelId=null`，即使新旧输入相同也不允许已关联任务利用该例外。
- 接管/候选整体替换原先在 Writer 与工作流 bootstrap 两层合并，旧字段仍会留下。Writer 构造完整状态，bootstrap 使用内部第二参数执行实际 JSON 替换；HTTP 参数契约没有增加替换能力。运行进度继续保留，省略的旧启动字段被删除。
- 增加 `markCandidateSelectionRequired` 和 `retryTask` 语义入口，委托既有工作流实现；调用方迁移属于批次 4。

### 验证

先新增行为回归，再运行当前代码：31 项中 18 通过、13 项按预期失败。修复后 `pnpm --filter @ai-novel/server build` exit 0，同组 31/31 通过。独立审查补出候选延后关联时提前返回的持久化边界：追加回归共 34 项，修复前 32 通过、2 项按预期失败；重新编译后 34/34 通过。替换完整启动合同会保存新状态，同时保留 `novelId=null` 的延后关联规则；普通 bootstrap 对照行为保持一致。现有不变量断言保留；缺字段场景显式标明未关联小说，另增已关联拒绝场景。首轮 Guard 12/12 通过，最终批次会再次核验完整守卫。

命令：

```text
node server/.tmp/stage3-acceptance-run.cjs D:/code/ai/server fast stage3-rework-task1-red directorTaskStateWriter.test.js,directorLaunchContractImmutable.test.js
node server/.tmp/stage3-acceptance-run.cjs D:/code/ai/server fast stage3-rework-task1-green directorTaskStateWriter.test.js,directorLaunchContractImmutable.test.js
node server/.tmp/stage3-acceptance-run.cjs D:/code/ai/server fast stage3-rework-task1-deferred-red directorTaskStateWriter.test.js,directorLaunchContractImmutable.test.js
node server/.tmp/stage3-acceptance-run.cjs D:/code/ai/server fast stage3-rework-task1-deferred-green directorTaskStateWriter.test.js,directorLaunchContractImmutable.test.js
```

产物：`server/.tmp/stage3-rework-task1-{red,green}-fast.{xml,json,sqlite}`。测试使用新建隔离库并保留清理产物；这两份内存测试在加载服务图前拦截 Prisma，实际工作流 bootstrap 的合并/替换规则保持真实，只替换持久化适配器。完整套件留在所有返工批次之后执行。

现有 runtime wiki 已规定上述长期边界，本批没有引入新规则，暂不重复编辑 wiki。属于尚未发布的阶段三内部收敛返工，跳过发布说明及 README。

## 批次 2：启动确认与章节执行

确认运行时在创建权领取后解析完整开书输入，并在关联小说前定稿启动合同；关联后的会话与恢复进度只更新运行态。重复确认保留已绑定任务或正在创建任务的合同，仍交由命令接受入口处理复用。章节执行同步保存有效模式、章节游标与恢复位置，不重新初始化启动合同。原 `auto_to_execution` 模式和同一本小说身份断言已恢复，另有独立全书模式用例。

主控复核还发现整体定稿会清除候选 Seed 中已采用的创作承接方案。追加的完整确认链测试先复现该缺失，随后将已验证方案纳入最终合同，关联前后均保持相同方案。

新鲜 server 编译通过。定向 fast 四文件 76 项中 75 通过；`novelDirectorConfirmDedup.test.js` 当时在缺少 DeepSeek API Key 的执行环境中提前失败，因此未覆盖确认链后段的测试替身缺口，不能据此认定该项在有密钥的环境中也属于基点失败。重试 integration 单文件 16/16 通过。创作承接方案的追加回归先 4/5、修复后 5/5；完整 fast/integration 与基点的最终对照将在全部返工批次结束后执行。本批尚不代表阶段三复验通过。

## 批次 3 第一片：有效步骤输入与替换关系

步骤模块改用 Reader 的有效任务视图读取请求，运行态校准、创作界面选择和模型覆盖叠加后再送入生成步骤，冻结的启动合同保持原值。替换任务编号由 Reader 兼容旧顶层字段与新 `takeover` 字段，跟进列表、事件构造和通知共享同一解析边界。新增回归先复现模型覆盖与嵌套替换缺失，修复后相关 fast 25/25 通过，新鲜 server 编译通过。

## 批次 3 第二片：R3 真实投影收敛

书级轮询改用 `detailCompact`，精简状态由 Reader 从标准启动/运行分区形成；任务适配器不再直接解析原始 JSON 来裁剪投影。完整详情仍保留原始载荷展示语义，当前模型从有效运行视图计算。原有重载选项 `seedPayloadMode` 和同义别名 `directorTaskDataMode` 均移除，守卫规则及基线没有调整。精简详情回归 8/8 通过；继续路由的当前任务断言通过，另一项 `novelWorkflowContinue` 失败与基点同名。新鲜 server 编译、Guard 12/12 通过。完整 fast/integration 身份对照留在批次 5；本批仍不代表阶段三验收通过。

## 批次 4：命令接受、重试与事实对账

普通命令创建与任务接受收成同一个串行化事务。任务在入队窗口进入人工恢复锁时，状态更新计数为零会回滚命令并返回冲突，不再通知 Worker 或伪报已接受；显式恢复仍以持久命令编号在事务内清锁。候选选择、命令重试及运行记录重试走状态写入器的语义入口，非导演任务仍走原工作流入口。模型重试覆盖保存在运行态 `llmOverride`，启动合同的模型和创作输入保持原样，Reader 负责合成有效模型。门禁审批和失败步骤的事实对账成功后记录任务编号与固定类别，不输出内容、种子或错误详情。

回归先复现命令竞态 40/41、模型覆盖 22/23、事实对账日志 6/8（另有 1 项跳过）以及运行记录重试 7/8；修复并重新编译后分别为 41/41、23/23、8/8（另有 1 项跳过）和 8/8。候选相关 fast 四文件 13/13、重试 integration 单文件 16/16 通过。测试均使用隔离 SQLite；完整 fast/integration 失败身份对照留在批次 5。

## 批次 5：完整自动化复验

验收对象 `abeb5158`；与独立验收相同的直接基点 `d3a9ca99`、Node `v24.20.0`、`NODE_ENV=test`、`RAG_ENABLED=false` 和 103 个 SQLite migration SQL。重新执行 shared/server 编译、`pnpm typecheck`，均 exit 0；Guard 12/12。核心 fast 五文件 92 项通过、1 项跳过；候选相关四文件 13/13；重试 integration 16/16。

| 套件 | 直接基点：总数/通过/失败/跳过 | 当前：总数/通过/失败/跳过 | 按文件＋用例名新增失败 | 基点失败消失 |
| --- | --- | --- | ---: | ---: |
| fast | 1393/1341/40/12 | 1484/1432/40/12 | 0 | 0 |
| integration | 144/132/10/2 | 144/132/10/2 | 0 | 0 |

两套失败身份清单逐项一致；历史失败的具体名单见[独立验收报告](auto-director-stage3-acceptance-2026-09-29.md)。当前报告保留在 `server/.tmp/stage3-rework-task5-full-fast-fast.xml` 与 `server/.tmp/stage3-rework-task5-full-integration-integration.xml`，基点报告分别为 `D:/code/ai-baseline-d3a9ca99/server/.tmp/stage3-acceptance-baseline-20260929-{fast,integration}.xml`。比较使用 `server/.tmp/stage3-acceptance-compare.cjs`，同时核对新增失败与基点失败消失；完整套件退出码为 1 是上述历史失败，并非全部通过。

本批仅写验收记录；长期边界已写入 auto-director runtime wiki，没有新增其他稳定规则。代码审阅由本次执行者自行检查关键调用链与 diff；受项目子代理授权规则限制，未启动独立审阅者，故本报告只给出自动化复验结论，不冒称独立代码审阅已完成。既有 60 秒 Worker 对账窗口维持已批准边界，阶段四动作表仍需用户确认。

## 补充返工：确认开书测试的环境遮蔽（2026-09-30）

用户在有模型密钥的环境，以 `150777b7` 对照阶段 1 终点 `6013eb31`，发现 fast 新增一项失败：`novelDirectorConfirmDedup.test.js` 的“通过标准运行节点创建小说”。模型请求成功后，测试内手写的工作流服务替身缺少 `getTaskById`，导致状态写入器在实际持久化阶段报错。前述“基点也存在、仅因缺少密钥”的归因只描述了执行者环境的提前失败，不能解释此项新增失败；上面的完整套件对照也仅能证明该无密钥环境下失败身份一致。

将此测试的资源推荐和平台资料改为固定测试返回，明确选择平台并阻止结构化模型调用；测试不再依赖外部密钥。工作流替身现在保存可读、可更新的任务行，支持 `getTaskById` 与 `updateTaskWithRetry`，关联小说时同步任务行。原有创建节点、任务状态和小说关联断言保留，并追加关联及运行阶段落盘断言。隔离库定向复现：模型调用被隔离后 2/3 通过，失败定位为缺少任务读取；补齐后 3/3 通过。此补充只修测试契约与验收记录，没有修改生产运行逻辑。

使用非空的无效测试密钥重复定向验证仍为 3/3 通过；结构化模型入口若被调用会立即抛错。完整 fast 重新运行结果为 1484/1433 通过/39 失败/12 跳过，与同环境直接基点 `d3a9ca99` 的 1393/1341/40/12 按“文件＋用例名”比较，新增失败：无；减少的失败仅为上述确认开书用例。报告产物：`server/.tmp/stage3-confirm-dedup-{red,green2,key-independent,full-fast}-fast.xml`。该结果没有冒称在用户环境重跑 `6013eb31`；用户此前以该终点对照发现的新增失败，已由同名用例稳定通过关闭。

本轮仅修改测试与报告，复用 `abeb5158` 上通过的 shared/server 编译、全仓 typecheck、Guard 12/12，以及 `stage3-rework-task5-full-integration-integration.xml` 的完整 integration 144/132/10/2；这些生产路径未被本轮改动影响。用户环境 integration 保持历史 6 项失败的结果来自用户复验，不能与执行者环境的 10 项混写。测试替身修正未引入新的长期架构规则，无新增 wiki 价值；发布说明和 README 不记录这项纯内部测试修复。阶段四草稿及开书页未提交改动不属于此次验证范围。
