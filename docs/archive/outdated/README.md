# 过时文档归档索引

本目录保留已经不适合作为当前开发依据的历史文档。归档原因通常是：

- 文档内容已经乱码，不再可读。
- 文档描述的是早期计划，已经被后续 release notes、Wiki 或新的执行计划取代。
- 文档仍有历史参考价值，但继续放在 `docs/plans` 或 `docs/checkpoints` 会误导未来开发者和 AI Agent。

归档文档不应作为当前实现依据。需要当前规则时，优先阅读 `docs/wiki/`、`docs/releases/release-notes.md`、仍留在 `docs/plans/` 的活跃计划，以及模块 README。

## 自动导演相关

- [Auto Director Progress Audit 2026-04-13](./auto-director-progress-audit-2026-04-13-garbled.md)：文件内容已乱码，且自动导演当前状态已由 2026-05-08 至 2026-05-14 的 release notes、[自动导演 Runtime 与恢复边界](../../wiki/workflows/auto-director-runtime.md) 和 [导演模式模块化与状态治理改造清单](../../plans/director-mode-module-state-refactor-checklist.md) 覆盖。
- [Auto Director Runtime Full Execution Plan 2026-04-29](./auto-director-runtime-full-execution-plan-2026-04-29-garbled.md)：文件内容已乱码；可读的执行面隔离规则保留在 [自动导演执行面隔离与 API 保活计划](../../plans/auto-director-execution-plane-isolation-plan.md) 和 Wiki。
- [Auto Director Unified Runtime Refactor Plan 2026-04-28](./auto-director-unified-runtime-refactor-plan-2026-04-28-garbled.md)：文件内容已乱码；长期边界已提炼到 [自动导演 Runtime 与恢复边界](../../wiki/workflows/auto-director-runtime.md)。
- [Auto Director MVP Migration Plan 2026-04-28](./auto-director-mvp-migration-plan-2026-04-28.md)：早期 MVP 切片，已被 5 月的后台命令、恢复、投影和章节执行发布事实取代；仅保留为历史迁移背景。

## 已被当前实现取代的早期计划

- [Desktop Plan 2026-04-17](./desktop-plan-2026-04-17.md)：文档仍停留在“未进入可分发打包”阶段；当前桌面发布已推进到 2026-05-14 release notes 中的 Windows 客户端包。
- [Knowledge Module Plan](./knowledge-module-plan-implemented-reference.md)：知识库文档、绑定、索引和检索能力已进入当前产品；长期规则已沉淀到 [知识库与上下文组装](../../wiki/rag/knowledge-and-context-assembly.md)。
- [Progress Audit](./progress-audit-superseded.md)：早期 TASK 对照审计，里面的许多“未实现”判断已被后续实现和 release notes 取代。
