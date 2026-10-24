# 桌面端 macOS 打包边界

## 背景

桌面端最初的打包链路只面向 Windows（NSIS 安装包 + portable 包），因此 macOS 用户只能通过源码方式运行：

- 需要自行安装 Node、pnpm、Prisma 与本地数据库环境。
- 每次都要在终端执行 `pnpm dev` 或 `pnpm dev:desktop` 才能打开工作区。

这条路径对不懂工程环境的写作用户门槛过高，也让 macOS 长期缺少“安装即开书”的入口。为了让 macOS 用户与 Windows 用户获得同一条安装体验，桌面宿主需要在同一个 `desktop/` 壳层上补齐 macOS 打包能力，而不是另建一套应用。

## 决策

- macOS 打包复用现有 Electron 宿主（`desktop/`）与统一打包入口 `desktop/scripts/run-electron-builder.cjs`，不新建第二套桌面工程。
- 平台差异只落在“产物形态、签名材料、图标格式”三处，业务代码与运行时目录约定保持一致。
- 公共运行时配置继续共享：`extraResources`、`asar`、`asarUnpack`、原生模块重建、Prisma 运行时注入、renderer 资源布局对两个平台相同。
- 签名材料按平台隔离：Windows 使用 `WIN_CSC_LINK` / `CSC_LINK`，macOS 使用 `MAC_CSC_LINK` / `MAC_CSC_KEY_PASSWORD`，脚本只把当前平台对应的凭据映射到 electron-builder 的通用 `CSC_*` 变量。
- 未配置签名材料时，macOS 构建走 electron-builder 的 ad-hoc 签名回退。Apple Silicon 要求可执行文件至少具备 ad-hoc 签名，否则应用无法启动，因此该回退是本地打包的必要条件，而不是可选项。
- 应用内自动更新在 macOS 上默认关闭，需要显式设置 `AI_NOVEL_DESKTOP_MAC_UPDATER=true` 才启用。
- macOS 产物由 GitHub Actions 的 `macos-latest` job 自动构建并上传到与 Windows 相同的 Release，用户不需要在本地打包；本地打包保留为验证与自用手段。
- 发布流程的平台差异只体现在 job 与 runner 上，tag、版本校验、产物上传目标保持一致，避免两个平台出现两套发布规则。

## 当前规则

- macOS 目标为 `dmg`（安装镜像，内含 `/Applications` 链接）与 `zip`（自动更新所需的压缩包），默认架构 `arm64`，可用 `AI_NOVEL_MAC_ARCHS` 覆盖。
- 产物命名固定为 `${productName}-${version}-mac-${arch}.${ext}`，与 Windows 产物命名规则并列，不互相覆盖。
- macOS 图标来源为 `desktop/builder/app-icon.icns`，由 `desktop/scripts/generate-desktop-icons.py` 与 PNG/ICO 一并生成；`resolveDesktopWindowIcon()` 按平台选择 `.icns` 或 `.ico`。
- 正式（非 beta）macOS 发布必须同时具备签名与公证材料，否则打包脚本直接报错退出；只有显式设置 `AI_NOVEL_ALLOW_UNSIGNED_MAC_RELEASE=true` 才允许未签名发布。
- beta 通道允许未签名构建，用于本地与内测验证。
- 打包后必须通过两层验证：`verify:desktop-package:mac` 检查包体结构（bundle 标识、bundle 图标、app.asar 内容、SQLite 迁移、Prisma 运行时、原生模块解包），`verify:desktop:mac-app` 真实启动应用并确认本地服务健康检查与数据库创建成功。
- 打包脚本、校验脚本与用户可见说明必须保持平台中立表述，不在 macOS 路径里复用 Windows 专用变量名（例如 `win-unpacked`、`PORTABLE_EXECUTABLE_DIR`）。
- 发布流程的 macOS job 必须 `needs` 对应 Windows job：Windows job 负责创建 Release，macOS job 只向已存在的 Release 追加 dmg/zip 与 `latest-mac.yml`，避免两个 job 并发创建同一个 Release。
- 发布 tag 与 `desktop/package.json` 版本必须一致，由 `scripts/check-desktop-release-tag.cjs` 在发布流程第一个 job 校验；不匹配时整个发布中止。
- 公开分发需要 Apple 证书；仓库通过 `MAC_CSC_LINK` / `MAC_CSC_KEY_PASSWORD` / `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` secrets 接入。缺少证书时 `AI_NOVEL_ALLOW_UNSIGNED_MAC_RELEASE` 默认 `true`，由仓库变量覆盖，构建出的未签名包需要用户手动放行。

## 示例

推荐做法：

