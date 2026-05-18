# 时间线约束层

## 背景

章节生产链路已有 `StoryStateSnapshot`、`ConsistencyFact` 和 `CharacterTimeline`，但这些资产主要承担章节后的状态摘要、事实抽取和角色经历记录。它们缺少一个独立的“事件顺序约束层”，无法稳定阻止未来事件泄漏、上一章钩子断接、时间倒退、事件重复和角色状态回滚。

时间线约束层用于给章节生产提供更硬的事件顺序骨架。它不负责写正文，不直接改正文，也不替代章节计划或状态快照。

## 决策

新增独立 `timeline` 模块，时间线只负责四件事：

- 记录计划事件、已发生事件、章节时间锚点、钩子和检测报告。
- 在章节生成前提供不可裁剪的 `timeline_context` 和 `previous_chapter_hook`。
- 在正文生成后抽取关键事件并校验时间线一致性。
- 检测失败时输出问题给章节修复链路，不直接修改正文。

失败章节应保留正文并标记为 `needs_repair`，但不能把失败正文中的事件提交为 `occurred` 时间线，避免污染后续上下文。

## 当前规则

- `StoryTimelineEvent` 管全局事件顺序，区分 `planned` 和 `occurred`。
- `ChapterTimeAnchor` 管章节处于什么故事时间、承接哪些事件、禁止提前发生哪些事件。
- `TimelineHook` 管上一章或前文遗留的钩子，关键钩子必须进入下一章生成上下文。
- `TimelineCheckReport` 记录每次正文后的检测结果，供任务中心和章节编辑器展示。
- `timeline_context` 是章节写作 required context；`recent_chapters` 仍可作为辅助记忆，但不能替代时间线约束。
- 时间线抽取使用结构化 AI 输出；检测器只对结构化事件、钩子和状态变化做确定性判断。
- `autoReview=false` 不影响时间线检测。时间线检测属于章节接收闸门，不依赖完整质量审校事实。
- 检测失败时不提交 `occurred` 事件；通过或 warning 时才允许提交抽取事件和新钩子。
- 自动修复由现有章节修复链路处理，timeline 模块只提供问题清单和修复建议。

## 失败模式

- 第 N 章提前写出第 N+M 章才应发生的事件：检查 `forbiddenEvents` 是否进入 `timeline_context`，以及 checker 是否输出 `future_event_leak`。
- 下一章跳过上一章结尾钩子：检查 `TimelineHook` 是否仍为 `open`，以及 `previous_chapter_hook` 是否被 Prompt Context 保留。
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
