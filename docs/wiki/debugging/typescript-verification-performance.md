# TypeScript 验证链与增量缓存

## Background

仓库的根目录验证覆盖 `shared`、`server`、`client` 和 `desktop`。其中 client 的类型图最大，冷启动时需要分析两千多个文件和大量第三方声明。server 的类型依赖 Prisma 生成客户端以及 shared 的构建产物。

## Decision

根目录 `typecheck` 采用两阶段执行。第一阶段构建 shared 并生成 Prisma Client。第二阶段使用 tsrs 检查 shared、server、client 和 desktop，默认验证优先使用速度更快的编译器实现。

`typecheck:tsc` 保留 `typescript@7.1.0-beta` 编译器作为兼容性校验入口，用于确认 tsrs 与 TypeScript 7 beta 在仓库类型图上的结果一致。

各包开启 TypeScript 增量缓存。缓存文件放在被 Git 忽略的 `tsbuildinfo` 路径中，连续验证可以复用程序、绑定和类型检查结果。

根目录和 workspace 包统一锁定 `typescript@7.1.0-beta`。依赖树中仍可能保留某些第三方包的 TypeScript 5.9 peer 解析记录，但包级 `tsc` 入口统一使用 7.1 beta。

TypeScript 7 beta 的包入口不再提供部分旧版 JavaScript 编译器 API。测试夹具和代码策略扫描仍需要这些 API 时，通过根目录的 `typescript-legacy@npm:typescript@5.9.3` 兼容别名加载旧实现。产品源码和默认类型验证不回退到旧编译器。

依赖升级优先保持现有 major 边界，并在 peer 冲突或类型合同变化出现时回退单个高风险包。Prisma、React Query 和 sharp 曾分别触发类型兼容问题，因此当前版本以通过类型检查和回归测试的组合为准。Vite 8、Tailwind 4、Electron 45、Prisma 8 RC、Plate 53 和 better-sqlite3 13 等跨 major 升级另行评估。

开发机、CI 和容器统一使用 Node 24 LTS。Electron 自带的 Node ABI 与宿主 Node 独立，桌面打包仍需按目标 Electron 版本重建 better-sqlite3 等原生模块。

## Current Rule

- `pnpm typecheck` 是跨包验证的权威入口，使用 tsrs 检查 shared、server、client 和 desktop。
- `pnpm typecheck:tsc` 是兼容性校验入口，使用 `typescript@7.1.0-beta` 并行检查 shared、server、client 和 desktop。
- server 的独立 `typecheck` 保留 Prisma 生成步骤，保证单包检查使用当前 schema。
- 根目录验证不能直接并行各包的 `typecheck` 脚本。server 脚本会生成 Prisma Client，生成过程必须先完成，再让其他包读取生成类型。
- 只运行 server 或 client 的 `tsc` 可能读取过期的 shared 声明。跨包修改后先从根目录运行完整验证。
- 删除 `tsbuildinfo` 后的首次验证属于冷启动，耗时上升是预期行为。

## Failure Modes

- 并行执行包含 Prisma 生成的 server 脚本时，其他进程可能在生成客户端写入期间读取类型文件，表现为模型字段暂时不存在。
- shared 源码更新后直接检查 server，可能继续使用旧的 `shared/dist` 声明，出现与源文件不一致的类型错误。
- 仅看增量检查结果无法替代冷启动检查。涉及 TypeScript、Prisma schema、workspace 依赖或生成声明的变更，应通过根目录入口复核。

## tsrs 实验脚本

`pnpm benchmark:tsrs` 对 shared、server、client 依次运行 `typescript@7.1.0-beta` 和 tsrs，记录退出状态、诊断摘要、耗时和 Windows 工作集峰值，并把完整结果保存到 `.tmp/tsrs-benchmark/`。脚本默认先构建 shared 并生成 Prisma Client。基准中的 tsc 使用 `--incremental false`，用于比较冷启动编译成本。tsc 和 tsrs 共用临时的无输出兼容配置，避免 TypeScript 7 已删除的旧 Node resolver 与 `baseUrl` 影响对比。

脚本根据原始 tsconfig 生成 tsc 和 tsrs 共用的临时兼容配置。兼容配置移除 TypeScript 7 已删除的 `baseUrl` 和旧版 Node resolver，并把 workspace 路径改成绝对路径。

常用参数包括 `--skip-prepare`、`--no-fast` 和 `--only client,server`。`pnpm typecheck` 调用脚本的 `--check` 模式，只运行 tsrs 并把失败状态返回给验证入口。实验脚本仍可用来同时比较 tsc 与 tsrs 的耗时和内存。

## Related Modules

- `package.json` 根目录 `typecheck` 脚本
- `shared/tsconfig.json`
- `server/tsconfig.json`
- `client/tsconfig.json`
- `desktop/tsconfig.json`
