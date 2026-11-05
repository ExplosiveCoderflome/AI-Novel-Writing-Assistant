# 小说导出模块

## Background

小说导出需要同时读取项目设定、故事宏观规划、角色准备、卷规划、章节执行和质量修复等多个阶段的数据。它是跨模块读取能力，但不应该成为这些阶段的事实源，也不应该把导出格式逻辑散落到 `services/novel` 根目录。

## Boundary

- `novelExport.service.ts` 负责应用编排：读取导出所需数据、组装导出 bundle，并按格式分发。
- `novelExport.mappers.ts` 负责把数据库行和小说服务返回值转换成稳定导出 DTO。
- `novelExport.formatting.ts` 负责 TXT、Markdown、JSON payload 的文件名和内容格式。
- `novelExport.types.ts` 负责模块内部和对外复用的导出结构类型。
- `infrastructure/chapterArchive.ts` 负责分章正文的 ZIP 适配：使用服务端依赖 `archiver` 编码和压缩，消费输出流后异步返回完整 Buffer。桌面日志打包属于独立运行时，不复用此适配器或共享 ZIP 工具。
- `index.ts` 是模块门面。外部代码应从 `server/src/modules/export` 引入导出能力。

## Current Rule

导出模块只能读取已有生产数据并生成文件内容，不直接修改小说、章节、角色、时间线、质量报告或流水线状态。新增导出范围时，先扩展导出 section 类型和 mapper，再由 service 组装；不要在路由层或前端临时拼接后端内部数据结构。

`server/src/services/novel/NovelExportService.ts` 只保留兼容再导出，旧路径不再承载实现。

正文 ZIP 与 TXT 一样只接受 `full` 范围。长篇按章输出 UTF-8 TXT，文件名含补零章序和安全标题；短篇使用正式保存的分段正文合并为作品文件。HTTP 层必须原样发送二进制内容及 `application/zip`，不能先转换成字符串。中文条目名必须设置 ZIP 的 UTF-8 标志，避免系统解压工具误判编码。

ZIP 格式细节（目录、校验和、编码标志等）交给成熟归档库维护，不在业务模块或 shared 手写。应用层必须等待归档输出流结束后再返回 Buffer，并传播归档失败；仅调用 `finalize()` 不能代替消费流。回归测试通过独立 ZIP 读取库检查条目名和正文，不依赖本地文件头布局。
