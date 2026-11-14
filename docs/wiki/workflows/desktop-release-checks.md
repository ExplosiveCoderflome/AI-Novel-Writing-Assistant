# 桌面发布检查证明边界

## Background

桌面发布包含可移植检查和平台专属检查。可移植检查在不同发布 runner 上重复执行会增加等待时间，但平台 runner 仍必须验证本机构建、原生 ABI、迁移兼容性、签名和产物布局。

## Decision

工作流先由 `release-checks` Ubuntu job 在 `pg-live-gate` 成功后执行一次可移植清单，并上传当前 workflow run/attempt 的 JSON artifact。artifact 是跨 job 复用的唯一检查证明；工作区中的 `.tmp/desktop-release/<SHA>.json` 只服务本地检查复用，不能作为 CI 信任根。

## Current Rule

检查证明必须同时匹配：

- checkout 的 `HEAD`；
- `GITHUB_RUN_ID` 与 `GITHUB_RUN_ATTEMPT`；
- `desktop/package.json` 的稳定版本；
- 固定的五项可移植检查清单；
- `status=passed`。

每个发布 job 都从当前 run 下载 artifact，并在自己的 runner 上重新验证 PG live proof。Windows 仍保留数据库迁移、server quality、打包布局和签名/发布前检查；macOS/Linux 仍保留本平台打包契约与原生构建检查。手动 `verify-only` 不上传检查证明，也继续执行完整本地验证。

## Failure Modes

缺少 artifact、来自旧 run 或错 attempt、HEAD/版本不一致、清单缺项、状态不是 `passed`，都必须 fail-closed。PG proof 缺失或不匹配时同样禁止发布。

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
