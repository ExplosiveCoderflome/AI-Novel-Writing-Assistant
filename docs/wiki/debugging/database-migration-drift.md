# 数据库 Schema 与迁移漂移

## Background

Prisma schema 描述应用当前期望的数据结构，但已安装桌面版和长期运行的服务只能通过迁移目录逐步得到该结构。如果功能只更新 `schema.prisma` / `schema.sqlite.prisma`，没有同步 PostgreSQL 与 SQLite 迁移，类型检查和 Prisma Client 生成仍可能通过，运行时却会因缺表或缺列失败。

这类故障尤其容易出现在跨模块读取中：项目级视觉资源目录会同时读取图片、漫画和短剧来源，其中任一来源的表结构缺失都会让整次目录刷新失败。它不是页面容错问题，必须在数据库迁移层修复。

## Decision

数据库结构变更必须同时维护以下三个事实源：

- `server/src/prisma/schema.prisma`：PostgreSQL 当前结构。
- `server/src/prisma/schema.sqlite.prisma`：SQLite 当前结构。
- `server/src/prisma/migrations/` 与 `server/src/prisma/migrations.sqlite/`：从历史版本升级到当前结构的路径。

补漏迁移应保持增量，不重建业务表、不删除字段、不覆盖已有内容。已入库的历史 PostgreSQL 迁移文件不要为了给新鲜空库让路而改写 checksum；新鲜空库走下文的当前 schema 基线登记，存量库走增量 `migrate deploy`。多个可能被用户手工补齐的对象应拆成可独立判定的迁移单元，避免一个重复字段阻断其余缺失对象的修复。

## Current Rule

- 新增或修改 Prisma model 时，必须在同一开发阶段同步两种 schema 和对应数据库迁移。
- SQLite 桌面运行时依赖迁移 SQL 中的 `CREATE TABLE`、`CREATE INDEX` 和 `ALTER TABLE ... ADD COLUMN` 结构判断迁移是否已满足；补漏迁移应保持这些语句可识别。
- 一条兼容迁移只负责一个可独立存在的字段，或一张表及其索引。不要把多张表和多个字段塞进同一条补漏迁移。
- 发布前至少验证三种状态：从空库执行全部迁移、从上一发布版本升级、部分对象已存在而其余对象仍缺失。
- 迁移验证必须检查目标表、字段、索引、已有行保留情况，以及 SQLite 的 `integrity_check` 和 `foreign_key_check`。
- SQLite 迁移完整性测试必须确认全部 Prisma model、表和字段都存在于迁移重建结果中，不能只维护当前故障对象的固定清单；历史增量迁移留下的旧表或旧字段不视为缺失故障。
- 桌面发布流程必须运行迁移回归测试，并逐条确认 `migrations.sqlite` 中的源码迁移已进入最终 `app.asar`；仅检查 PostgreSQL 迁移目录或任意迁移文件存在不足以证明桌面升级安全。
- 业务读取层不得用捕获 `P2021` / `P2022` 后忽略某个来源的方式掩盖迁移缺失；否则用户会得到不完整资源而数据库问题继续扩散。
- 灰度开关不能替代 Schema 就绪检查。新增功能的读取路径也必须核对：暂停投影和运行列表可能先于写入入口访问新表，即使没有生成正文，也会因缺表阻断恢复界面。
- 启用真实入口前，在目标版本升级的验收环境完成结构校验。结构不满足时应提供可操作的启动或部署错误，不能让轮询将原始 ORM 栈反复推送给用户，也不能以空结果伪装成任务完成。

## Examples

如果一次功能新增 `ComicCharacter.gender`、`ComicScene` 和 `ComicCharacterAsset`，推荐分别建立字段迁移和两张表迁移。这样某个用户曾手工加入 `gender` 时，桌面运行时可以只记录该字段迁移已满足，再继续创建两张缺失表。

如果从全部 SQLite 迁移重建出的数据库缺少 schema 已声明的 model 或字段，即使 Prisma schema 校验和 TypeScript 构建通过，也必须视为发布阻断。

## Failure Modes

