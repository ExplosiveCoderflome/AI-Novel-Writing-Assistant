# 自动导演阶段三返工记录（2026-09-29）

## 范围与状态

依据 [独立验收报告](auto-director-stage3-acceptance-2026-09-29.md) 的 3-1～3-9、R3/S2 和对账日志缺口执行返工。用户已授权修复、分批提交、不推送。执行分支 `refactor/director-simplification`，返工起点 `eb4fcee7`。

**当前为返工进行中；不表示阶段三已通过复验。** 最终验收仍要求完整 fast、integration 的失败身份对照、类型检查和所有边界回归。

| 批次 | 对应问题 | 状态 |
| --- | --- | --- |
| 1 状态写入边界 | 3-4、3-6、3-9；候选/重试语义写入口 | 34/34 通过，独立审查及追加复审通过 |
| 2 启动与章节执行 | 3-1、3-2；S2 原模式及小说身份覆盖 | 实现、定向验证及主控复核完成；完整套件待批次 5 |
| 3 有效输入与消费者 | 3-3、3-5；R3 真实读取收敛 | 待执行 |
| 4 命令与剩余写入 | 3-7、3-8；事实对账日志 | 待执行 |
| 5 完整复验 | 不变量、Guard、编译、typecheck、完整套件、wiki/台账 | 待执行 |

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

新鲜 server 编译通过。定向 fast 四文件 76 项中 75 通过；唯一失败是直接基点也存在的 `novelDirectorConfirmDedup.test.js` 缺 DeepSeek API Key。重试 integration 单文件 16/16 通过。创作承接方案的追加回归先 4/5、修复后 5/5；完整 fast/integration 与基点的最终对照将在全部返工批次结束后执行。本批尚不代表阶段三复验通过。
