# 桌面首启检查、备份恢复 UI 与日志统一最小落地计划

## 范围

本计划只覆盖三项稳定性改进：

1. 桌面端首启检查：让用户在第一次打开桌面版时清楚知道本地服务、数据库、模型配置、日志路径是否可用。
2. 备份 / 恢复 UI：把现有数据库导入前备份能力扩展成可见、可操作、可恢复的维护入口。
3. 日志系统统一：在不大改业务代码的前提下，先收束日志入口、日志路径、日志留存和排障导出。

本计划不改变现有 HTTP API 业务契约，不把核心业务迁到 Electron IPC，不做数据库破坏性操作。

## 现状盘点

### 桌面启动边界

- 桌面主进程入口在 `desktop/src/main.ts`。
- 本地服务启动和健康检查在 `desktop/src/runtime/server.ts`。
- 桌面启动状态通过 `desktop/src/runtime/state.ts` 维护，并由 `desktop:bootstrap-state-changed` 推给前端。
- 前端启动遮罩在 `client/src/components/layout/DesktopBootstrapBoundary.tsx` 与 `client/src/components/layout/DesktopBootstrapShell.tsx`。
- 桌面运行时配置由 `desktop/src/runtime/paths.ts` 注入到 `window.__AI_NOVEL_RUNTIME__`。
- 当前已有阶段：`launching`、`app-ready`、`splash-shown`、`server-starting`、`server-healthy`、`renderer-ready`、`main-window-shown`、`error`。
- 风险点：部分桌面启动与设置页中文文案看起来存在编码损坏，需要单独修复，否则排障 UI 会降低可信度。

### 备份 / 恢复能力

- 旧数据库导入逻辑在 `desktop/src/runtime/dataImport.ts`。
- 导入前会备份当前桌面数据库 bundle：`dev.db`、`dev.db-wal`、`dev.db-shm`。
- 备份目录为桌面应用数据目录下的 `backups/database-imports`。
- 导入失败时已有自动恢复逻辑：`restoreDatabaseBundle(...)`。
- 前端已有导入卡片：`client/src/components/layout/DesktopLegacyDataImportCard.tsx`。
- 设置页维护区入口在 `client/src/pages/settings/components/SettingsMaintenanceSection.tsx`，目前包含桌面更新和旧库导入。
- 缺口：没有“创建当前备份”“查看备份列表”“从备份恢复”“打开备份目录”的通用 UI；`restoreDatabaseBundle` 目前是内部函数，未暴露给 IPC。

### 日志系统

- 桌面端文件日志在 `desktop/src/runtime/logging.ts`。
- 桌面端日志留存在 `desktop/src/runtime/logRetention.ts`。
- 服务端日志留存在 `server/src/platform/logging/logRetention.ts`。
- 服务端日志根目录来自 `server/src/runtime/appPaths.ts` 的 `resolveLogsRoot()`。
- 桌面端 IPC 已有：
  - `desktop:open-logs-directory`
  - `desktop:copy-log-path`
- 前端桌面启动页已有打开日志目录和复制日志路径操作。
- 服务端仍有大量 `console.log` / `console.warn` / `console.error` 直接调用，主要分布在 `server/src/app.ts`、worker、RAG、章节运行时、图像运行时等模块。
- 缺口：没有统一 server logger facade；桌面托管服务输出虽然会被主进程捕获到桌面日志，但服务端自身运行时日志格式和文件落点还没有完全统一。

## 最小可落地改进

### A. 首启检查卡片

目标：在 `/settings` 的“系统维护”区新增桌面首启检查卡片，先做只读诊断，不做自动修复。

建议新增：

- `client/src/components/layout/DesktopStartupReadinessCard.tsx`
- `desktop/src/runtime/readiness.ts`
- `desktop/src/preload.ts` 增加 `getStartupReadinessSnapshot`
- `desktop/src/main.ts` 增加 IPC：`desktop:get-startup-readiness-snapshot`
- `client/src/lib/desktop.ts` 增加类型和读取函数

首版检查项：

- 本地服务是否健康：请求当前 runtime 的 `/api/health`。
- 当前数据库路径是否存在：复用 `dataImport.ts` 里解析出的桌面数据库路径，或抽出公共 path helper。
- 日志目录是否可写：检查 `resolveDesktopLogsDir()` 可创建并写入。
- 模型配置是否至少有一个 provider：通过现有 `/api/settings/api-keys` 判断，不新增后端接口。
- 备份目录是否可写：检查 `backups/database-imports` 或未来通用备份目录。

UI 行为：

- 桌面运行时才显示。
- 每项状态用 `ready` / `warning` / `error` / `checking`。
- 提供三个操作：重新检查、打开日志目录、进入模型设置。
- 不自动修改数据库，不自动写入 API Key，不自动执行恢复。

### B. 备份 / 恢复 UI

目标：先把现有导入前备份能力扩展成用户可见的维护能力。

建议新增：

- `desktop/src/runtime/databaseBackup.ts`
- `client/src/components/layout/DesktopDatabaseBackupCard.tsx`

建议从 `dataImport.ts` 抽出或复用这些能力：