- 只运行 `prisma validate`：它验证 schema 自身合法性，不证明迁移能够得到该结构。
- 只测试全新开发库：开发库可能经过 `db push` 或手工操作，无法代表安装包从迁移重建的结果。
- 只检查源码迁移目录：部署或打包规则仍可能漏掉新增迁移，必须核对最终产物中的 SQLite 迁移集合。
- 把多个补漏对象放进单条 SQLite 迁移：部分对象已存在时，首个重复列会回滚整条迁移。
- 将开发启动的 `db push` 等同于迁移部署：它可同步表结构，却不会自动补齐 `_prisma_migrations` 的部署历史。表已存在但迁移未登记时，不可直接重放 CREATE TABLE 或猜测标记已应用；先核对历史基线。新鲜空 PostgreSQL 应使用 `scripts/deploy-prisma-postgres.cjs`，而不是把 `db push` 或直接 `prisma migrate deploy` 当成已通过。
- 只补 SQLite：服务端 PostgreSQL 部署会继续漂移。
- 在读取层忽略缺表异常：表面恢复页面，但会隐藏数据不完整并扩大后续诊断成本。
- 只用完整 Schema 临时库验收：无法证明实际安装或开发数据库具备新增进度表。暂停预算读取可能同时拖垮来源页和运行列表，并掩盖最初的暂停原因。
- **空 PostgreSQL 上直接 `prisma migrate deploy` 失败（历史基线流程问题，非 0.8.2 新增 SQL 回归）**：该缺陷在 `origin/main`（`ae11c01c`）已存在。`server/src/prisma/migrations/` 的第一条 `20260328120000_schema_gap_backfill` 含 SQLite `DATETIME`，空库会以 `type "datetime" does not exist` 在进入真正的 `20260413120000_postgresql_baseline` 之前就失败。即便把首条标记为 applied，后续如 `20260419123000_schema_column_backfill` 仍可能与 baseline 已建列冲突，且中间还有其它 SQLite 方言记录（如 `StyleExtractionTask` 的 `DATETIME`）。**禁止为了让空库 deploy 变绿而就地改写这些历史 `migration.sql` 的 checksum。** 也**不得把 `db push` 成功说成 migrate deploy 通过**。
- **官方空库 / 存量库路径**见下文「PostgreSQL 部署策略」：新鲜空库使用 `scripts/deploy-prisma-postgres.cjs --fresh-empty-ok`（按当前 `schema.prisma` 生成基线 SQL，再 `migrate resolve --applied` 登记现有文件夹，最后 `migrate deploy`）。已有 `_prisma_migrations` 的库存量库只跑 `migrate deploy`。有表但无迁移历史的遗留库必须人工对照 schema 后再决定是否 stamp，脚本拒绝自动 stamp。



## PostgreSQL 部署策略

这是历史迁移链的基线方案，不是对已应用记录的自动改写。

判定（本仓库 `scripts/deploy-prisma-postgres.cjs`）：

安全检查会读取 `DATABASE_URL` 的 `?schema=` 或 `search_path`（默认 `public`），并扫描所有非系统 schema 的表、视图、序列和用户类型。仅有视图/序列、或对象不在 `public` 时不得判为空库。失败历史不得当作已管理库。验收 harness（`scripts/acceptance/pg-cloud-harness.cjs`）使用两个一次性数据库：一个只保留 raw `migrate deploy` 证据，另一个跑官方空库路径。


| 数据库状态 | 官方动作 |
| --- | --- |
| 空库（目标 schema 与所有非系统 schema 都没有用户对象，且无成功或失败的 `_prisma_migrations` 行） | 须显式 `--fresh-empty-ok`。用 `prisma migrate diff --from-empty --to-schema=src/prisma/schema.prisma --script` 应用**当前** PostgreSQL schema，再按时间顺序 `migrate resolve --applied` 登记现有文件夹（checksum 取自未改动的历史文件），然后 `migrate deploy` 只处理此后新增的文件夹。 |
| 已有成功的 `_prisma_migrations` 历史，且没有失败/未完成/已回滚行 | 只执行 `prisma migrate deploy`。不重放、不改写已登记记录。0.8.2 的三条增量（`20261111140000` / `20261111150000` / `20261112090000`）若尚未应用，由此路径落下。 |
| `_prisma_migrations` 含失败、未完成或已回滚行 | **拒绝**自动 resolve、baseline 或 deploy，保留失败证据。官方空库路径必须换一个全新的一次性空库，不得在同一库上接续（避免 P3009）。 |
| 有用户对象（含表、视图、物化视图、序列、外部/分区表、用户类型；含非 `public` schema），但没有可用的 Prisma 迁移历史（例如只做过 `db push`） | **拒绝自动 stamp**。先备份，再用 `migrate diff --from-config-datasource --to-schema` 核对。diff 非空时先补结构；仅当 diff 为空时，由运维按时间顺序手工 `migrate resolve --applied`，再 `migrate deploy`。 |

