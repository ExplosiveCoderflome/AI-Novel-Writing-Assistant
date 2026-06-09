# 日志保留与轮转规则

## Background

项目同时存在桌面主进程日志、服务端开发会话日志、LLM 调试 JSONL 和结构化修复 JSONL。它们主要用于本地排障和开发诊断，不应无限增长，也不应和数据库里的自动导演事件、任务恢复证据混为一类。

## Current Rule

文件日志清理只处理日志目录中的已知后缀：

- `.log`
- `.meta.json`
- `.llm.jsonl`
- `.llm-repair.jsonl`

默认保留策略：

- 普通日志和会话元数据保留 30 天。
- LLM 调试日志保留 14 天。
- LLM repair 日志保留 30 天。
- 最近 24 小时内修改过的文件不自动删除。
- 当前活跃日志超过 50MB 时轮转为带时间戳的历史文件，新内容继续写入原活跃路径。

## Boundary

日志清理不得删除数据库事件表、小说数据、生成图片、备份目录或未知后缀文件。自动导演的 `DirectorEvent`、`DirectorRuntimeEvent`、`DirectorLlmUsageRecord` 等数据库记录属于运行时账本和恢复证据，不参与文件日志清理。

如果未来需要清理数据库事件，必须单独设计归档、导出和恢复验证策略，不能复用文件日志 TTL 规则。

## Configuration

可通过环境变量调整默认策略：

- `AI_NOVEL_LOG_CLEANUP_ENABLED`
- `AI_NOVEL_LOG_RETENTION_DAYS`
- `AI_NOVEL_LLM_LOG_RETENTION_DAYS`
- `AI_NOVEL_LOG_MAX_FILE_MB`
- `AI_NOVEL_LOG_MIN_AGE_HOURS`

`scripts/run-with-log.cjs` 还支持 `--retention-days`、`--llm-retention-days`、`--max-file-mb` 和 `--no-cleanup`，用于临时覆盖开发会话清理行为。

## Failure Modes

- 清理失败必须只记录警告，不能阻塞服务端启动或桌面启动。
- 目录不存在时视为无需清理。
- 未知文件必须保留，避免误删用户手动放入日志目录的诊断材料。
- 排障期间需要保留完整上下文时，可以设置 `AI_NOVEL_LOG_CLEANUP_ENABLED=false` 或在开发脚本中使用 `--no-cleanup`。

