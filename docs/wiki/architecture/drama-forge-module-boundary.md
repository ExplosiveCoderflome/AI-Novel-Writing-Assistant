# 短剧创作模块边界

更新日期：2026-06-09

## 背景

短剧创作模块的目标不是给小说详情页增加一个下游改编按钮，而是提供独立的竖屏付费短剧创作链路。小说只是内容来源之一，原创灵感和外部文本也必须能进入同一条短剧产线。

如果短剧能力直接调用小说业务服务，后续会出现三个问题：

- 原创和文本导入会被迫伪装成小说。
- 角色、事实、质量闸和视频提示词会继承小说生产链的约束，难以服务短剧节奏。
- 未来拆分为独立短剧产品时，需要重写核心引擎。

## 当前规则

`server/src/services/drama` 是独立 bounded context。它可以依赖 Prisma、LLM、Prompt Runner、任务队列、文件导出和图片/视频等平台基础设施，但不得依赖 `services/novel` 或 `modules/novel` 的业务实现。

短剧模块与小说模块的唯一内容接触点是 `NovelSourceAdapter`。该 adapter 只能通过 Prisma 只读读取小说、章节、角色和事实数据，并把它们转成 `SourceBundle`。短剧核心服务只能消费 `SourceBundle`、`DramaCharacter`、`DramaFact`、`DramaEpisode` 等自有模型。

## SourceBundle 防腐层

所有内容来源都必须先转成 `SourceBundle`：

- `novel_import`：读取本系统小说快照。
- `original`：用 AI 从灵感和题材生成标准内容包。
- `text_import`：用 AI 从导入文本解析标准内容包。

策略、分集大纲、台本、质量闸、分镜和视频提示词不得为某一种来源写分支逻辑。来源差异只允许存在于 adapter 和内容包质量检查阶段。

## Prompt 规则

短剧产品级 prompt 必须位于 `server/src/prompting/prompts/drama/` 并注册到 `server/src/prompting/registry.ts`。服务层可以通过 PromptAsset 调用结构化输出，但不得在 service 内新增未注册 prompt 字符串。

结构化输出失败应修 schema、prompt、上下文装配或 JSON repair，不得用关键词匹配作为产品行为兜底。

## 视频生成边界

视频生成通过 `VideoProviderPort` 接入。短剧核心只生成和保存 `DramaVideoPrompt`，然后把任务交给 provider adapter。

Provider 替换不得影响：

- SourceBundle。
- 策略与分集。
- 台本与质量闸。
- 分镜模型。
- 角色视觉锚点。

当前默认 provider 是 `mock`，用于验证任务抽象和状态流。接入真实 provider 时应新增 adapter，不应把供应商字段写入核心策略或分镜规则。

## 失败模式

- 如果 `services/drama` 直接 import novel 业务路径，低耦合守卫测试应失败。
- 如果新增短剧 prompt 未注册，Prompt Runner 会拒绝执行。
- 如果 `original` 或 `text_import` 绕过 AI 结构化解析，短剧模块会退回固定规则生成，违背 AI-first 规则。
- 如果视频 provider 逻辑进入台本或分镜服务，后续更换供应商会污染核心产线。

## 相关模块

- `server/src/services/drama/source/SourceContentPort.ts`
- `server/src/services/drama/source/NovelSourceAdapter.ts`
- `server/src/services/drama/source/OriginalSourceAdapter.ts`
- `server/src/services/drama/source/TextImportSourceAdapter.ts`
- `server/src/services/drama/DramaScriptService.ts`
- `server/src/services/drama/DramaQualityGate.ts`
- `server/src/services/drama/DramaStoryboardService.ts`
- `server/src/services/drama/DramaVideoPromptService.ts`
- `server/src/services/drama/video/VideoProviderPort.ts`
- `server/src/prompting/prompts/drama/drama.prompts.ts`