- 数据库 bundle 路径：`dev.db`、`dev.db-wal`、`dev.db-shm`
- SQLite header 校验
- 备份目录命名
- bundle copy / remove / restore

IPC 建议：

- `desktop:get-database-backup-snapshot`
- `desktop:create-database-backup`
- `desktop:open-database-backup-directory`
- `desktop:restore-database-backup`

首版 UI：

- 显示当前数据库路径。
- 显示备份目录。
- 显示最近 5 个备份：时间、大小、是否包含主库文件。
- 按钮：创建备份、打开备份目录。
- 恢复操作首版可以先只提供“复制恢复说明 / 打开目录”，第二阶段再接一键恢复。

一键恢复安全要求：

- 必须弹系统确认框。
- 恢复前必须再创建一个 `before-restore` 备份。
- 恢复时必须关闭或停止托管 server，恢复完成后重启应用。
- 恢复后至少校验 SQLite header 和核心业务表存在。
- 失败时恢复 `before-restore` 备份。

### C. 日志统一第一步

目标：先加统一 facade，不要求一次性改完所有调用。

建议新增：

- `server/src/platform/logging/logger.ts`

接口建议：

```ts
export const logger = {
  info(source: string, message: string, meta?: unknown): void,
  warn(source: string, message: string, meta?: unknown): void,
  error(source: string, message: string, error?: unknown, meta?: unknown): void,
};
```

首批替换范围：

- `server/src/app.ts`
- `server/src/workers/directorWorker.ts`
- `server/src/workers/DirectorTaskQueue.ts`
- `server/src/db/sqliteRetry.ts`
- `server/src/events/EventBus.ts`

落地原则：

- 第一阶段 logger 仍可写到 `console`，保持部署行为不变。
- 当 `AI_NOVEL_RUNTIME=desktop` 或 `AI_NOVEL_APP_DATA_DIR` 存在时，同时写入应用数据目录下的 server log 文件。
- 保留 morgan HTTP 日志，但输出函数改走 logger。
- 结构化 meta 统一 JSON 序列化，避免 `[object Object]`。
- 错误对象统一输出 `stack || message`。

## 推荐实施顺序

### 第 1 阶段：文案和只读诊断

1. 修复桌面启动页和设置维护区的中文编码损坏。
2. 新增首启检查只读 snapshot。
3. 在设置页“系统维护”区显示首启检查卡片。
4. 验证桌面开发模式和 Web 模式都不报错。

验收：

- Web 模式不显示桌面维护卡片。
- 桌面模式能看到服务、数据库、日志、模型配置检查。
- 健康检查失败时用户能打开日志目录。

### 第 2 阶段：备份可见化

1. 抽出 `databaseBackup.ts`。
2. 保持旧库导入使用同一套备份函数。
3. 增加备份列表和创建备份 IPC。
4. 设置页新增备份卡片。

验收：

- 能手动创建备份。
- 能看到最近备份。
- 导入旧库仍会创建导入前备份。
- 不提供未经确认的一键恢复。

### 第 3 阶段：安全恢复

1. 增加恢复前确认。
2. 恢复前自动创建 `before-restore` 备份。
3. 恢复后重启应用。
4. 失败后回滚。

验收：

- 恢复目标不存在时会拒绝。
- 恢复前备份失败时不会继续。
- 恢复失败会尝试回滚。
- 恢复成功后应用重启并能通过 `/api/health`。

### 第 4 阶段：日志 facade 渐进迁移

1. 新增 server logger facade。
2. 替换启动、worker、队列、SQLite retry、EventBus 的日志。
3. 增加“打开日志目录 / 复制日志路径 / 导出诊断包”的 UI 入口。
4. 后续按模块逐步替换 RAG、章节运行时、图像运行时日志。

验收：

- 开发模式 console 输出仍存在。
- 桌面模式日志能落到应用数据目录。
- 日志留存清理仍生效。
- 错误日志包含 source、message、stack、可选 meta。

## 建议文件改动清单

首批代码文件：

- `desktop/src/runtime/readiness.ts`
- `desktop/src/runtime/databaseBackup.ts`
- `desktop/src/main.ts`
- `desktop/src/preload.ts`
- `client/src/lib/desktop.ts`
- `client/src/components/layout/DesktopStartupReadinessCard.tsx`
- `client/src/components/layout/DesktopDatabaseBackupCard.tsx`
- `client/src/pages/settings/components/SettingsMaintenanceSection.tsx`
- `server/src/platform/logging/logger.ts`

首批文档文件：

- `docs/wiki/debugging/log-retention.md`
- `docs/wiki/workflows/desktop-release-versioning.md`
- `docs/public/troubleshooting.md`

## 不建议现在做的事

- 不直接把所有 `console.*` 一次性替换完，风险和 review 噪音都太大。
- 不在首版恢复 UI 中提供无确认恢复。
- 不修改核心小说生产 API。
- 不把桌面健康检查做成阻塞式强制修复。
- 不在没有备份验证的情况下做任何数据库覆盖。

## 当前结论

这三项都有现成落点：桌面启动状态、设置页维护区、旧库导入备份、桌面日志 IPC 已经存在。最稳的路线是先做“只读首启检查 + 手动备份可见化 + logger facade”，再把恢复和日志迁移逐步推进。
