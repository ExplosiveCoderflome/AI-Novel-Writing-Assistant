# 清理前继承规则逐项核对

## 范围与证据口径

对应设计第 10 节、P0 的 `02-inherited-rules.md` 以及计划 00～08。当前分支为 `refactor/director-rebuild`。每项区分业务代码、隔离验证和实际模型/界面验收；测试通过不等于完整生产验收。计划 09 不在本次任务范围内。

2026-10-03 当前服务端构建通过，directorNext、原流水线状态与路线窗口联合检查 221/221；原章节 runtime 和自动修复额度检查 18/18。日志分别为 `server/.tmp/director-recovery-budget-full.log` 和 `server/.tmp/director-inherited-runtime-check.log`。前端本阶段未改动，沿用同分支最近的类型及定向检查；交互由用户验收。

## 规则矩阵

| 规则 | 当前实现和可复验证据 | 当前结论 / 未验证范围 |
| --- | --- | --- |
| R01 命令入队，不等待长任务 | HTTP commandService；`directorNextHttp.test.js` 验证 202，`openRunSwitchSqlite.test.js` 验证未来范围入队时无正文作业、资产读取不写规划 | 代码与完整临时库通过；真实生成响应时延未测 |
| R02 统一正文链 | productionComposition 的 chapter_batch 只接 start/resumePipelineJob；`boundary.test.js` 检查模块外依赖；`batchProcessRecoverySqlite.test.js` 驱动实际批次和原执行器 | 未复制章节生成算法；真实模型链仍待验收 |
| R03 时间线闭合后推进 | 原 ChapterContentFinalizationService 等待 timeline checkpoint；batchOutcome 读取当前正文版本的成功资产边界；`chapterRuntimePipeline.test.js` 验证时间线失败不批准 | 代码级通过；真实生成的时间线保存仍待验收 |
| R04 每章共享一次自动处理 | ChapterAutomaticAttemptService 使用 job/chapter 唯一记录；`automaticAttempt.test.js` 覆盖真实 SQLite 并发、服务重建、失败及取消；原 runtime 限制一次修复 | 18 项原链检查通过；新导演不另建章级修复预算 |
| R05 单章用量保护 | production/usage 持久基线；`chapterUsagePipeline.test.js` 覆盖 80,000 上限、已存正文保留、后续不执行、恢复累计和保存故障 | 代码级通过；供应商实际用量上报未验收 |
| R06 用户正文和编辑保护 | assetInference、guard、GateService 与 PrismaArtifactLedger；完整库比较旧正文，07 变异检查正文不能失效 | 隔离验证通过；真实编辑、局部重算由用户验收 |
| R07 完成优先局部债继续 | 原 ChapterQualityClosure、batchOutcome 与新台账；`novelPipelineState.test.js` 和 chapterBatch 检查局部修复建议继续及债记录 | 结构化测试通过；真实 AI 局部问题样本未验收 |
| R08 全局停止边界 | domain guard/planOrchestrator 消费显式 stopSignal；实际批次读取 replan、不可用内容、安全和完整性结果 | 代码级通过；不得用局部问题文本触发全局重规划 |
| R09 质量优先保存边界暂停 | 冻结 pipelinePolicy、原问题治理和 batchOutcome；chapterBatch、pipelineBridge、businessRecovery 检查人工锁 | 代码级通过；真实质量优先暂停待验收 |
| R10 局部/全局重规划区分 | 原 ChapterQualityClosure 按结构化 scope 处理；新批次仅消费明确全局重规划决定 | 未增加词语推断；实际 AI 重规划样本未验收 |
| R11 统一问题动作及安全强制项 | 复用 shared directorIssue、原 PipelineIssueGovernance；步骤不复制语义分类 | 代码与结构化决定检查通过；真实模型分类未验收 |
| R12 人工锁仅显式恢复 | Worker 排除 paused，自动正文恢复原子保留 pendingManualRecovery，resumeRun 事务清除停止信号并恢复所属作业 | 完整临时库、跨进程和竞态用例通过 |
| R13 纯读取与不可变合同 | readProjection、directorNextReadOnlySqlite、launchInput、commandRepositorySqlite；恢复预算演练新进程配置与旧快照不同仍用旧快照 | 完整库与三进程验证通过；不依赖旧任务 Seed |
| R14 完成只指授权范围 | 原开书投影显示方向已确认；新 Run 的批次范围和进度固定；实际用户 Run chapterRange=null、正文 0 | 实际接口及范围测试通过；不能报告全书已写完 |
| R15 重启/租约恢复 | 已保存产物直接复用，未完成步骤中断与捕获异常共享冻结恢复额度；`recoveryBudgetSqlite.test.js` 三进程验证额度耗尽、零额度、显式恢复和人工锁 | 实现与设计第 12 节自动恢复提案一致；与第 10 节“不静默续跑”字面冲突仍需裁定，不能声明规则全部达成 |
| R16 快速首章路径 | openingOnly 世界、deferred 角色增强、单初始卷骨架、连续 3/5 路线窗口、只细化起始章；productionComposition、chapterRouteWindow、完整库检查 | 代码级通过；实际首章延迟及体验未验收 |
| R17 路线与执行合同分离 | 原 ChapterRouteWindowService 同步保留正文且允许未完整执行合同，ChapterPlanJITService 执行前补齐；章节合同步骤独立 | 源码及路线回归核对；当前没有独立 prefetch 调用，不虚构预取验收 |
| R18 接管默认先规划 | 无 executionRange 合同排除正文三步骤；DirectorStart 默认未勾正文；完整库与 launchInput 检查无正文授权不启动生成 | 代码级通过；实际已有书接管仍待用户验收 |
| R19 界面偏好不是授权 | 宽度和展开偏好仅浏览器保存；Contract 的范围、模型和策略由命令冻结；切换以 handoff 创建同范围快照 | 代码级通过；布局与切换交互仍待用户验收 |
| R20 运行记录只读 | 新历史页只提供来源导航；全局恢复对话框无恢复命令；tasks 来源投影及所属导演写入口冻结 | 前端定向检查及真实 app 完整库验证通过 |
| R21 AI 结构化语义判断 | 步骤复用现有 Prompt Registry，chapter_detail_bundle 消费结构化问题决定；guard 只做结构/权限检查；未知决定拒绝 | 代码级通过；真实 AI 能力和错误恢复仍待验收 |

## 尚未达到的清理前完成条件

1. R15 规范冲突尚未裁定：保留现有按快照额度自动恢复，不能把行为测试作为消除冲突的证据。
2. 原开书 → 新导演规划 → 指定章节正文 → 质量收尾的真实模型运行尚未完成。当前用户书的规划结果不能代替正文验收。
3. 页面实际跳转、阅读资产、确认编辑、范围外正文保护、驾驶方式切换和恢复操作，仍需用户按计划 08 顺序验收。
4. 计划 06 的守卫变异补验已完成：TypeScript 类型守卫捕获第三组件的别名、展开、下标与解构，临时副本新增组件使实际测试断言失败；导演客户端检查 7/7。Agent 运行时工具绕过 HTTP 冻结的缺陷已修复：规划目录排除、历史执行拒绝及缓存定义保护，构建和完整临时库等 9/9。全部来源页旧控制入口仍需核对，书架通用入口和部分主操作仍指向旧页，尚未完成整合。
5. 不进入 09，不清除旧代码或表，不将当前绿色检查标为计划整体完成。Beta 集成与清理发布周期也不以本文件代替。

其余阶段缺口及修复证据见 [清理前核对](2026-10-03-director-pre-retirement-audit.md)。
