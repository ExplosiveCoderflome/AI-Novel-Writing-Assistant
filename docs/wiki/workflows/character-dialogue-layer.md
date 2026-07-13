# 角色对话层：以角色主体性承接作者意图

## Background

作者创作时需要的不是一组“让角色执行 A/B/C”的选项，而是能与角色直接交谈、试探其真实立场的空间。多选提案会把角色降格为剧情配置项：作者替角色选完行为，角色的欲望、恐惧、误判和反抗便失去作用。

角色对话层把交流保留为自然语言对话，并将角色思路线作为回应的主观依据。它服务创作，不是泛聊天，也不是写入正史的快捷编辑器。

## Decision

每个角色维护独立的 `CharacterDialogueSession` 与回合记录。作者可以自然说话、追问、劝说或质疑；角色以自身身份回应，可以拒绝、误解、隐瞒、反问或保持沉默。作者消息不是事实，更不是必须执行的剧情命令。

一次对话回合最多沉淀一条 `CharacterDialogueInfluence` 草稿。它描述这段交流后角色可能形成、强化或松动的主观行动倾向。作者可一键选择“带入后续创作”，但不需要在多个 AI 选项中挑选。未确认的草稿不会进入正文上下文。

## Current Rule

| 内容 | 边界 |
| --- | --- |
| 角色对话 | 非正史创作过程；受角色思路线、硬事实、关系、资源和信息边界约束。 |
| 对话影响 | 作者确认后的有限章节软引导；不覆盖 `character_hard_facts`。 |
| 正史事实 | 只能由既有章节生产和状态链确认；对话不能直接修改。 |

激活的影响默认从下一未完成章节起覆盖三章。相同角色的重叠有效影响只保留最新一条，旧影响标记为 `superseded`。正文未承接时保留到窗口结束，再标记为 `expired`；这些状态绝不阻塞章节、自动导演或全书重规划。

## Chapter Contract

`GenerationContextPackage.characterDialogueGuidances` 只注入同时满足以下条件的影响：已激活、章节序号在窗口内、目标角色真实参与本章。writer 必须把它理解为“作者与角色对话后确认的软性行为倾向”，而非客观事实或剧情命令。

章节后置承接只归属 `novel.chapter.artifact_delta.extract@v1`。它输出 `characterDialogueInfluenceResolutions`，由 `ChapterArtifactDeltaService` 校验影响 ID、状态和窗口后标记 `applied` 并记录正文证据。不得为角色对话增加第二条章节后置 LLM 链路。

## Product Surface

角色页的智能层以“对话主舞台 + 角色场景分析器”组织，不应把思路线、证据、信念和误判按表单顺序全部铺开。

- 主舞台承载角色消息、作者输入和对话影响确认，是用户完成一次创作交流的唯一主任务区。
- 场景分析器位于对话旁侧，默认只显示局势理解、谈话关注点、可能误读和受压反应，帮助作者理解角色为什么这样回应。
- 完整情绪、触发条件、信念与证据按需展开，避免新手在开口前被角色资料淹没。
- 小屏幕下场景分析器自然排在对话之后；不改变对话、正史与影响确认的业务边界。
- 对话主舞台使用全局 `FullscreenView`；全屏、退出全屏和 Esc 行为必须复用统一组件，不在业务页面另行实现。

## Failure Modes

- 让角色无条件服从作者，会使对话变成伪装的提示词输入框。
- 将作者话语直接注入正文，会把创作过程污染为故事事实。
- 允许角色越过信息边界回答，会泄露本不属于该角色的真相。
- 将“未承接”视为失败，会把局部角色探索错误升级为自动导演阻断。
- 为未参与章节的角色注入对话影响，会扩大上下文并制造抢戏。

## Related Modules

- `server/src/services/novel/characterDialogue/`
- `server/src/prompting/prompts/novel/characterDialogue.prompts.ts`
- `server/src/services/novel/runtime/GenerationContextAssembler.ts`
- `server/src/services/novel/runtime/ChapterArtifactDeltaService.ts`
- `client/src/pages/novels/components/characterWorkspace/CharacterIntelligenceTab.tsx`

## Source Documents

- [角色智能层：思路线 MVP](./character-intelligence-layer.md)
- [章节生产链](./chapter-production-chain.md)
