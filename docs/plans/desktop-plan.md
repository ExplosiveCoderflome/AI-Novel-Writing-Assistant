# Desktop Plan

## 0. 当前进度同步（2026-04-17）

当前桌面化进度已从“纯方案设计”进入“开发态壳层跑通”，但还没有进入“可分发打包”。

已完成：

- `desktop/` 宿主骨架已经落地，当前包含 `desktop/src/main.ts`、`desktop/src/preload.ts`、`desktop/src/runtime/paths.ts`、`desktop/src/runtime/server.ts`。
- 前端运行时已经能区分 `web | desktop`，桌面模式下由宿主注入本地 API 基址，浏览器路径保持兼容。
- 服务端核心目录已开始按应用目录抽象，数据库、日志、生成图片等不再只依赖 repo 相对路径。
- `pnpm dev:desktop` 已可在开发环境中一键拉起 shared、server、client 与 Electron 宿主，并已确认桌面窗口可正常显示。
- 开发期原生模块缺失问题已完成第一轮收口：`better-sqlite3` 缺少绑定时会在开发准备阶段自动补齐，`electron` 已纳入允许执行构建脚本的依赖白名单。

当前仍未完成：

- 还没有正式的 Electron 打包器配置，因此当前仓库不能直接产出 Windows 安装包或绿色发布包。
- 打包态的前端静态资源组织、服务端入口、随包分发目录与失败诊断仍未收口。
- 首启向导、桌面端模型配置持久化、默认资源补齐 UI 仍未开始实现。

当前结论：

- `Phase 0: desktop-ready core` 已基本完成。
- `Phase 1: desktop shell dev` 已完成首轮开发态验收。
- `Phase 2: first package MVP` 尚未开始实施。

## 1. 目标与定位

这次桌面化不是重写产品，也不是把当前 Web 主体迁移成 Electron-only 应用。

目标只有一个：

- 为不会安装 Node、pnpm、Prisma、数据库和前后端环境的新手用户，新增一个“安装即可开书”的桌面分发入口。

桌面化后的产品形态保持为：

- 浏览器端仍然是主体，继续承担日常开发、验证、演示和未来在线化能力。
- `desktop/` 只是新增宿主层，负责打包、启动、默认配置、本地目录、安装与更新。
- `client / server / shared` 继续作为核心业务主体。

## 2. 成功标准

一期完成后，必须满足：

- 用户无需手动安装 Node、pnpm、Prisma。
- 用户安装后可直接启动桌面版。
- 用户首次打开后，可在 `3-5` 分钟内完成模型提供商选择、API Key 配置和基础模型选择。
- 用户无需手动复制 `.env`、执行 Prisma 命令或理解 workspace 启动顺序。
- 用户可直接跑通 `安装 -> 首启向导 -> 默认资源补齐 -> AI 自动导演开书`。
- 浏览器端和源码开发路径继续可用，桌面化不能反向破坏 Web 主体。

## 3. 架构边界

### 3.1 核心原则

- 桌面版优先采用 `Electron`。
- 桌面版通过新增 `desktop/` 包接入，不重写 `client / server / shared` 主结构。
- 业务层继续走现有 HTTP API，不把现有 REST 接口整体改成 Electron IPC。
- React 页面默认不直接依赖 `electron`、`ipcRenderer`、`window.require`。
- 桌面专属能力通过薄适配层暴露，Web 下保留空实现或兼容实现。

### 3.2 推荐目录

```text
client/
server/
shared/
desktop/
  src/
    main.ts
    preload.ts
    runtime/
      server.ts
      paths.ts
      config.ts
  scripts/
  build/
```

### 3.3 运行模式

浏览器模式：

- `client -> http api -> server`

桌面模式：

- `Electron -> 启动本地 server -> 加载前端 -> 前端继续通过 http api 调 server`

不建议一期把核心业务迁成：

- `React -> IPC -> Electron main -> 业务逻辑`

