# 小说封面主画面生成链路

## Background

小说封面生成属于典型的跨域能力：入口在小说编辑页，但任务创建、图片生成、资产存储、失败恢复、任务中心展示和主图切换都天然属于图片域。如果把 provider 选择、图片任务状态或封面主图事实源直接塞进 `Novel` 核心模块，后续继续扩展章节插图、封面排版导出、批量图片任务时会快速形成双向耦合。

同时，项目的主要用户是写作新手。封面 V1 不能要求用户自己从零写图像 prompt，也不能假设模型直接产出可用的中文书名字体。因此当前阶段的目标是：先根据小说基础信息自动整理一版“封面主画面”输入，再允许用户在 AI 优化后继续手动改。

## Decision

封面能力继续复用现有图片任务/资产基础设施，不新建第二套“小说封面任务系统”。图片域新增 `novel_cover` 场景，小说模块只提供只读素材和 UI 入口，不直接依赖图片 provider。

Prompt 也不走 service 内联字符串，而是进入 Prompt Registry：先把小说信息整理为结构化封面意图，再把结构化意图整理成最终图片 prompt。这样后续如果要继续扩成封面排版、横版海报或渠道素材，不需要回到小说 service 里堆分支。

## Current Rule

- `ImageGenerationTask` 与 `ImageAsset` 继续作为统一图片事实源。
- `sceneType=character` 时必须有 `baseCharacterId`，`novelId` 为空。
- `sceneType=novel_cover` 时必须有 `novelId`，`baseCharacterId` 为空。
- 当前 V1 只在 schema 与 route/service 校验层 enforce 归属规则，不引入复杂 polymorphic DB check。
- 小说主表不新增 `coverImageAssetId` 之类字段。当前封面通过 `sceneType=novel_cover + novelId + isPrimary` 从图片域读取。
- 封面图库、主图切换、删除主图后自动补新主图的规则，都由图片域负责。
- 小说编辑页只负责组装只读封面草稿素材：书名、简介、目标读者、卖点、竞品气质、前 30 章承诺、商业标签、题材/推进模式、世界氛围、写法气质。
- 默认新手路径固定为“AI 先整理再可编辑”：先生成 source brief，再允许 AI 优化，再允许手动改最终 prompt。
- V1 只生成不带文字的封面主画面，不承诺直接生成可用的中文书名字体。

## Prompt Chain

### 1. 本地草稿整理

前端与后端都使用同一套封面素材字段定义：

- 标题与一句话概述
- 目标读者
- 核心卖点
- 阅读气质
- 前 30 章承诺
- 商业标签
- 题材基底
- 主/副推进模式
- 世界氛围或世界切片核心框架
- 文风、视角、节奏、情绪浓度

前端在小说基础信息页用这些字段预填封面输入草稿；后端在 `novelCoverPromptSupport` 中用相同语义做兜底，避免两端对同一本书生成两套不同的封面输入。

### 2. 结构化封面意图

`image.novel_cover.brief@v1`

- 输入：source prompt + 小说只读上下文
- 输出：结构化封面意图
- 目的：让模型先判断主视觉焦点、卖点表达、构图方向和情绪氛围，而不是直接产出大段最终 prompt

### 3. 最终图片 Prompt

`image.novel_cover.prompt_optimize@v1`

- 输入：source prompt + 结构化封面意图 + 输出语言
- 输出：最终发给图片模型的文本 prompt
- 目的：把“封面意图”整理为适合图像模型消费的最终 prompt，同时保留人工继续编辑空间

### 4. 图片任务创建

- `promptMode=novel_cover_chain` 时，由图片服务继续补齐封面主画面专用约束
- 默认尺寸为 `1024x1536`
- 默认张数为 `2`
- 默认负向约束包含文字、书名、水印、低清晰度、畸形等
- 当前 OpenAI 推荐图像模型默认值为 `gpt-image-2`，但模型名仍然是可配置字符串，不在业务层写死白名单

## Task Center And Recovery

- 任务中心必须按 `sceneType` 渲染图片任务。
- `character` 任务继续回到角色库。
- `novel_cover` 任务标题显示为 `小说封面：{title}`。
- `novel_cover` 的 `sourceRoute` 固定回到 `/novels/{novelId}/edit?stage=basic`。
- 任务详情 `meta` 里必须保留 `novelId`，方便恢复与前端定位。

## Examples

推荐做法：

- 在小说基础信息页展示当前主封面和封面图库，但所有生成、主图切换、删除动作都通过 `/images/*` API 完成。
- 如果当前小说还没有主封面，第一次成功生成后把首张图自动设为 `isPrimary=true`。
- 如果已经存在主封面，新图片只进入图库，是否替换主封面由用户显式决定。

不推荐做法：

- 在 `Novel` 表上新增硬编码封面字段，再同时保留图片域 `isPrimary`，形成双事实源。
- 在小说 service 里直接调用某个图片 provider，绕过图片任务和恢复链路。
- 为了“更简单”直接把封面 prompt 写死在前端或 service 内联字符串里，绕开 Prompt Registry。

## Failure Modes

- 小说页显示的封面和任务中心恢复入口跳到不同位置：先检查 `sceneType` 分流是否一致，再查 `ImageTaskAdapter` 的 `sourceRoute`。
- 删除主封面后出现“本书没有任何当前封面”：说明图片域的主图补位逻辑被绕过了。
- 前端预填草稿和后端优化出来的上下文明显不一致：先检查是否两端没有复用同一套素材字段，尤其是商业标签、推进模式和世界切片核心框架。
- 封面逻辑开始反向依赖小说 provider 配置或小说持久化状态：说明边界已经坏了，应把逻辑收回图片域 facade。

## Related Modules

- `shared/types/image.ts`
- `shared/imagePrompt.ts`
- `server/src/routes/images.ts`
- `server/src/services/image/ImageGenerationService.ts`
- `server/src/services/image/ImagePromptOptimizationService.ts`
- `server/src/services/image/novelCover/novelCoverPromptSupport.ts`
- `server/src/services/task/adapters/ImageTaskAdapter.ts`
- `client/src/api/images.ts`
- `client/src/pages/novels/components/cover/`

## Source Documents

- `AGENTS.md`
- `docs/wiki/architecture/module-boundaries.md`
- `docs/wiki/architecture/image-generation-providers.md`
