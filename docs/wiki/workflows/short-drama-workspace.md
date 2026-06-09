# 短剧工作台流程边界

## Background

短剧模块的目标不是给小说详情页增加一个下游按钮，而是形成独立的竖屏付费短剧创作平台。用户通常不理解短剧赛道、付费卡点、分镜或视频提示词，因此前端工作台必须把后端能力组织成清晰的主流程，而不是暴露一组零散接口。

## Decision

短剧项目必须有独立工作台。项目列表只负责创建和进入项目；项目详情页负责承载“素材 -> 策略 -> 分集 -> 台本 -> 质量 -> 分镜视频 -> 导出”的连续推进。

## Current Rule

- `/drama` 是短剧入口和项目列表，不承载完整生产链。
- `/drama/projects/:id` 是项目工作台，必须展示当前项目的来源素材、策略、分集、角色、质量状态、分镜视频和导出入口。
- `GET /api/drama/projects/:id` 应返回工作台首屏需要的聚合数据，包括 `sourceBundle`、`characters`、`episodes`、`storyboards`、`shots` 和 `videoPrompts`。
- 前端可以提供主路径快捷按钮，但按钮必须服务于可见产物：生成后用户应能立即看到素材、策略、分集、台本或质量结果。
- 视频 provider 仍通过 `VideoProviderPort` 抽象接入；前端只能把它呈现为短剧项目内的后续生产步骤，不能把短剧工作台变成泛用视频工具。

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
