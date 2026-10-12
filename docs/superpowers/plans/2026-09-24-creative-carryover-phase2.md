# 创作承接合同第二部分 Implementation Plan

> **For agentic workers:** 按任务顺序实施并在每个独立增量后复核。若使用执行技能，采用 `executing-plans`；本计划不要求派发子代理。步骤以 `- [ ]` 跟踪。

**Goal:** 让已采用的创作承接合同贯穿方向、宏观、卷章和章节；续写承接原作事实，参考创作保留阅读体验并隔离原文事实召回。

**Architecture:** 在 `NovelReferenceService` 后面增加单一的合同读取与阶段投影模块。任务创建前从导演任务快照读取，建书后从小说可空字段读取；各 Prompt 只接收同一种短上下文块。章节继续复用现有章节链和 `NovelContinuationService`，仅参考创作的知识库检索显式排除来源文档。

**Tech Stack:** TypeScript 5.9、Node.js、Prisma 7、Zod 4、现有 Prompt Registry、Node test runner、pnpm 10。

**Spec:** `TASK.md` 的“总目标与前置条件”“第二部分：规划接入与来源隔离”“第三部分：回归验收与交付”；`docs/wiki/workflows/book-analysis-workflow.md`。

## Global Constraints

- 普通原创没有合同，其现有 Prompt 输入、检索范围和恢复行为保持原样；旧小说的空合同字段继续兼容。
- AI 生成的结构化合同是模式决策来源。阶段投影仅对结构化字段做确定性筛选、压缩和安全校验，不按文本关键词重新判定模式。
- 不复制导演状态机、章节生产链或来源约束服务；新产品 Prompt 只能进入 `server/src/prompting/`。
- 只允许兼容的数据库变更；不得重置或清理已有数据。本阶段原则上无需迁移。
- 写法资产是表现层约束，不能改写创作承接合同的结构方向；准备失败不得阻断开书或全书执行。
- 每个完整增量在功能分支单独提交。提交前检查 wiki 长期知识与 `readme-release-updater`；用户可见变化才写发布说明。UI 人工验收由用户执行。

## 当前证据与依赖顺序

1. `NovelReferenceService.buildReferenceForStage()` 目前拼接拆书和知识库原文，未读取 `creativeCarryoverContractJson`；候选阶段还直接使用拆书文本。故事宏观、卷战略、骨架和节拍走各自的 Prompt 上下文构造器。
2. 章节通过 `GenerationContextAssembler` 构造 `GenerationContextPackage`；续写已有 `NovelContinuationService.buildChapterContextPack()`。章节 RAG 当前只传 `novelId` 与章节序号。
3. `resolveKnowledgeDocumentIds()` 在没有显式列表时会退回到全局启用文档。仅仅解除来源文档与小说的绑定，不能保证参考创作章节不召回原文。
4. 写法资产可能在建书后才提取完成；当前建书时只绑定已得到的资产 ID。

因此先建立合同投影，再接规划，之后处理章节检索与晚到写法。每个增量都应保持普通原创的原路径可运行。

## 模块边界与接口

| 所属 | 责任 | 预计文件 |
| --- | --- | --- |
| 参考能力 | 解析已采用合同、校验来源、生成阶段专用短文本、判定来源文档排除范围 | 新建 `server/src/services/novel/reference/creativeCarryoverStageContext.ts`；调整 `NovelReferenceService.ts` 门面 |
| 导演规划 | 候选和宏观规划注入同一个合同块，避免各阶段自行判断续写/参考创作 | `novelDirectorCandidateStage.ts`、`novelDirectorStoryMacroPhase.ts`、`planningContextBlocks.ts` |
| 卷章规划 | 在卷战略、卷骨架、节拍、章节列表与详情的注册 Prompt 上下文中注入合同块 | `volumeGenerationOrchestrator.ts`、`volumeBeatSheetGeneration.ts`、`volumeChapterListGeneration.ts`、`volume/contextBlocks.ts` |
| 章节生产 | 续写沿用来源约束包；参考创作注入阅读承诺并缩窄知识文档 ID | `GenerationContextAssembler.ts`、`chapterWritingGraph.ts` 及对应章节 Prompt 上下文构造器 |
| 写法 | 来源身份一致、幂等地补绑定晚到资产；失败在开书来源页给重试入口 | `AutoDirectorCreatePage.tsx`、导演建书/写法绑定服务和现有样式 API |

