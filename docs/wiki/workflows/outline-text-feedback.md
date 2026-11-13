# 章节摘要反馈工作大纲

## 背景与边界

大纲开书需要把写作结果带回后续规划，同时保证初学者可以继续完成全书。反馈属于 planning/outline 的应用能力，不能成为导演质量门禁，也不能接管原稿修订流程。

- 只有 `OutlineBookBinding` 存在且小说、工作大纲都不属于 `ManuscriptProject` 时允许分析。
- 摘要落库后，仅通知小说 ID 与章节 ID。分析入口查询 `ChapterSummary.summary`，不查询章节正文，也不使用含上一章正文的 `readOutlinePlanningState`。
- 调用注册资产 `outline.text_feedback@v1` 时退出生成链的 required-context scope，避免 AsyncLocalStorage 把正文上下文带入反馈。后续维护不得添加正文、RAG 或完整生成上下文。
- 默认逐章触发，也可按每 N 章、卷槽位末章或关闭。手动分析可以越过频率设置。
- 摘要最多 3,000 字符，相关节点最多后续 8 章、8 人物、8 伏笔，节点总 JSON 不超过 12,000 字符；最多输出 12 个独立字段调整。模型由正常 provider/model 设置选择。

## 状态与恢复

设置保存在绑定的 `feedbackSettingsJson`；`OutlineFeedbackRun` 持久化输入快照、尝试次数、错误及逐项决定。摘要保存后异步调度，分析失败不会向生成调用抛错。运行状态为 pending → running → completed/failed。

自动请求按项目、章节、摘要去重；手动请求使用项目范围内 requestKey。pending 可重新调度，failed 可显式重试；running 超过十分钟可显式重试以恢复进程中断。attempt 是完成写入的 fencing 条件，旧尝试不能覆盖新尝试。当前使用进程内调度，重启后通过相同请求或重试恢复，不依赖导演恢复任务。

## 逐项采纳合同

每个独立建议对应一条 A1 `OutlineProposal`，kind 为 text_feedback。通用 A1 apply/reject 拒绝该类型，防止绕过绑定保护。反馈采纳使用 A1 `OutlineProposalService` 和事务内仓储模式创建新修订；diff 继续使用既有修订对比机制。

采纳在同一事务内检查工作版本、绑定修订、策略版本、当前摘要、活动章纲快照及目标字段权限。仅 propose_change / fill_missing 字段可生成建议，preserve / hard_constraint 字段不进入模型；身份、顺序、关联及固定设定均不接受修改。

- 只处理明确给定的 operationIds；同一字段不允许多条建议，所有建议必须独立。
- 每项采纳新增一个工作大纲版本，更新绑定策略值和 policyVersion，使 A2 后续准备读取采纳结果。
- 原采用修订、sourceDocumentHash 和原稿基线保持独立，不被重写。
- 映射未来章节的 summary / purpose 同步到活动卷章规划，其他源字段通过 A2 上下文消费；清除旧 taskSheet / sceneCards，将旧章节 StoryPlan 标为 stale。
- 人物弧线、伏笔调整使关联的未来章节执行细节失效，后续准备按新的策略值重建。
- 已有正文、非 planned 或正在 generating 的章节不能被覆盖；过去章与当前章不受影响。活动章纲使用内容 CAS，策略使用版本 CAS。
- 部分采纳后仅推进当前 run 的快照版本，剩余独立项仍可处理；外部修改使后续采纳产生 409，用户应手动重新分析。
- 重复同一决定幂等，反向决定冲突。拒绝不创建修订。

## HTTP 与共享合同

前缀 `/api/outlines/:id/feedback`（沿用大纲路由挂载）；响应沿用 `{ success: true, data }`。

| 方法 / 路径 | 请求与结果 |
| --- | --- |
| GET `/` | 设置、最近 50 条运行与逐项建议；含 sourceRoute |
| PATCH `/settings` | `{mode: chapter/every_n/volume/off, everyN?, provider?, model?}`；完整设置替换，缺省逐章与 N=5 |
| POST `/analyze` | `{chapterId, requestKey}`；返回运行收据，模型异步执行 |
| GET `/proposals` | 最近 50 次运行的建议，附 runId |
| POST `/:runId/retry` | 重试失败或超时运行；返回 pending 收据 |
| POST `/:runId/adopt` | `{operationIds: string[]}`；返回逐项状态 |
| POST `/:runId/reject` | `{operationIds: string[]}`；返回逐项状态 |

共享类型位于 `shared/types/outlineFeedback.ts`。运行记录只供查看；采纳、拒绝、分析与重试入口由大纲来源页承载。客户端交互属于后续阶段。
