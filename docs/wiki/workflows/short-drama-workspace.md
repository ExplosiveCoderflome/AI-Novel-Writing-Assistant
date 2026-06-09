# 短剧工作台流程边界

## Background

短剧模块的目标不是给小说详情页增加一个下游按钮，而是形成独立的竖屏付费短剧创作平台。用户通常不理解短剧赛道、付费卡点、分镜或视频提示词，因此前端工作台必须把后端能力组织成清晰的主流程，而不是暴露一组零散接口。

## Decision

短剧项目必须有独立工作台。项目列表只负责创建和进入项目；项目详情页负责承载“素材 -> 策略 -> 分集 -> 台本 -> 质量 -> 分镜视频 -> 导出”的连续推进。

## Current Rule

- `/drama` 是短剧入口和项目列表，不承载完整生产链。
- 新建项目必须使用低认知负担向导组织为“来源 -> 内容 -> 规格”。导入小说时不暴露内部 ID，应显示小说标题和章节数，并自动生成可读项目名。
- 新建项目的赛道选择应提供 AI 推荐入口。推荐必须基于注册 PromptAsset 和结构化输出，返回推荐赛道、适配理由、素材信号、风险和备选赛道；不得用关键词匹配替代 AI 判断。
- `/drama/projects/:id` 是项目工作台，必须展示当前项目的来源素材、策略、分集、角色、质量状态、分镜视频和导出入口。
- `GET /api/drama/projects/:id` 应返回工作台首屏需要的聚合数据，包括 `sourceBundle`、`characters`、`episodes`、`storyboards`、`shots` 和 `videoPrompts`。
- 项目详情页必须提供“下一步”主任务卡，根据当前项目产物自动引导整理素材、生成策略、生成分集、生成台本、质量检查、修复、分镜、视频提示词、视频任务或导出。主路径动作应集中在这个任务卡里，避免用户在多个同级按钮之间判断顺序。
- 前端可以提供主路径快捷按钮，但按钮必须服务于可见产物：生成后用户应能立即看到素材、策略、分集、台本或质量结果。
- 单集台本允许用户人工编辑；保存正文后必须把旧 `qualityFlags` 视为过期并清空，避免旧质量结论覆盖新内容。
- 质量检查结果必须有项目级汇总入口。`qualityFlags` 可以保留为单集结构化结果，但前端应把待修复、可继续质量债、阻断问题和未检查台本汇总到“质量问题”页，并允许用户跳转到对应集继续处理。
- 角色卡是台本、分镜和视频一致性的共享输入；编辑角色名、人设和说话风格后，后续生成应读取更新后的项目角色。
- 角色库导入是短剧工作台的一部分，导入后必须刷新项目详情，确保新角色立刻进入台本和分镜上下文。
- 来源素材页应展示最低限度的质量提示：梗概、节拍数量、角色数量和硬事实数量。提示不替代 AI 质量闸，但能避免用户在明显缺素材时继续生成。
- 来源素材不足时，工作台应提供 AI 补充建议，把缺口转成用户能回答的问题和下一步建议。补充建议属于新手引导层，不应把 `SourceBundle` 的内部字段或质量快照裸露给用户作为任务说明。
- 视频任务状态必须在项目内可刷新并可汇总查看；provider 状态、任务 id、结果链接、失败提示和重新刷新入口都属于分镜视频生产链，不应要求用户离开短剧工作台查看。
- 视频 provider 仍通过 `VideoProviderPort` 抽象接入；可用 provider 必须由后端注册表暴露给前端，前端只能让用户选择已注册 provider，不能把 provider 名称写死在按钮逻辑里。前端只能把它呈现为短剧项目内的后续生产步骤，不能把短剧工作台变成泛用视频工具。
- 通用 HTTP 视频通道只在配置 `DRAMA_VIDEO_HTTP_CREATE_URL` 后注册；可选配置包括 `DRAMA_VIDEO_HTTP_STATUS_URL`（支持 `{taskId}` 占位符）、`DRAMA_VIDEO_HTTP_API_KEY`、`DRAMA_VIDEO_HTTP_PROVIDER_ID`、`DRAMA_VIDEO_HTTP_PROVIDER_LABEL`、`DRAMA_VIDEO_HTTP_PROVIDER_DESCRIPTION` 和 `DRAMA_VIDEO_HTTP_TIMEOUT_MS`。外部接口返回的 `taskId` / `providerTaskId` / `id`、`status`、`resultUrl` / `videoUrl` 会被标准化为 `DramaVideoPrompt` 的 provider 任务状态。

## Failure Modes

- 只在列表页放“整理素材 / 生成策略 / 生成分集”按钮，会让用户无法理解产物在哪里，也无法继续生成台本、检查质量或导出。
- 让用户手填小说 ID 会把内部数据标识暴露给新手用户；导入小说必须使用已有小说选择器。
- 裸展示策略 JSON 或质量 JSON 可以作为早期调试状态，但后续应逐步卡片化为用户能理解的字段。

## Related Modules

- `client/src/pages/drama/DramaWorkspacePage.tsx`
- `client/src/pages/drama/DramaProjectPage.tsx`
- `client/src/api/drama.ts`
- `server/src/modules/drama/http/dramaRoutes.ts`
- `server/src/services/drama/DramaProjectService.ts`