因为这会直接破坏 Web 与 desktop 共线。

## 4. 一期范围

一期只解决“安装即可开书”，不提前追求全量桌面特性。

### 4.1 必做

- 新增 `desktop/` 宿主工程。
- Electron 可自动启动本地 server。
- Electron 可加载前端构建产物或本地页面入口。
- 本地 SQLite、日志、生成图片、备份目录迁移到用户应用目录。
- 首启向导提供图形化模型配置。
- 默认补齐系统内置资源。
- 桌面版默认关闭 `RAG / Qdrant` 依赖链。
- 提供启动失败时的清晰错误提示。

### 4.2 明确不做

- 不为桌面版重写核心业务逻辑。
- 不把现有 API 改造成 Electron-only IPC。
- 不把 Qdrant、Embedding、知识库索引变成桌面版首发硬依赖。
- 不把桌面化理解成“打包当前开发脚本后继续要求用户自己配环境”。

## 5. 前置改造清单

桌面壳接入前，先做以下抽象，否则后续会持续返工。

### 5.1 运行时配置抽象

目标：

- 让 Web 与 desktop 都能用同一套前端业务代码，但从不同运行时来源拿配置。

实施项：

- 新增统一运行时标识：`web | desktop`。
- 抽象前端 API 基址来源，不再只依赖开发环境推断。
- 保持 Web 默认行为不变。
- desktop 运行时由宿主注入本地 API 地址。

重点文件：

- `client/src/lib/constants.ts`
- 前端 API 初始化入口
- `desktop/src/runtime/config.ts`

### 5.2 数据目录抽象

目标：

- 避免数据库、日志、图片、备份继续写入 repo 或工作目录。

实施项：

- 抽象统一应用目录：
  - `appData/data`
  - `appData/logs`
  - `appData/storage/generated-images`
  - `appData/backups`
- Web/源码模式保留现有相对路径开发体验。
- desktop 模式切换到用户应用目录。

重点文件：

- `server/src/db/prisma.ts`
- `server/src/services/image/imageAssetStorage.ts`
- `server/src/llm/sessionLogFile.ts`

### 5.3 Server 生命周期抽象

目标：

- 让 Electron 能稳定拉起、探活、停止本地 server。

实施项：

- 将 server 启动逻辑整理为可被桌面宿主调用的启动入口。
- 支持端口探测、健康检查、超时、失败回报。
- 避免只适配 `pnpm dev` 的开发脚本形态。

重点文件：

- `server/src/app.ts`
- `desktop/src/runtime/server.ts`

## 6. 分阶段实施清单

## Phase 0: desktop-ready core

目标：

- 不引入 Electron UI，先把核心运行时抽象做好。

交付：

- 统一运行时配置来源。
- 统一应用数据目录抽象。
- 数据库、日志、图片、备份路径可按运行时切换。
- Web 开发路径不回归。

验收：

- `pnpm typecheck` 通过。
- 浏览器端主流程不受影响。
- 本地桌面模拟运行时可以把数据写入目标用户目录。

当前状态：

- 已基本完成。
- 后续仅补打包态路径校验与更多目录覆盖，不再把本阶段当成主阻塞项。

## Phase 1: desktop shell dev

目标：

- 新增 `desktop/` 骨架并在开发环境跑通。

交付：

- Electron `main/preload` 框架。
- 本地 server 拉起逻辑。
- 桌面开发命令，例如 `pnpm dev:desktop`。
- Electron 中成功打开前端并调通本地 API。

验收：

- 启动一个命令即可同时拉起桌面壳、server、前端。
- Web 模式继续可独立启动。
- 浏览器端接口不需要为桌面版另开平行实现。

当前状态：

- 已完成首轮开发态验收。
- 当前已确认 `pnpm dev:desktop` 能跑通 shared、server、client、Electron 宿主，并已在本机成功显示桌面窗口。
- 本阶段剩余工作主要是围绕打包态启动差异做后续收口，不再是“能否启动桌面壳”的问题。