命令：

```bash
AI_NOVEL_DATABASE_MODE=postgresql DATABASE_URL='postgresql://...' \
  node scripts/deploy-prisma-postgres.cjs --dry-run

AI_NOVEL_DATABASE_MODE=postgresql DATABASE_URL='postgresql://...' \
  node scripts/deploy-prisma-postgres.cjs --fresh-empty-ok
```

约束：

- 不要修改已入版本库的历史 `migration.sql` 来“修正”方言，以免已 stamp 或已部分登记的存量 PostgreSQL 出现 checksum 失败。
- 不要对用户库或默认开发库使用本脚本，除非运维明确指定该 `DATABASE_URL`。
- 禁止 `migrate reset`、`db push` 作为正式迁移，禁止 drop/truncate 用户数据。
- 0.8.2 新增的三条 PostgreSQL 迁移本身是 PG 方言（`TIMESTAMP(3)` / `ADD COLUMN "penName"` 等）；空库 `migrate deploy` 失败发生在它们之前，属于既有链不可从空库重放，不是这三条 SQL 写错。

## 跨平台 checksum 与独立 PG 发版门禁

- 迁移 checksum 以 Git blob 原始字节为准。`.gitattributes` 对两条迁移链的 `migration.sql` 使用 `-text`，禁止 `core.autocrlf` 在检出/写入时转换换行；不要对历史文件执行 renormalize。已有 Windows 工作区应先保存改动，再以该属性重新检出干净迁移文件；也可在首次检出前使用 `git -c core.autocrlf=false clone ...`。
- `20260328120000_schema_gap_backfill` 的 PG 文件原始 LF 为 24,338 字节，SHA256 `5bf4956aa923295d6f409a85c41bf35f14a41b609024c8828fae154a5c1d4c09`。仅转换 474 个 LF 为 CRLF 后为 24,812 字节，SHA256 `6375cbbd24723b81cf43cda7d261a83d85fd51da98b3a1b180a09b03e2a3dec5`。出现此对 checksum 时先核查检出字节，不改历史 SQL 或数据库台账。
- checksum 换行证据不能解释独立的 `migrate diff` 失败；须取得该次 Windows 子进程完整 stderr、退出码及命令后再定位。
- 普通 `fast`、`integration`、`all` catalog 排除需要真实 PG 的 `pgCloudAcceptance.harness`。独立 `pg-live` catalog 由官方 `scripts/acceptance/pg-cloud-harness.cjs` 调用；缺 `PG_ADMIN_URL` 必须失败。
- 桌面 release/beta workflow 必须依赖可复用 PG job 成功；只下载当前 workflow run/attempt 的 artifact。上传守卫核对 proof 的 SHA、run ID、attempt，拒绝缺失、失败、过期或其他运行的证明。可信来源是 required job 的实际执行和 Actions artifact 传递；本地手写 JSON 不能充当 CI 验收。
- 原始迁移链失败只作诊断证据，官方空库部署与 5 项 PG harness 均成功才能生成 proof；一次性数据库保留，验收后停止其隔离集群。

## Related Modules

- `server/src/prisma/schema.prisma`
- `server/src/prisma/schema.sqlite.prisma`
- `server/src/prisma/migrations/`
- `server/src/prisma/migrations.sqlite/`
- `server/src/db/runtimeMigrations.ts`
- `server/tests/runtimeMigrations.test.js`
- `server/tests/prismaMigrationCompleteness.test.js`
- `scripts/deploy-prisma-postgres.cjs`
- `server/tests/postgresMigrateDeployPath.test.js`

## Source Documents

- [项目级视觉资源目录](../architecture/visual-asset-catalog.md)
- [重复故障模式与排查路径](./recurring-failure-modes.md)