建议的参考能力接口：

```ts
type CarryoverStage =
  | "candidate" | "story_macro" | "book_contract"
  | "volume_strategy" | "volume_skeleton" | "volume_beat_sheet"
  | "volume_chapter_list" | "volume_chapter_detail" | "chapter_write";

// 普通原创和没有合同字段的历史小说返回 null；非空合同损坏或来源不符时抛错。
buildCarryoverContextForNovel(novelId: string, stage: CarryoverStage): Promise<string | null>;
buildCarryoverContextForTask(input: {
  contract: unknown;
  mode: "continuation" | "adaptation" | "";
  bookAnalysisId: string | null;
  stage: CarryoverStage;
}): string | null;
```

两者调用同一个纯阶段投影函数。投影只包含本书实现、对应阶段所需的前三章方向和模式专属字段；续写包含终局人物状态与未完线索，参考创作包含钩子、冲突循环、爽点节奏及转换方案。证据和原文摘要只用于合同生成，不在各阶段反复整份注入。合同块设定固定字数预算和高优先级；若必要字段被上下文预算裁掉，应明确失败而不是静默退回原文。

## Task 1：建立合同读取与阶段投影（下一增量，先做）

**Files:** 新建 `server/src/services/novel/reference/creativeCarryoverStageContext.ts`；修改 `server/src/services/novel/NovelReferenceService.ts`；新增 `server/tests/creativeCarryoverStageContext.test.js`。

**Interfaces:** 实现上节两个门面方法，内部复用 `shared/types/creativeCarryoverContract.ts` 的解析与来源校验；不增加数据库字段或新依赖。

- [ ] 写失败用例：普通原创返回 `null`；续写与参考创作各阶段只包含相应结构化字段；第 1–3 章方向只在相关阶段出现；合同来源不符、未采用或 JSON 损坏时失败；旧小说空合同字段沿用旧参考路径。测试使用现有 Prisma mock 方式，不请求真实模型。
- [ ] 运行 `pnpm --filter @ai-novel/shared build`、`pnpm --filter @ai-novel/server build`，再运行 `node --test server/tests/creativeCarryoverStageContext.test.js`，确认新用例先失败。Node 测试引用编译后的 `server/dist`，所以每次实现后先编译服务端。
- [ ] 实现纯投影函数及 `NovelReferenceService` 门面。非空 `creativeCarryoverContractJson` 必须解析并匹配小说来源；损坏时抛错，不能让现有 `buildReferenceForStage()` 的 `catch` 吞掉并改成空上下文。将现有 `outline`、`structured_outline`、`bible`、`beats` 入口对已采用合同的小说映射到阶段投影；普通原创和空合同的历史小说沿用旧路径。
- [ ] 重跑该文件与 `server/tests/novelReferenceCreation.test.js`、`server/tests/novelContinuationReferenceHardening.test.js`；复核输出不含原文事实大段文本，普通原创输出与改动前一致。
- [ ] 完成代码复核；如产生稳定的阶段边界知识，更新 `docs/wiki/workflows/book-analysis-workflow.md`；检查发布说明范围后提交本增量。

**验收门槛：** 同一份合同在任务快照和小说字段得到一致阶段投影；错配不能污染另一来源；普通原创与旧数据不改变既有处理；没有新增独立状态机。

## Task 2：候选、宏观和卷章接入

- [ ] 候选阶段改为从导演任务快照取得已采用合同，并通过 `NovelReferenceService` 生成候选上下文。移除同一路径对原始拆书的重复模式指令；保留现有其他项目上下文。
- [ ] 宏观拆解与书级合同、卷战略、卷骨架、节拍、章节列表和章节详情从小说字段取得对应阶段投影。注册 Prompt 的 context builder 统一加入 `creative_carryover_contract` 块；不在每个生成器分别判断模式。
- [ ] 用无真实模型的上下文组装测试确认所有阶段收到同一来源合同，续写只接续写字段，参考创作只接参考字段；普通原创没有新增块。覆盖导演任务暂停、恢复后读到的同一合同。
- [ ] 运行相关定向测试、服务端编译；完成代码复核、wiki 和发布说明判断后提交。

