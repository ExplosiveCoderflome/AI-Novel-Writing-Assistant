# 桌面版本号与发布标识规则

## Background

桌面客户端有三处会暴露版本信息：界面顶部的当前版本、Electron 打包产物的应用版本、GitHub Release 的发布 tag。如果这些信息分别维护，用户截图、安装包文件名和自动更新判断会很容易出现不一致。

## Current Rule

- `desktop/package.json` 的 `version` 是桌面客户端唯一版本源。
- 前端网页开发态从 Vite 注入的 `VITE_APP_VERSION` 读取该版本，桌面运行态优先读取 Electron runtime 提供的 `appVersion`。
- 正式发布 tag 必须是 `vX.Y.Z`，并且 `X.Y.Z` 必须等于 `desktop/package.json` 的 `version`。
- 不在 UI、README 或发布脚本中硬编码另一个客户端版本号。
- GitHub 桌面发布 workflow 必须使用 Node 24 运行时和 Node 24 代际的官方 action，不再依赖 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` 去强制旧 Node 20 action。
- 桌面更新状态以 Electron runtime 投影为唯一事实来源；工作区顶部入口、更新弹窗、启动页和系统设置只负责以不同密度展示同一份状态，不各自推断更新结果。
- 工作区顶部版本号是日常更新入口。发现新版本、下载中或等待重启时，入口必须直接显示对应状态；系统设置保留完整详情，但不能作为唯一入口。
- 面向用户的更新状态、错误说明和操作按钮使用中文；底层错误详情写入桌面日志，不把英文异常原文直接暴露给用户。

## Release Steps

1. 发新版桌面包前，先运行 `pnpm release:desktop:bump X.Y.Z` 更新 `desktop/package.json`。
2. 更新用户可见 release notes 和 README 最新更新，说明该版本面向用户的变化。
3. 合入 `main` 后运行 `node scripts/trigger-desktop-release.cjs --dry-run`，确认工作区、分支和 tag 规则都通过。
4. 只使用与 `desktop/package.json` 对齐的 `vX.Y.Z` tag 触发正式 GitHub Release。

## 平台与原生运行时

Windows 保留 x64 NSIS 和便携包；Mac 通过 macos-latest 的独立 x64/arm64 任务产生未签名 DMG，运行时禁用自动更新并使用 icns 图标；Linux 通过 ubuntu-latest 产生 x64 AppImage 并使用 PNG 图标。Mac 用户通过下载新版安装包升级，不能依赖需要签名的自动更新链。

桌面构建显式固定 SQLite，避免开发者的 PostgreSQL 环境影响生成客户端。每个 afterPack 验证最终包中 better-sqlite3 的 PE/Mach-O/ELF 架构及 Prisma SQLite schema；原生模块由 electron-builder 针对当前 Electron 版本和目标架构重建，不能直接复用宿主 Node 的 SQLite 二进制。生成的 Prisma 客户端、WASM 运行时和迁移目录仍由原 staging 入口复制，不自行拼装另一份客户端。

包内验证与职责归属见 [打包模块边界](../../../desktop/scripts/packaging/README.md)。配置使用 [electron-builder 平台选项](https://www.electron.build/mac/)；可选二进制安装使用 [pnpm supportedArchitectures](https://pnpm.io/settings#supportedarchitectures)。

原生重编译的 buildPath 和 projectRootPath 必须同时指向 staging。electron-builder 默认会使用 workspaceRoot 扫描依赖，仅脱离 staging 硬链接仍可能改写源码 SQLite 的 ABI，表现为打包后 Node 测试报 Electron NODE_MODULE_VERSION。beforePack 通过既有 @electron/rebuild 限定范围，并以 npmRebuild=false 禁止默认重编译，保留正常依赖收集；本地验证须确认源码二进制散列保持不变且 Node 可加载。

## 工作区依赖与部署快照

桌面包通过 `pnpm deploy --prod` 使用注入的 `@ai-novel/server`，而源码运行使用 server importer。新增服务端生产依赖时，必须同步检查锁文件的 `server` importer 和 `snapshots` 中 `@ai-novel/server@file:server(...)` 的依赖集合；仅在 importer 和 packages 中出现新库，仍可能通过 frozen install，却在桌面部署时遗漏该库。

`stage-desktop.cjs` 在部署、Prisma 运行时整理后逐项解析服务端生产依赖，并要求解析结果位于部署目录内，防止借用源码工作区的依赖掩盖漏包。出现 Electron 的 `production dependency not found` 时，先核对注入快照，不应临时复制单个依赖或升级无关依赖。修复后使用新的临时部署目录验证闭包，再通过 GitHub 执行完整打包。

## Failure Modes

- 如果界面顶部显示版本和安装包文件名不一致，先检查打包所用 commit 的 `desktop/package.json`，不要在前端组件里补一个临时版本。
- 如果 GitHub Release tag 已存在，不能复用同一个版本重新上传；应继续 bump 到新的 `X.Y.Z`。
- 如果发版前只更新 release notes 但没有 bump 桌面版本，自动更新链路会把新包识别成旧版本，必须先修正版本源再发布。
- 如果 GitHub Actions 提示某个 action 仍在使用 Node 20，应优先升级该 action 的 major 版本，而不是重新加入强制运行时环境变量。

## Related Modules

- `client/vite.config.ts`：把桌面版本注入网页开发态和普通前端构建。
- `client/src/lib/constants.ts`：统一导出前端可用的 `APP_VERSION`。
- `client/src/components/layout/desktopUpdaterPresentation.ts`：统一更新状态、安装形态和通道的用户文案。
- `client/src/components/layout/DesktopUpdatePanel.tsx`：供顶部弹窗与系统设置复用的更新操作面板。
- `desktop/src/main.ts`：桌面运行态把 Electron `app.getVersion()` 注入 renderer。
- `desktop/src/runtime/updater.ts`：检查、下载和安装状态的事实来源。
- `scripts/bump-desktop-version.cjs` 与 `scripts/trigger-desktop-release.cjs`：版本推进与正式发布 tag 校验。
