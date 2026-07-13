# 角色影响提案：作者干预的软性引导

## Background

角色思路线能解释角色为什么会这样判断，却不提供安全的作者干预入口。直接编辑角色状态会把作者的写作意图误写成正史；开放式角色聊天则会让新手面对空白输入框，并产生难以追溯的剧情污染。

角色影响提案把作者干预收敛为“AI 给出几个可选方向，作者选择并确认”的短流程。它服务后续章节的角色行为、冲突和读者回报，不替代事实层。

## Decision

`CharacterInfluenceProposal` 是独立的非正史提案资产。它只对未来有限章节窗口提供软性行为倾向，不能写入 Canonical State、`StateChangeProposal`、角色身份、阵营、资源、位置或已发生事件。

提案生成必须基于当前思路线、正史硬事实、信息边界、关系阶段、资源和近期剧情。作者可补充一句意图，但该输入必须经过注册 PromptAsset 的结构化 refine 流程，不能原样进入正文上下文。

## Lifecycle

```text
AI 生成 draft 候选
-> 作者确认 accepted
-> 本章正文明确承接 applied
-> 未承接且窗口结束 expired
```

- `draft`：本轮可选方案，尚未进入正文上下文。
- `accepted`：作者确认的唯一有效方案，可在目标章节窗口内作为软性引导。
- `applied`：章节定稿时，`artifact_delta` 依据正文证据确认已承接。
- `expired`：窗口结束仍未承接；不产生失败或重规划。
- `superseded`：被同角色、重叠窗口的新确认方案替代。
- `dismissed`：作者主动放弃的未生效方案。

同一角色、重叠章节窗口内只能保留一个未生效的 `accepted` 提案，避免正文接收互相冲突的作者引导。

## Context And Chapter Finalization

只有同时满足以下条件的提案才能进入正文上下文：状态为 `accepted`、章节序号在窗口内、目标角色真实参与本章。

writer 将其读取为“作者选择的软性角色倾向，不是客观事实”。`character_hard_facts` 仍优先；提案不能让角色无代价改变性格、跳过冲突，或把意图写成旁白确认的真相。

章节后置承接只归属既有 `novel.chapter.artifact_delta.extract@v1`。它输出 `characterInfluenceResolutions`，由 `ChapterArtifactDeltaService` 校验提案 ID、窗口和当前状态后标记 `applied` 并记录证据。不得为提案增加第二条章节后置 LLM 链路。

生成、refine、过期或承接判断失败均不得阻断章节执行、自动导演或全书重规划。

## Product Boundary

角色页只提供主动的“为他准备下一步”入口：AI 输出 2–3 个有明确取舍的候选，展示推荐理由、读者回报、风险和目标章节窗口。作者确认时可补充一句意图。

本阶段不提供泛角色聊天、长表单、自由改写提案全文、关系多路线推演或直接写入正史的入口。角色采访与关系推演属于后续独立阶段。

## Failure Modes

- 将 `accepted` 当成已发生事实，会让作者意图污染正史。
- 向未参与本章的角色注入提案，会扩大上下文并制造抢戏。
- 用固定关键词判断“是否承接”，会绕过 AI 结构化理解并误标提案状态。
- 提案未承接就阻断自动导演，会把局部写法选择误升级为全书失败。
- 允许多个重叠有效提案，会向 writer 输入矛盾角色行为。

## Related Modules

- `server/src/services/novel/characterInfluence/`
- `server/src/prompting/prompts/novel/characterInfluence.prompts.ts`
- `server/src/services/novel/runtime/ChapterArtifactDeltaService.ts`
- `server/src/prompting/prompts/novel/chapterLayeredContext*.ts`
- `client/src/pages/novels/components/characterWorkspace/CharacterIntelligenceTab.tsx`

## Source Documents

- [角色智能层：思路线 MVP](./character-intelligence-layer.md)
- [章节生产链](./chapter-production-chain.md)
- [叙事引擎工作台长期蓝图](../product/narrative-engine-studio.md)
