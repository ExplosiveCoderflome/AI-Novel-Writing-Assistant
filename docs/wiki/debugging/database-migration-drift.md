# 数据库 Schema 与迁移漂移

## Background

Prisma schema 描述应用当前期望的数据结构，但已安装桌面版和长期运行的服务只能通过迁移目录逐步得到该结构。如果功能只更新 `schema.prisma` / `schema.sqlite.prisma`，没有同步 PostgreSQL 与 SQLite 迁移，类型检查和 Prisma Client 生成仍可能通过，运行时却会因缺表或缺列失败。

这类故障尤其容易出现在跨模块读取中：项目级视觉资源目录会同时读取图片、漫画和短剧来源，其中任一来源的表结构缺失都会让整次目录刷新失败。它不是页面容错问题，必须在数据库迁移层修复。

## Decision

数据库结构变更必须同时维护以下三个事实源：

- `server/src/prisma/schema.prisma`：PostgreSQL 当前结构。
- `server/src/prisma/schema.sqlite.prisma`：SQLite 当前结构。
- `server/src/prisma/migrations/` 与 `server/src/prisma/migrations.sqlite/`：从历史版本升级到当前结构的路径。

补漏迁移应保持增量，不重建业务表、不删除字段、不覆盖已有内容。多个可能被用户手工补齐的对象应拆成可独立判定的迁移单元，避免一个重复字段阻断其余缺失对象的修复。

## Current Rule

- 新增或修改 Prisma model 时，必须在同一开发阶段同步两种 schema 和对应数据库迁移。
- SQLite 桌面运行时依赖迁移 SQL 中的 `CREATE TABLE`、`CREATE INDEX` 和 `ALTER TABLE ... ADD COLUMN` 结构判断迁移是否已满足；补漏迁移应保持这些语句可识别。
- 一条兼容迁移只负责一个可独立存在的字段，或一张表及其索引。不要把多张表和多个字段塞进同一条补漏迁移。
- 发布前至少验证三种状态：从空库执行全部迁移、从上一发布版本升级、部分对象已存在而其余对象仍缺失。
- 迁移验证必须检查目标表、字段、索引、已有行保留情况，以及 SQLite 的 `integrity_check` 和 `foreign_key_check`。
- SQLite 迁移完整性测试必须确认全部 Prisma model、表和字段都存在于迁移重建结果中，不能只维护当前故障对象的固定清单；历史增量迁移留下的旧表或旧字段不视为缺失故障。
- 桌面发布流程必须运行迁移回归测试，并逐条确认 `migrations.sqlite` 中的源码迁移已进入最终 `app.asar`；仅检查 PostgreSQL 迁移目录或任意迁移文件存在不足以证明桌面升级安全。
- 业务读取层不得用捕获 `P2021` / `P2022` 后忽略某个来源的方式掩盖迁移缺失；否则用户会得到不完整资源而数据库问题继续扩散。

## Examples

如果一次功能新增 `ComicCharacter.gender`、`ComicScene` 和 `ComicCharacterAsset`，推荐分别建立字段迁移和两张表迁移。这样某个用户曾手工加入 `gender` 时，桌面运行时可以只记录该字段迁移已满足，再继续创建两张缺失表。

如果从全部 SQLite 迁移重建出的数据库缺少 schema 已声明的 model 或字段，即使 Prisma schema 校验和 TypeScript 构建通过，也必须视为发布阻断。

## Failure Modes

- 只运行 `prisma validate`：它验证 schema 自身合法性，不证明迁移能够得到该结构。
- 只测试全新开发库：开发库可能经过 `db push` 或手工操作，无法代表安装包从迁移重建的结果。
- 只检查源码迁移目录：部署或打包规则仍可能漏掉新增迁移，必须核对最终产物中的 SQLite 迁移集合。
- 把多个补漏对象放进单条 SQLite 迁移：部分对象已存在时，首个重复列会回滚整条迁移。
- 只补 SQLite：服务端 PostgreSQL 部署会继续漂移。
- 在读取层忽略缺表异常：表面恢复页面，但会隐藏数据不完整并扩大后续诊断成本。

## Related Modules

- `server/src/prisma/schema.prisma`
- `server/src/prisma/schema.sqlite.prisma`
- `server/src/prisma/migrations/`
- `server/src/prisma/migrations.sqlite/`
- `server/src/db/runtimeMigrations.ts`
- `server/tests/runtimeMigrations.test.js`
- `server/tests/prismaMigrationCompleteness.test.js`

## Source Documents

- [项目级视觉资源目录](../architecture/visual-asset-catalog.md)
- [重复故障模式与排查路径](./recurring-failure-modes.md)
