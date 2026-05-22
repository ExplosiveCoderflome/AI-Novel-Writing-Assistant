# 小说导出模块

## Background

小说导出需要同时读取项目设定、故事宏观规划、角色准备、卷规划、章节执行和质量修复等多个阶段的数据。它是跨模块读取能力，但不应该成为这些阶段的事实源，也不应该把导出格式逻辑散落到 `services/novel` 根目录。

## Boundary

- `novelExport.service.ts` 负责应用编排：读取导出所需数据、组装导出 bundle，并按格式分发。
- `novelExport.mappers.ts` 负责把数据库行和小说服务返回值转换成稳定导出 DTO。
- `novelExport.formatting.ts` 负责 TXT、Markdown、JSON payload 的文件名和内容格式。
- `novelExport.types.ts` 负责模块内部和对外复用的导出结构类型。
- `index.ts` 是模块门面。外部代码应从 `server/src/modules/export` 引入导出能力。

## Current Rule

导出模块只能读取已有生产数据并生成文件内容，不直接修改小说、章节、角色、时间线、质量报告或流水线状态。新增导出范围时，先扩展导出 section 类型和 mapper，再由 service 组装；不要在路由层或前端临时拼接后端内部数据结构。

`server/src/services/novel/NovelExportService.ts` 只保留兼容再导出，旧路径不再承载实现。
