# 时间线约束层

## 背景

章节生产链路已有 `StoryStateSnapshot`、`ConsistencyFact` 和 `CharacterTimeline`，但这些资产主要承担章节后的状态摘要、事实抽取和角色经历记录。它们缺少一个独立的“事件顺序约束层”，无法稳定阻止未来事件泄漏、上一章钩子断接、时间倒退、事件重复和角色状态回滚。

时间线约束层保留事件顺序展示、异步抽取和诊断价值。正文写作的连续性约束由事实账本、章节义务、伏笔账本、读者体验合同和上一章实际尾段共同提供；Timeline 不直接改正文，也不再作为 writer 的 required context。

## 决策

新增独立 `timeline` 模块，时间线只负责四件事：

- 记录计划事件、已发生事件、章节时间锚点、钩子和检测报告。
- 为前端时间轴、诊断入口和需要显式事件顺序检查的运维流程提供结构化事件与钩子资产。
- 在正文生成后抽取关键事件并校验时间线一致性。
- 检测失败时输出问题给章节修复链路，不直接修改正文。

失败章节应保留正文并标记为 `needs_repair`，但不能把失败正文中的事件提交为 `occurred` 时间线，避免污染后续上下文。

## 当前规则

- `StoryTimelineEvent` 管全局事件顺序，区分 `planned` 和 `occurred`。
- `ChapterTimeAnchor` 管章节处于什么故事时间、承接哪些事件、禁止提前发生哪些事件。
- `TimelineHook` 保留历史钩子及展示语义；正文写作中的本章承接责任以 `ReaderExperienceContract.inheritedHookResponsibilities` 为准。
- `TimelineCheckReport` 记录每次正文后的检测结果，供任务中心和章节编辑器展示。
- `timeline_context` 和 `previous_chapter_hook` 不属于章节写作 required context。writer 必须读取 `reader_experience`、事实账本、伏笔指令、章节义务和上一章实际尾段。
- 时间线抽取使用结构化 AI 输出；检测器只对结构化事件、钩子和状态变化做确定性判断。
- Timeline 未进入正文运行包时，不应生成“缺少 timeline context”的质量告警；该状态表示此写作链未启用 Timeline，而不是正文质量问题。
- 检测失败时不提交 `occurred` 事件；通过或 warning 时才允许提交抽取事件和新钩子。
- 自动修复由现有章节修复链路处理，timeline 模块只提供问题清单和修复建议。
- 主章节接收热路径以 acceptance 为准。Timeline 抽取如果由独立入口启用，仍应按同章同正文 content hash 幂等执行。
- 长弧钩子被正文部分回应时，应标记为已处理或已触达，而不是继续按下一章必须解决的硬阻断处理。

## 失败模式

- 第 N 章提前写出第 N+M 章才应发生的事件：先检查章节边界、protected secrets、事实账本和读者体验合同是否进入 writer；独立 Timeline 诊断启用时，再检查 checker 是否输出 `future_event_leak`。
- 下一章跳过上一章结尾责任：检查章节细化是否把相邻章问题写入 `ReaderExperienceContract.inheritedHookResponsibilities`，以及 writer 是否收到 `reader_experience` block。TimelineHook 仅用于历史展示或辅助诊断。
- 角色状态回滚：检查上一轮 `occurred` 事件的 `stateChanges` 是否记录了 confirmed 状态。
- 检测失败但后续章节继续引用污染事件：检查失败章是否错误提交了 `occurred` timeline。
- 时间线检测长期 warning：检查 extractor prompt 是否无法抽取章节时间锚点，或章节计划本身缺少时间标签。

## 相关模块

- `server/src/modules/timeline/`
- `server/src/services/novel/runtime/GenerationContextAssembler.ts`
- `server/src/services/novel/runtime/ChapterRuntimeCoordinator.ts`
- `server/src/prompting/prompts/novel/chapterWriter.prompts.ts`
- `server/src/prompting/prompts/novel/timelineExtractor.prompts.ts`
- `shared/types/timeline.ts`

## 来源文档

- 当前时间线约束层开发方案
- [章节生产链路](./chapter-production-chain.md)
- [模块边界与文档治理](../architecture/module-boundaries.md)