**验收门槛：** 方向到章节节拍共享同一采用版本；原始拆书不能在参考创作规划阶段作为事实蓝本覆盖合同；阶段恢复不会选择新生成或不同来源合同。

## Task 3：章节承接与参考创作检索隔离

- [ ] 续写在章节上下文中保留 `NovelContinuationService.buildChapterContextPack()`，补入合同的终局人物状态、未完线索和本章相关开篇方向；人物关系仍由现有来源约束包提供，不新建一套关系推断。
- [ ] 参考创作章节只取得合同里的阅读承诺、钩子、冲突循环、爽点节奏与本书转换方向。`GenerationContextAssembler` 为该模式计算显式 `knowledgeDocumentIds`：先按当前规则解析可用文档，再排除合同 `documentId`、`sourceAnalysisId === contract.bookAnalysisId` 的发布文档，以及带同一 `sourceAnalysisId` 的绑定；即使结果为 `[]` 也显式传给 RAG，阻止全局启用文档回退。基础小说/章节 owner 检索继续保留。
- [ ] 覆盖已绑定、未绑定但全局启用、发布拆书、零剩余文档、向量与关键词两个检索分支；确认普通原创仍不传 `knowledgeDocumentIds`，续写来源召回未受影响。
- [ ] 运行定向章节、RAG 测试和服务端编译；完成代码复核、wiki 和发布说明判断后提交。

**验收门槛：** 参考创作的章节提示中没有源书事实片段；续写有连续性约束；普通原创保留既有检索与章节生成路径。用户自行复制且无法追踪来源的文档不属于自动排除范围，需在风险记录中明确。

## Task 4：写法资产晚到与失败提示

- [ ] 建书后若写法资产异步完成，由服务端持久化的任务/小说来源关系触发补绑定，不能依赖开书页面仍挂载。通过已有写法绑定服务按来源拆书 ID 幂等处理；已有用户主动选择的主写法不被异步结果覆盖。绑定动作不更改 `creativeCarryoverContractJson` 或导演结构规划。
- [ ] 提取失败在开书来源页显示可重试提示，任务执行和章节链继续。重试完成后仍校验当前模式、来源拆书与小说 ID，避免把旧请求结果绑到新书。
- [ ] 用定向测试覆盖“建书前完成”“建书后完成”“失败后重试”“切换来源后的迟到结果”“已有主写法”；客户端类型检查，UI 交互留给用户人工验收。
- [ ] 完成代码复核、wiki 和发布说明判断后提交。

**验收门槛：** 异步写法不影响合同采用、规划来源或全书继续运行；用户可从来源页理解并重试写法问题。

## 第二部分完成条件与交接

- [ ] 对照 `TASK.md` 第二部分四项逐条提供代码位置和定向验证证据；更新任务清单。普通原创基线、真实模型样例、无向量库、任务中断和完整 UI 验收仍按第三部分执行。
- [ ] 第一部分的人工入口验收依然单独待用户确认；不能把第二部分代码通过等同于第一部分人工验收通过。
- [ ] 第二部分功能分支完成后按项目流程进入 `beta` 组合验证；本计划本身不授权提前合并或发布。

## 风险与回退边界

- 非空合同损坏必须可见地失败并指向来源页修复；空合同字段按历史小说兼容路径处理。第一部分的建书校验负责阻止新参考小说以空合同入库；第二部分复核这条写入约束。不能让宽泛 `catch` 静默吞掉合同错误。
- `KnowledgeDocument` 可能是用户另行上传的原书副本，只有稳定来源 ID 可自动识别；不按标题或文本相似度做误伤性过滤。
- Prompt 预算若压缩掉关键约束，优先缩短阶段投影，不能退回整份拆书原文。
- 每个提交仅包含该增量文件，可逐增量回退；不触碰既有数据库数据或迁移。