## Phase 2: first package MVP

目标：

- 交付第一个“普通用户可安装”的 Windows 包。

交付：

- Windows 安装包。
- 用户目录写入。
- 首启向导。
- 基础模型配置持久化。
- 默认资源补齐。
- 启动失败提示和诊断入口。

验收：

- 新机器上无需安装 Node 即可启动。
- 用户可完成首启并直接开第一本书。
- 默认关闭 RAG 时，主创作链能稳定跑通。

当前状态：

- 尚未开始。
- 当前缺少正式打包器配置、随包资源组织、打包态 server 入口和首启向导，因此还不具备“直接打包发布”的条件。

## Phase 3: hardening

目标：

- 从可安装升级到可维护、可发布。

交付：

- 自动更新。
- 崩溃恢复与日志收集。
- 备份与恢复入口。
- 数据目录查看与打开。
- 版本检查与升级提示。

验收：

- 常见启动失败、端口冲突、配置缺失都能给出明确修复指引。
- 用户可完成备份并看到备份文件位置。

## 7. 当前 backlog 拆分

### A. 宿主层

- 新建 `desktop/` 包与构建脚本。
- 设计 `main.ts / preload.ts / runtime/server.ts / runtime/paths.ts`。
- 统一窗口生命周期、单实例和退出逻辑。

### B. 配置与路径

- 抽象前端运行时配置注入。
- 抽象 server 数据目录解析。
- 抽象日志目录与图片目录。
- 预留备份目录和数据库副本能力。

### C. 首启体验

- 首启欢迎页。
- 模型提供商选择。
- API Key 输入和校验。
- 基础模型选择。
- 资源补齐进度与完成页。

### D. 发布与安装

- Windows 打包脚本。
- 安装器配置。
- 应用版本信息与图标资源。
- 发布产物校验。

### E. 风险控制

- 保证 Web 与 desktop 共线。
- 保证桌面版不引入 Electron 侵入式前端依赖。
- 保证 P0 主链开发不被桌面化重构打断。

## 8. 风险与约束

当前最主要风险不是“Electron 接不上”，而是“现有代码和运行时假设太偏源码开发环境”。

已知风险：

- 多个大文件已超过项目约定的理想体量，后续桌面化若直接叠加逻辑会继续放大维护成本。
- 数据库、日志、生成图片等路径目前仍带有开发期相对路径假设。
- 浏览器端继续作为主体，桌面化不能把前端逻辑绑死到宿主 API。
- 桌面化不应挤占当前 `P0` 主链稳定性验收节奏。

对应策略：

- 先做运行时和路径抽象，再加桌面壳。
- 宿主只做宿主职责，不承载核心业务。
- 将桌面化放在 `P2-A`，按独立分支推进，不打断主链验证。

## 9. 质量门槛

每个阶段结束前至少检查：

- `pnpm typecheck`
- Web 主体主流程回归
- 桌面模式启动回归
- 数据目录是否正确落到用户目录
- 首启向导是否能在最少步骤内进入开书

## 10. 里程碑定义

### M1: desktop-ready core

- 路径抽象完成。
- 运行时配置抽象完成。
- Web 不回归。

### M2: desktop dev shell

- `desktop/` 可本地开发启动。
- 前端与本地 server 在 Electron 中跑通。

### M3: first installable build

- Windows 安装包可安装、可启动、可开书。

### M4: hardening

- 具备更新、备份、恢复、诊断能力。

## 本次产出

- 明确了“浏览器主体 + desktop 宿主层”的桌面化边界。
- 把桌面化拆成前置抽象、开发壳、首个安装包、稳定化四个阶段。
- 补齐了当前 backlog、里程碑、验收标准和风险控制点。
- 明确一期只解决“安装即可开书”，不提前把 RAG 和复杂部署抬成首发阻塞项。
