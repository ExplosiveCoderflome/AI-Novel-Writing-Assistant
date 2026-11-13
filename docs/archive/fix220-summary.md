# Issue #220 调查与修复结论

## 结论

问题真实存在，但不是所有长流程都丢失了断点。本次确认并修复两条可复现路径：V1 开书候选失败后的恢复入口分流错误，以及 V2 生产内核收到空正文后无法继续同一次运行。

根因分类：实现缺陷，伴随恢复闭环缺口。调查与提交均在当前分支 `fix/issue-220` 完成；没有 push、合并或操作真实小说数据库。

## 调查范围与保存事实

| 路径 | 保存与恢复机制 | 调查结论 |
| --- | --- | --- |
| V1 开书候选 | 工作流任务保存候选阶段、请求、已生成批次；`NovelDirectorCandidateRuntime.continueTask` 可按阶段恢复 | 页面错误调用只支持 V2 的 `opening-retry`；服务端返回 409，而客户端只对 404 尝试旧恢复，因此入口被阻断 |
| V1 已关联小说的导演流程 | `DirectorStateReader` / `DirectorTaskStateWriter` 保存任务状态、恢复位置和自动执行状态；`novelDirectorContinueRuntime` 根据已有资产与阶段继续 | 已有继续与断点恢复实现，不能概括为全流程只能重来；本次不改其规划、章节执行或质量策略 |
| V2 规划 | 控制行保存游标与租约，产物台账保存阶段结果；失败预算耗尽进入人工暂停，显式 `resume` 清除当前停止信号 | 已有按产物跳过成功步骤的机制，现有跨进程恢复与执行器测试覆盖保存后中断 |
| V2 生产内核：空正文 | `ProductionUnitRun` 保存成功的 `prepare` 和空 `draft` 回执，准备产物仍在 | 空结果被映射为 `fail_task`，Run 进入 `failed`；原命令只接受 `paused`，原界面只提供新建运行。同一单元重入又读取空结果而直接失败 |
| V2 未知调用结果、预算和质量暂停 | 单元认领、模型检查点、累计用量、质量暂停分别持久化；导演台已有确认未知结果、追加预算及继续入口 | 沿用既有恢复边界。普通继续不能释放未知认领，质量优先暂停不能由后台解除 |
| 运行记录 | 保存状态、错误和来源地址 | 保持只读；继续或重试放在开书页、本书导演台 |

主要检查代码：`server/src/services/novel/director/commands/`、`runtime/novelDirectorContinueRuntime.ts`、`runtime/novelDirectorCandidateRuntime.ts`、`server/src/modules/director/`、`server/src/modules/production/application/unitExecutor.ts`、`server/src/app/director/productionKernel/`，以及客户端开书控制器和 `components/directorNext/`。

## 基线复现

基线提交：`ebee8eef`。通过 `git show HEAD:<path>` 读取修复前 TypeScript，在内存中编译执行相关映射与命令服务，不切换分支、不覆盖工作树。

- 构造模型返回空正文：首次执行返回 `failed`；再次运行同一单元仍返回 `failed`，调用列表保持 `prepare, draft`，失败步骤不会重试。
- 修复前映射为 `kind=no_usable_content, action=fail_task`。
- 修复前 `resume` 对失败态抛出 `InvalidDirectorCommandError`。
- 原页面无小说 ID 时直接调用 V2 开书重试，与服务端拒绝 V1 的 409 边界相冲突。

这些证据证明恢复能力或入口本身存在缺口，不依赖实际供应商是否再次报错。

## 改动

