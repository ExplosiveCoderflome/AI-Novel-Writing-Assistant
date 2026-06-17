# 小说版本快照保留规则

## Background

小说版本快照用于恢复大纲、拆章、正文和卷工作台状态。自动导演和批量章节生产会在关键节点写入快照，保护生成链路中的可恢复性；但如果每次自动节点都保存整本小说全量内容，本地 SQLite 会快速膨胀，并拖慢版本历史列表、备份和开发启动前的数据同步。

## Decision

自动快照是运行时安全网，不是长期版本库。系统只保留每本小说最近的自动快照窗口，用户主动创建的手动快照长期保留。列表接口只展示快照元数据，恢复接口才读取完整快照内容。

## Current Rule

- 自动快照包括 `before_pipeline` 和 `auto_milestone`，两类合并计数。
- 每本小说默认保留最近 10 份自动快照，可通过 `NOVEL_SNAPSHOT_RETENTION_COUNT` 调整。
- `manual` 快照不参与自动裁剪，恢复前自动创建的手动备份也必须保留。
- 创建自动快照后立即尝试裁剪旧自动快照；裁剪失败只记录警告，不阻断章节生产链。
- `GET /novels/:id/snapshots` 只返回 `id`、`novelId`、`label`、`triggerType` 和 `createdAt`，不能返回 `snapshotData`。
- 一次性存量治理使用 `server/scripts/prune-snapshots.cjs`，默认 dry-run；执行删除前必须创建已校验的 SQLite 备份，并在删除后执行 `VACUUM` 回收磁盘空间。

## Failure Modes

- 如果版本历史列表重新变慢，优先检查列表接口或前端是否重新读取了 `snapshotData`。
- 如果 `NovelSnapshot` 继续成为数据库最大表，优先检查自动快照裁剪是否被跳过、环境变量是否配置过大、或是否有新 triggerType 没被纳入自动快照集合。
- 如果清理脚本执行失败，先确认开发服务已停止、备份目录可写、目标数据库是 SQLite `file:` URL，并查看 `PRAGMA quick_check` 是否通过。

## Related Modules

- `server/src/services/novel/novelCoreSnapshotService.ts`
- `server/src/services/novel/application/NovelApplicationServices.ts`
- `server/scripts/prune-snapshots.cjs`
- `client/src/pages/novels/components/VersionHistoryTab.tsx`
