# 桌面打包边界

`build-desktop.cjs` 为全部构建步骤固定 SQLite 配置，只生成客户端和编译代码，不执行迁移。不要根据开发者的 PostgreSQL 环境生成桌面 Prisma client。`stage-desktop.cjs` 继续拥有依赖部署、Prisma 生成目录内嵌和原生包物理副本，避免 Electron 重编译修改源码工作区的硬链接。

electron-builder 为每个目标架构重编译 better-sqlite3，所有 `.node` 文件保持 asarUnpack。Prisma 7 使用生成客户端及 SQLite adapter；运行时的本地 SQLite 能力来自 better-sqlite3。`verify-native-runtime.cjs` 在每个 afterPack 检查 PE/Mach-O/ELF 的目标架构、内嵌 Prisma client 和 SQLite schema，架构错误或漏包必须阻止生成可发布产物。

`rebuild-native.cjs` 在 beforePack 通过既有 @electron/rebuild 将 buildPath 与 projectRootPath 都固定到 staging；npmRebuild=false 禁止默认重编译。仅设置 appDir 仍会让默认重编译扫描 workspaceRoot，把源码 Node 使用的 SQLite 替换为 Electron ABI。不能以 beforeBuild 返回 false 来替代，这会让 builder 将依赖视为外部管理并跳过依赖收集。验证打包时须比较源码原生二进制散列并确认 Node 仍可加载 SQLite；staging 的物理副本和受限重编译缺一不可。

Mac 以独立 x64/arm64 job 构建 DMG，不合并成 universal 包；暂不签名、不公证、关闭客户端自动更新。Linux 以 x64 构建 AppImage。pnpm 同时安装当前 OS 的 x64/arm64 可选依赖，让 sharp 等按运行架构选择本地二进制。Windows 保留 NSIS/portable、签名规则和 NSIS 模板补丁；跨平台构建不使用 NSIS 模板。

增加平台时同时更新 builder 目标、窗口图标、workflow 和原生架构验证。Windows 本机目录打包不能替代 Mac/Linux runner 的实际构建与启动验收。
