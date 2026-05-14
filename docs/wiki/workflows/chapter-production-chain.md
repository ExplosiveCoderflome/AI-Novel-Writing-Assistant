# 章节生产链路

## 背景

章节生产曾经把章节合同、正文生成、AI 检测、修文、轻校验、角色动态、状态快照、角色资源、伏笔账本等能力串进同一条热路径。能力本身有价值，但全部同步执行会导致用户等待变长、LLM 调用重复、修复循环和账本重复同步。

长篇小说主链路的目标是持续写完整本书。默认路径必须先产出可读正文，再把需要回灌的状态和账本异步处理。

## 决策

章节生产采用双通道：

```text
轻量预检 -> 整章正文生成 -> 接收闸门 -> 可选局部修文
                                      |
                                      v
                              异步资产回灌通道
```

正文热路径只负责尽快生成、判断、保存和局部修复章节。状态快照、角色资源、关系动态和伏笔账本通过异步、幂等、可批处理的资产回灌通道写入。

## 当前规则

- 默认 writer 继续整章一次性生成，不把 sceneCards、章节合同或分场景多轮写作重新接入正文热路径。
- 章节合同和 sceneCards 可作为规划、审校、诊断和局部修复辅助资产，不驱动默认正文生成。
- 正文生成前只做最低可写性检查：章节存在、人物可用、上下文包可组装、任务目标可解释。
- 生成后用一次结构化接收闸门判断是否可继续、是否需要局部修文、是否需要人工确认。
- 自动修文默认最多一次；失败后记录待修状态或 repair ticket，不进入无限重试。
- `autoReview=false` 时仍可保存正文并进入异步资产回灌。
- 同一章正文 content hash 未变化时，不重复跑状态快照、角色资源、伏笔账本和角色动态同步。
- 资产同步模式：
  - `adaptive`：默认模式，关键资产异步同步，高风险或周期节点触发全量伏笔校准。
  - `deferred`：快速产文，资产同步可延后批处理。
  - `strict`：等待必要资产同步后再继续下一章。

## 示例

推荐做法：

- 无 sceneCards 时，只要章节目标和上下文足够，允许生成正文。
- 接收闸门输出 repair directives 后，只做一次局部 patch repair。
- 伏笔每章默认写 delta，只有高风险、卷尾、周期节点或 strict 模式触发全量对账。

禁止做法：

- 因为有章节合同功能，就强制每章默认先重建合同再生成正文。
- 生成后默认串联 AI 味检测、轻审校、状态抽取、角色资源抽取、伏笔同步等多次 LLM 调用。
- 长度略超目标就直接失败或截断正文。

## 失败模式

- 一章生成耗时异常：检查是否又把多个 LLM 后处理塞回热路径。
- 同一章重复同步账本：检查 content hash checkpoint 是否生效。
- 修复循环：检查自动修文次数是否被限制，失败是否落到可恢复状态。
- 正文已经可读但 UI 显示失败：检查正文状态、资产回灌状态和账本校准状态是否被混为一个状态。

## 相关模块

- `server/src/services/novel/runtime/ChapterRuntimeCoordinator.ts`
- `server/src/services/novel/runtime/ChapterArtifactDeltaService.ts`
- `server/src/services/novel/production/`
- `server/src/prompting/prompts/novel/`
- `client/src/pages/novels/components/chapterExecution.shared.tsx`
- `client/src/pages/novels/components/ChapterExecutionResultPanel.tsx`

## 来源文档

- [正文产出链路瘦身与资产回灌优化计划](../../plans/chapter-output-pipeline-optimization-plan.md)
- [README 最新更新](../../../README.md)
- [版本更新说明](../../releases/release-notes.md)
