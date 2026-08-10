# 桌面版本号与发布标识规则

## Background

桌面客户端有三处会暴露版本信息：界面顶部的当前版本、Electron 打包产物的应用版本、GitHub Release 的发布 tag。如果这些信息分别维护，用户截图、安装包文件名和自动更新判断会很容易出现不一致。

## Current Rule

- `desktop/package.json` 的 `version` 是桌面客户端唯一版本源。
- 前端网页开发态从 Vite 注入的 `VITE_APP_VERSION` 读取该版本，桌面运行态优先读取 Electron runtime 提供的 `appVersion`。
- Stable 版本只允许 `X.Y.Z`，tag 必须是 `vX.Y.Z`，且 tag commit 必须属于 `main` 历史。
- Beta 版本只允许 `X.Y.Z-beta.N`，tag 必须是 `vX.Y.Z-beta.N`，且 tag commit 必须属于 `beta` 历史；不接受其他 prerelease 标签。
- 不在 UI、README 或发布脚本中硬编码另一个客户端版本号。
- GitHub 桌面发布 workflow 必须使用 Node 24 运行时和 Node 24 代际的官方 action，不再依赖 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` 去强制旧 Node 20 action。
- 桌面更新状态以 Electron runtime 投影为唯一事实来源；工作区顶部入口、更新弹窗、启动页和系统设置只负责以不同密度展示同一份状态，不各自推断更新结果。
- 工作区顶部版本号是日常更新入口。发现新版本、下载中或等待重启时，入口必须直接显示对应状态；系统设置保留完整详情，但不能作为唯一入口。
- 面向用户的更新状态、错误说明和操作按钮使用中文；底层错误详情写入桌面日志，不把英文异常原文直接暴露给用户。

## Release And Update Contract

- `verify` 只用于 CI 和本地验证，不对应 tag 或 GitHub Release，更新通道固定为 `disabled`。
- `X.Y.Z-beta.N` 对应 GitHub prerelease、`beta` 更新通道及 `beta.yml`；签名 Mac 额外生成 `beta-mac.yml`。
- `X.Y.Z` 对应正式 GitHub Release、`latest` 更新通道及 `latest.yml`；签名 Mac 额外生成 `latest-mac.yml`。
- 公开发布仓库必须解析为 `yangtzehina/AI-Novel-Writing-Assistant`。解析优先级为显式完整 owner/repo、`GITHUB_REPOSITORY`、仓库 metadata；发布路径不允许静默回退到上游仓库。
- 打包 metadata 必须显式写入 `releaseMode`、`updateChannel`、`updatesEnabled` 和 `signingStatus`。运行时只从这份 metadata 初始化 updater，不再默认猜测 Beta。
- Windows 证书必须成对提供；完全缺失时允许输出带 `-unsigned` 标识的公开包，并保留 Windows 更新 feed。只提供一半证书配置时立即失败。
- macOS Developer ID 和公证凭据必须完整提供；完整时签名、公证并保留 DMG + ZIP 更新目标。完全缺失时允许输出带 `-unsigned` 标识的 DMG/ZIP，但不打入 `app-update.yml`、不生成 Mac feed，运行时显示自动更新不可用。部分或歧义配置立即失败。
- Electron builder job 永远使用 `--publish never`。GitHub Release 资产只能由独立、单一 publisher job 上传和公开。

## Release Steps

1. 发新版桌面包前，运行 `pnpm release:desktop:bump X.Y.Z` 或 `pnpm release:desktop:bump X.Y.Z-beta.N` 更新 `desktop/package.json`。
2. 更新用户可见 release notes 和 README 最新更新，说明该版本面向用户的变化。
3. Beta 合入 `beta`、Stable 合入 `main` 后运行 `node scripts/trigger-desktop-release.cjs --dry-run`，确认工作区、分支归属和精确 tag 规则都通过。
4. 只使用与 `desktop/package.json` 完全对齐的 `vX.Y.Z-beta.N` 或 `vX.Y.Z` tag 触发 GitHub Release；Beta 必须标记 prerelease，Stable 才能标记 latest。

## GitHub Actions Pipeline

### Desktop CI

- `.github/workflows/desktop-ci.yml` 响应指向 `beta` 或 `main` 的 PR、这两个分支的相关路径 push，以及手动验证。它只有 `contents: read`，不接收发布 token、Windows 证书或 Apple 凭据，也不会创建或修改 GitHub Release。
- Ubuntu quality job 使用冻结依赖运行桌面打包合同测试和 workspace typecheck。原生矩阵固定为 `windows-2025/x64` 与 `macos-15/arm64`，每个平台只构建自己的原生模块和安装包。
- PR 只生成 unpacked 应用并运行真实 packaged Electron smoke；`beta`/`main` push 与手动验证生成完整安装包。完整包只作为保留 7 天的 Actions artifact，不是公开下载。
- Windows runner 把 pnpm virtual store 放在 runner 临时短路径，并继续执行 NSIS 安装、启动、卸载、数据保留和重装验证。Mac runner 验证 DMG 校验和、ZIP 完整性及 `.app/Contents/Resources/app.asar` 布局。

### Desktop Release

- `.github/workflows/desktop-release.yml` 只有精确 `v*` tag push 能进入发布 jobs；手动 dispatch 只运行分支和版本 dry-run。validate job 必须先验证版本/tag、canonical fork、Beta/Stable 分支归属，以及同 tag Release 是否不存在或仅有唯一 draft。
- Windows 与 Mac build job 在各自原生 runner 上重新冻结安装、stage、package、静态验证和 packaged smoke。两者都只有 `contents: read`，始终使用 `--publish never`；Windows 与 Mac 签名 secret 分别绑定到独立 GitHub Environment。
- Windows 签名 secret 为完整的 `WINDOWS_CSC_LINK` + `WINDOWS_CSC_KEY_PASSWORD` 对。Mac 签名发布要求完整的 `MAC_CSC_LINK` + `MAC_CSC_KEY_PASSWORD`，以及 `APPLE_API_KEY_P8_BASE64` + `APPLE_API_KEY_ID` + `APPLE_API_ISSUER` 公证凭据；全部缺失允许无签名发布，部分缺失立即失败。
- 两个 build job 只把顶层安装包、blockmap 和已知 updater feed 复制到干净资产目录。验证器必须看到错误 channel feed 或无签名 Mac 意外生成的 feed，不能通过筛选文件把配置回归隐藏掉。
- 只有最后的 publisher job 拥有 `contents: write`。它重新验证两个平台 artifact，拒绝重复文件名，生成 `SHA256SUMS.txt`，创建或复用同 tag draft，上传后逐个下载远端资产并复验大小、SHA-256、SHA-512、URL、owner、channel 与更新 metadata，全部一致后才公开。
- 重跑只允许替换同 tag 的唯一 draft；已经公开的同 tag Release 永不覆盖。Beta 发布为 prerelease，Stable 发布后还必须回读并确认成为仓库 latest Release。

当前正式矩阵只支持 Windows x64 与 macOS arm64。macOS x64、Universal 和 Linux 需要在原生依赖、包体和验证成本单独评估后，以后续阶段增加，不能通过跨平台复用 staging 临时冒充支持。

## Desktop Staging Invariants

- Windows x64 与 macOS arm64 必须分别在目标系统和目标架构上生成 staging，不能跨平台复用包含原生模块的目录。
- staging 使用项目声明的 `pnpm@10.6.0` 和 hoisted 生产依赖布局。`desktop/build/app` 必须自包含，任何依赖符号链接的真实路径都不能逃出该目录。
- Prisma 生成客户端通过 Node 包解析定位，并复制到 staging 内稳定的 hoisted 位置；打包脚本不能依赖扫描 staged `.pnpm` 目录。
- 每次 staging 都生成 `desktop/build/stage-manifest.json`，记录平台、架构、发布模式、应用和 Electron 版本、原生依赖版本、lockfile hash 与更新配置。复用 staging 时必须逐字段完全匹配。
- 打包包装器只接受显式平台、架构、模式和 target，并始终向 electron-builder 传递 `--publish never`。GitHub Release 发布不属于 builder job 的职责。
- 禁止在打包期间修改 `app-builder-lib` 或复制、覆盖其 NSIS 模板。打包前后必须比较关键 builder 文件 hash；Windows 路径过长时应缩短 checkout 或 virtual store 路径并明确失败。

## Failure Modes

- 如果界面顶部显示版本和安装包文件名不一致，先检查打包所用 commit 的 `desktop/package.json`，不要在前端组件里补一个临时版本。
- 如果 GitHub Release 已公开，不能复用同一个 tag 覆盖资产；应继续 bump 到新的 Stable 或 Beta 版本。未公开 draft 只能由同一次发布重跑复用。
- 如果发版前只更新 release notes 但没有 bump 桌面版本，自动更新链路会把新包识别成旧版本，必须先修正版本源再发布。
- 如果无签名 macOS 包出现 `app-update.yml`、`beta-mac.yml` 或 `latest-mac.yml`，说明签名合同被绕过，必须阻断发布。
- 如果 GitHub Actions 提示某个 action 仍在使用 Node 20，应优先升级该 action 的 major 版本，而不是重新加入强制运行时环境变量。
- 如果 build job 的 release asset 校验扫描到了 `win-unpacked` 或 `.app` 内部文件，说明没有先收集顶层发布资产；应修复 clean asset 目录，不能放宽重复文件或未知安装包检查。

## Related Modules

- `client/vite.config.ts`：把桌面版本注入网页开发态和普通前端构建。
- `client/src/lib/constants.ts`：统一导出前端可用的 `APP_VERSION`。
- `client/src/components/layout/desktopUpdaterPresentation.ts`：统一更新状态、安装形态和通道的用户文案。
- `client/src/components/layout/DesktopUpdatePanel.tsx`：供顶部弹窗与系统设置复用的更新操作面板。
- `desktop/src/main.ts`：桌面运行态把 Electron `app.getVersion()` 注入 renderer。
- `desktop/src/runtime/updater.ts`：检查、下载和安装状态的事实来源。
- `.github/workflows/desktop-ci.yml`：无发布权限的跨平台验证矩阵。
- `.github/workflows/desktop-release.yml`：tag 驱动、原生构建、单 publisher 的公开发布流程。
- `desktop/scripts/validate-release-assets.cjs`：公开资产、签名状态、更新 metadata 与哈希合同验证。
- `scripts/bump-desktop-version.cjs` 与 `scripts/trigger-desktop-release.cjs`：版本推进与正式发布 tag 校验。
