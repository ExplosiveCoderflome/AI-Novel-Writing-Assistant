# 通用角色主体与跨来源角色对话

## Background

项目中的小说角色、基础角色库和拆书角色都需要被作者理解与交谈，但它们的事实来源不同。若为每一种角色单独实现聊天、上下文和记忆，角色能力会重复扩张；若把它们强行合并为同一份正史资料，又会让原文证据、跨书模板和小说运行状态互相污染。

## Decision

角色对话统一通过 `CharacterSubjectRef` 与 `CharacterSubjectProjection` 接入，统一的是交互协议，不是领域事实表。每个来源 Adapter 负责把已授权的来源资料投影为身份、当前语境、硬边界、主观状态、证据和交互策略；会话模块不直接把不同来源的数据混写。

| 主体来源 | 交互策略 | 可以影响的范围 |
| --- | --- | --- |
| 小说角色 | `novel_influence` | 作者确认后，作为有限章节窗口内的软性正文引导。 |
| 基础角色库 | `read_only` | 仅帮助理解稳定人格；不修改模板或任何小说。 |
| 拆书角色 | `evidence_interview` | 仅帮助理解原文人物；不修改原文、拆书结论或小说正文。 |

`drama_character` 保留为协议扩展位，在没有明确项目上下文和写入边界前不开放入口。

## Current Rule

- 通用会话记录角色主体引用、作用域、来源快照、交互策略、章节锚点、回合证据与不确定性说明。
- 拆书角色必须选择章节锚点；只允许读取带章节编号且不晚于该锚点的证据。证据不足时角色应说明无法确认，不得补写原作秘密、动机或后续情节。
- 基础角色与拆书角色的会话历史可以保存，但对话本身不构成模板更新、角色同步或状态提案。
- 小说角色沿用既有的影响确认、正文注入和 `artifact_delta` 承接链。其他主体不得生成 `influenceDraft`。
- 同名角色不自动视为同一角色；跨书、角色库和拆书来源的会话记忆必须按主体作用域隔离。
- 旧小说角色对话会话通过幂等镜像映射到通用会话，保留原记录和影响链，迁移不删除历史表。

## Failure Modes

- 把拆书角色的推断写回原文或新小说正史，会破坏来源边界。
- 让基础角色对话自动更新模板，会把一次探索误当成稳定设定。
- 让拆书角色使用锚点后的证据，会向作者泄露后续剧情。
- 让非小说主体的对话进入 writer 上下文，会把研究与模板资料污染当前章节。
- 按角色姓名共享会话或记忆，会误合并不同作品中的同名人物。

## Related Modules

- `server/src/services/characterConversation/`
- `server/src/prompting/prompts/character/characterConversation.prompts.ts`
- `server/src/services/novel/characterDialogue/`
- `server/src/services/bookAnalysis/bookAnalysisCharacter/`
- `client/src/components/characterConversation/`

## Source Documents

- [角色对话层：以角色主体性承接作者意图](./character-dialogue-layer.md)
- [拆书工作流](./book-analysis-workflow.md)
- [叙事引擎工作台长期蓝图](../product/narrative-engine-studio.md)