```bash
# 本地验证与自用打包
pnpm stage:desktop
pnpm dist:desktop:mac          # 产出 dmg + zip（arm64）
pnpm verify:desktop-package:mac:reuse-stage
pnpm verify:desktop:mac-app

# 发布前自查 tag 与版本是否一致
pnpm check:desktop-release-tag --tag v0.5.20
```

发布流程（用户拿到安装包的正常路径）：

1. `pnpm release:desktop:bump X.Y.Z` 更新版本并合入 `main`。
2. 推送与版本一致的 `vX.Y.Z` tag。
3. `Desktop Release` 流程依次执行：版本校验 → Windows 构建并创建 Release → macOS 构建并向同一 Release 追加 dmg/zip。
4. 用户在 Releases 页面按平台下载，不需要本地打包。

不推荐或禁止的做法：

- 在 macOS 打包时复用 `WIN_CSC_LINK`，或把 Windows 证书映射到 macOS 签名步骤。
- 为了让未签名 macOS 包“看起来能发布”，把正式发布的签名与公证校验整体删除。
- 在 `desktop/src/` 业务代码里按平台分支处理产品逻辑；平台差异只允许出现在路径、图标、签名与产物配置层。
- 用临时脚本直接调用 `electron-builder` 绕过 `run-electron-builder.cjs`，这会跳过 pnpm 依赖树 patch 与平台环境归一化。
- 让 macOS job 与 Windows job 并发创建同一个 Release；macOS job 必须排在 Windows job 之后。
- 在 CI 里把 `verify:desktop:mac-app` 当作阻塞步骤。GitHub 的 macOS runner 没有真实用户会话，GUI 启动冒烟会偶发失败，因此该步骤显式 `continue-on-error`，由 `verify:desktop-package:mac` 承担阻塞校验。

## 失败模式

- 应用双击后无窗口、无日志、进程瞬间退出：优先检查是否被 `ELECTRON_RUN_AS_NODE=1` 之类的环境变量以 Node 模式启动，而不是判定打包损坏。
- Apple Silicon 上应用被系统直接终止：检查签名形态，未签名或签名失效的二进制在 arm64 上无法启动；本地构建应确认存在 ad-hoc 签名。
- `app.asar` 校验报缺少服务端入口：确认校验脚本按平台归一化了 asar 路径分隔符（Windows 为反斜杠，macOS 为斜杠）。
- DMG 构建失败但 `.app` 已生成：多为 dmg-builder 工具下载超时，重跑打包即可，`.app` 与 `zip` 产物不受影响。
- 应用能启动但模型配置为空：属于首启配置问题，检查用户数据目录与设置页，不要通过重新打包规避。
- 发布流程在第一个 job 就失败并提示 tag 与版本不一致：先执行 `pnpm release:desktop:bump` 对齐 `desktop/package.json`，再重新打 tag；不要绕过校验直接上传。
- macOS 产物缺失但 Windows 产物正常：检查 macOS job 是否被签名门禁拦截；仓库变量 `AI_NOVEL_ALLOW_UNSIGNED_MAC_RELEASE` 为 `true` 时允许未签名构建。

## 相关模块

- `desktop/electron-builder.config.cjs`：跨平台打包配置、图标、签名与公证门禁。
- `desktop/scripts/run-electron-builder.cjs`：平台识别、凭据归一化、electron-builder 调用入口。
- `desktop/scripts/publish-desktop-target.cjs`：发布参数解析（`--platform win|mac`）与 electron-builder 发布调用。
- `desktop/scripts/publish-desktop-release.cjs` / `publish-desktop-beta.cjs`：正式与 beta 通道的发布入口。
- `desktop/scripts/stage-desktop.cjs`：与平台无关的应用暂存、Prisma 运行时注入与原生包解耦。
- `desktop/scripts/verify-desktop-package.cjs`：包体结构校验（Windows 与 macOS 分支）。
- `desktop/scripts/verify-desktop-mac-app.cjs`：macOS 打包产物真实启动冒烟校验。
- `scripts/check-desktop-release-tag.cjs`：发布 tag 与 `desktop/package.json` 版本一致性校验。
- `.github/workflows/desktop-release.yml` / `desktop-beta-release.yml`：版本校验、Windows 与 macOS 构建发布 job。
- `desktop/src/runtime/paths.ts`：应用数据目录、图标与打包资源的平台解析。
- `desktop/src/runtime/updater.ts`：按平台决定应用内更新是否可用。

## 来源文档

- 桌面化早期计划（已归档）：`../archive/outdated/desktop-plan-2026-04-17.md`
- 桌面版本号与发布标识规则：`./desktop-release-versioning.md`
- 安装与准备：`../public/installation.md`
