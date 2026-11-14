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

## Related Modules

- `.github/workflows/desktop-release.yml`
- `.github/workflows/desktop-beta-release.yml`
- `scripts/desktop-release/guard.cjs`
- `scripts/desktop-release/run.cjs`
- `scripts/desktop-release/verify-proof.cjs`
