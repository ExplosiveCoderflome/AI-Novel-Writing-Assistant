# 角色智能层：思路线 MVP

## Background

长篇写作中，角色资料、关系、资源和章节状态能约束“角色能做什么”，但不足以稳定表达“角色以为发生了什么、准备怎样行动”。如果这一层只停留在作者脑中，章节生成容易把角色写成只会响应剧情推进的工具人；如果又把 AI 推断直接当作事实写入状态，则会污染小说正史。

本模块提供可阅读、可追溯并可注入正文的角色思路线。它优先帮助新手理解角色的当前选择，再作为正文的软性行为引导，不要求作者维护复杂的内心表单。

## Decision

`CharacterMindSnapshot` 是角色主观状态的历史快照，不是 Canonical State，也不进入 `StateChangeProposal`。

每条快照只记录：

- 当前理解、私下意图、行动计划、情绪立场、受压时的行动倾向与决策触发条件；
- 角色当前相信的判断与可能误判；
- 推断证据、置信度、来源章节与来源类型。

同一小说中的同一角色始终只有一条 `isCurrent=true` 的快照。刷新或章节增量写入时，事务内先归档旧当前快照，再写入新当前快照；历史用于追溯 AI 在何种证据下得出当时判断。

## Three-Layer Boundary

| 层 | 负责内容 | 可否直接约束正文 | 写入方式 |
| --- | --- | --- | --- |
| 正史事实层 | 身份、阵营、位置、资源、状态、信息边界、已发生事件 | 是，属于硬约束 | 既有角色、状态快照、资源账本、信息边界和事实账本 |
| 角色主观层 | 理解、意图、计划、情绪、判断与误判 | 只能软性引导，不能推翻硬约束 | `CharacterMindSnapshot` |
| 后续推演草稿层 | IF 线、关系多方案、影响预览、作者干预候选 | 否，除非用户显式确认进入相应正史流程 | 后续阶段的独立草稿资产 |

例如，“守卫加班巡逻”是正文已确认的事实；“角色以为守卫仍按旧班次换岗”是主观误判；“如果角色提前潜入可能触发追捕”是推演草稿。三者不得混写。

## Generation And Update Rules

### 初始准备与手动刷新

阵容确认后，核心角色、关系和动态照常落库；系统通过注册 PromptAsset `novel.character.mind.snapshot@v1` 异步准备初始思路线。补充角色只为新增角色准备。作者在单个角色页可请求刷新，但请求不接收自由文本，以免把新手带回复杂的角色编辑表单。

自动导演应用阵容时可以等待一次初始准备；若失败，只记录可见 warning，继续全书生产主链。手动应用阵容的后台准备失败也不得阻塞继续编辑。

Prompt 只能基于装配的正史、关系和最近章节材料推断，必须给出证据与置信度。结构化输出由 PromptAsset 的 schema 与修复链处理；不得用关键词或正则给产品行为兜底。

### 章节后置更新

`novel.chapter.artifact_delta.extract@v1` 是章节定稿后角色思路线更新的唯一所有者。它在原有单次章节资产抽取中输出最多四条 `characterMindDeltas`，且只在正文明确改变角色认知、情绪、意图、计划、误判或行动选择时输出。

`ChapterArtifactDeltaService` 直接把命中角色的 delta 合并成新快照，不增加第二条章节后置 LLM 链路。无相关变化时不写空快照，保留既有当前思路线。

## Chapter Context Contract

`GenerationContextPackage.characterMindStates` 只加载当前快照。`ChapterWriteContext` 只把本章真实参与角色的紧凑内容转为 `mindGuidance`，最多包含局势理解、倾向行动、受压反应和可能误判。

正文 Prompt 必须将它理解为“角色主观倾向（非客观事实）”。`character_hard_facts` 仍是 required 硬约束；没有思路线时章节生成必须正常执行。writer 不得把角色猜测、误判或隐藏意图写成旁白确认的客观真相。

## Product Surface

角色资产控制台的智能层展示“他现在如何理解局面、想做什么、最在意什么、可能误判什么、受压时怎样行动”，并展示来源、证据与置信度。页面需要明确说明“这是 AI 推断，不会自动改写小说正史”。

思路线是角色对话的认知底座：作者可以在角色页与角色自然交谈，但角色必须受这份主观状态和正史边界约束，不能退化为服从指令的通用助手。对话中沉淀的软性影响必须经过作者一键确认，才可进入后续章节上下文；它也不能自动改写正史事实。

关系多路线推演和 IF 推演仍应作为独立草稿能力，不得混入角色对话。

## Failure Modes

- 把角色误判写入状态快照或事实账本，会导致错误变成全书事实。
- 没有 evidence 的心理判断会让 AI 用设定空白编造秘密。
- 为所有角色注入思路线会扩大上下文并让未参与角色抢戏；只注入实际参与者。
- 将初始准备失败升级为自动导演失败，会错误阻断可继续的生产链。
- 增加独立章节后置模型调用，会造成同一章节出现两套相互冲突的角色状态。

## Related Modules

- `server/src/services/novel/characterMind/`
- `server/src/services/novel/runtime/ChapterArtifactDeltaService.ts`
- `server/src/services/novel/runtime/GenerationContextAssembler.ts`
- `server/src/prompting/prompts/novel/characterMind.prompts.ts`
- `server/src/prompting/prompts/novel/chapterArtifactDelta.prompts.ts`
- `server/src/prompting/prompts/novel/chapterLayeredContext*.ts`
- `client/src/pages/novels/components/characterWorkspace/CharacterIntelligenceTab.tsx`

## Source Documents

- [章节生产链](./chapter-production-chain.md)
- [小说事实账本](./novel-fact-ledger.md)
- [叙事引擎工作台长期蓝图](../product/narrative-engine-studio.md)
