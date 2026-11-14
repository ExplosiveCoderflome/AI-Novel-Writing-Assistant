# 桌面发布检查证明边界

## Background

桌面发布包含可移植检查、PostgreSQL live 验收、以及按平台 stage／打包。把可移植检查串在 PG gate 之后、或在发布 job 内再次 stage／electron-builder，会拉长关键路径；Mac 双架构若各自 `--publish always`，还会竞态覆盖 `latest-mac.yml`。

## Decision

- `pg-live-gate`、`release-checks`、各 OS／arch `build-*` 尽可能并行。
- `release-checks` 只产出可移植证明，不依赖、不下载 PG proof。
- 每个平台只 stage／pack 一次（`--publish never`）；Windows 签名在构建阶段完成。
- 唯一上传入口 `publish-release` 在全部所需检查成功后，校验双证明 + 构建清单摘要，再上传既有产物与更新元数据；不再次 stage 或 electron-builder 重建。
- Mac 双架构的 `latest-mac.yml` 在上传前集中合并，避免竞态丢架构。

## Current Rule

### 可移植检查证明

必须同时匹配：

- checkout 的 `HEAD`；
- `GITHUB_RUN_ID` 与 `GITHUB_RUN_ATTEMPT`；
- `desktop/package.json` 的稳定版本；
- 固定可移植检查清单（含 `test:quality`）；
- `status=passed`。

工作区中的 `.tmp/desktop-release/<SHA>.json` 只服务本地检查复用，不能作为 CI 信任根。

### PG live proof

`.tmp/pg-live-gate.json` 仍是 run-scoped 发布证据。上传入口与 `verify-proof.cjs` / `verifyUpload` 必须 fail-closed。`check.cjs`（含 `workflow_dispatch` verify-only）在 CI 中仍要求当前 run 的 PG proof；本地非 CI 仍执行 `test:pg-live`。

### 构建清单

每个 `build-*` job 写入 `build-manifest.json`，绑定 head／run／attempt／version／os／arch，并记录允许上传文件的 size／sha256／sha512。上传前必须：

- 清单与当前 run／attempt／HEAD／版本／平台一致；
- 文件名为 basename，路径不得逃逸构建目录；
- 拒绝符号链接与非普通文件；
- 磁盘字节摘要与清单一致；
- 现网所需安装包、blockmap（如有）与 `latest*.yml` 齐全。

构建 job 权限为 `contents: read`，不提供发布用 GH token。签名／打包字节在写入 `build-manifest.json` 之前固定；manifest 与 `latest*.yml` 的 sha512／size 必须一致。上传 job 只上传已校验字节，不得改写安装包后再传；先传安装包与 blockmap，再传更新元数据。Mac 双架构在上传前合并为完整 `latest-mac.yml`，并与两侧 manifest 摘要核对。各平台各自 `stage:desktop`，不得跨 OS／arch 共用 native stage 产物。

### 平台专属保留

- Windows：真实 Prisma 生产 probe（`windows-publish-path-verify`）、PE／布局验证（`verify-desktop-package`）、NSIS／portable 打包与构建期签名。
- 已在 Ubuntu `test:all`／`test:quality` 覆盖的迁移与 quality 门禁不在 Windows 发布路径重复执行。
- macOS／Linux：本平台打包契约与原生构建检查保留在对应 `build-*` job。

## Failure Modes

缺少 PG proof、缺少 checks 证明、失败状态、错误 head／run／attempt／version／os／arch／hash、缺更新文件、路径逃逸或符号链接，都必须拒绝上传。`workflow_dispatch` 不得进入上传。`publish-artifacts.cjs --dry-run` 可验证计划但不上传。

### Windows Prisma 子进程

Windows 的 `.cmd` 批处理入口不能通过 `spawnSync(..., { shell: false })` 直接运行；典型证据是 `EINVAL` 且 status/signal 均为 null，此时 Prisma 尚未执行。官方 PostgreSQL 部署脚本从 server 工作区解析 `prisma/build/index.js`，用 `process.execPath` 和参数数组启动，避免 shell 解释路径空格与元字符，并保留超时、signal、stdout/stderr 和启动错误诊断。

非发布 Windows probe 必须复用生产 `runPrisma()`，不能另写包管理器启动逻辑。Linux 定向测试通过只能证明可移植路径和迁移断言；真实 Windows runner 的 probe 与后续测试通过才是 Windows 验证证据。`migrate diff --from-empty --to-schema` 不连接数据库，无需启动 PostgreSQL。

### Windows runnerIsolation fixture（已知限制）

`server/tests/testInfrastructure/runnerIsolation.test.js` 中「runner initializes separate SQLite databases…」在 Windows GitHub Actions 上可能因 30s fixture 超时失败。这是测试基础设施自测，不是生产 Prisma/迁移/打包路径。

规则：

- 不得删除该测试或放宽断言来“变绿”；
- 不得把它塞进桌面打包验收或 `Windows Publish Path Verify` 的阻塞清单；
- 保留在常规 server 测试 CI；打包路径只验证生产 probe、`postgresMigrateDeployPath`、必要 quality/布局与平台产物。
`Windows Publish Path Verify` 只覆盖生产 Prisma probe、`postgresMigrateDeployPath` 与 desktop build。可移植 `test:release-guards`（含 Mintlify 路径断言）由 Ubuntu `release-checks` 执行，避免把可移植测试的路径分隔符差异误判为 Windows 打包阻塞。

## Related Modules

- `.github/workflows/desktop-release.yml`
- `.github/workflows/desktop-beta-release.yml`
- `scripts/desktop-release/guard.cjs`
- `scripts/desktop-release/run.cjs`
- `scripts/desktop-release/verify-proof.cjs`
- `scripts/desktop-release/write-build-manifest.cjs`
- `scripts/desktop-release/publish-artifacts.cjs`