1. 开书恢复按任务保存的导演版本分流。V1 使用原工作流继续，V2 使用开书重试，不靠 HTTP 错误跨版本探路。
2. 新的空正文失败进入人工恢复暂停，导演台显示“重试当前写作步骤”。
3. 显式重试仅撤回已确认的空 `draft` 结果、阶段结果和回执；保留成功的准备阶段、上下文、模型与策略快照、其他章节、修复次数和累计用量。下一次执行从写作步骤开始。
4. 历史 `failed` 空正文记录复用同一 `resume` API。仓储事务核对未解除的结构化停止事件、失败原因、空正文回执、小说归属、正文基线和同书活跃运行，再恢复原 Run；不创建第二次运行。
5. 失败记录获得恢复动作时，页面显示重试按钮并隐藏新运行表单。安全、完整性失败及未知结果不会被当成空正文释放。
6. 复用现有命令幂等、事务、版本 CAS、租约和生产存储；没有新增依赖、Prompt、数据库字段或迁移。

## 回归测试与验证

新增隔离 SQLite 回归覆盖：

- 新暂停与历史失败均在同一持久化 Run 恢复；断开数据库连接后仍能读取并恢复。
- 准备阶段一次、失败写作重试一次；后续审校、提交和同步继续执行。
- 准备产物、模型/策略快照、其他保存记录和实际用量检查点保持不变。
- 重复命令幂等，不重复撤回结果或登记恢复事件。
- 人工修改正文、安全停止、同书已有另一活跃运行时拒绝操作，事务回滚。

客户端增加 V1/V2 恢复分流测试，并在静态组件测试中验证失败页显示可点击的步骤重试按钮、不展示重新启动表单。

最终验证结果：

| 检查 | 结果 |
| --- | --- |
| `pnpm --filter @ai-novel/shared build` | 通过 |
| `pnpm --filter @ai-novel/server prisma:generate` | 通过，仅生成客户端代码 |
| `pnpm --filter @ai-novel/server build` | 最终代码构建通过 |
| `pnpm --filter @ai-novel/client typecheck` | 通过 |
| `node --test --test-concurrency=2 server/tests/production/unusableDraftRecoverySqlite.test.js server/tests/production/productionKernelRecoverySqlite.test.js` | 22/22 通过 |
| 其他相关服务端测试，11 个文件 | 86/86 通过，覆盖命令事务、导演状态/投影、执行器、跨进程恢复、重试预算、开书入口、生产单元、结果映射和准备恢复 |
| 客户端 5 个文件：`directorFailureRecovery`、`directorOpeningRestoration`、`directorNext`、`directorCommands`、`directorBookEntry` | 15/15 通过；最后补充的失败页按钮/表单断言也随 `directorNext.test.js` 单独复跑，7/7 通过 |
| `node scripts/check-docs-manifest.cjs` | 通过 |
| `git diff --check` / 暂存区检查 | 通过 |

合计相关服务端 108 项、客户端 15 项。初轮现有测试暴露了 3 项未知结果恢复回归：只按缺少原稿判断空响应会误拦历史检查点。修正为明确的空 `draft` 结构化回执后，相关 22 项全部复跑通过。其余 86 项复用同分支、同轮已成功的结果；最后的代码修改仅收紧 `unusableDraft.ts` 的筛选，这 11 个文件覆盖的执行路径不调用该筛选，未重复运行跨进程等较昂贵检查。

首次构建因工作区缺少依赖未启动；随后执行 `pnpm install --frozen-lockfile`，锁文件未变化。新增 SQLite 测试初期的预算、导入与章节写入端口夹具配置已补齐；最终验证无失败项。未运行全仓测试或客户端生产打包，使用以上针对恢复链的检查。

## 文档与验收边界

已更新生产内核恢复模块说明、检查点恢复 wiki、开书恢复排障 wiki，以及发布说明与 README 最新更新。记录的是已知失败/未知结果的区分、同一运行恢复的条件和来源页职责。

测试使用合成模型与临时 SQLite；没有调用收费模型，没有重置、删除或迁移真实数据库。UI 交互验收按仓库规则留给用户；未运行浏览器、截图、Playwright 或桌面打包。实际供应商的网络、余额和模型输出问题仍需在用户明确重试后验证。
