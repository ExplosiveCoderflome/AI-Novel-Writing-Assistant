# Docs 管理约定

`docs/` 用来承接根目录之外的设计文档、阶段检查点、模块计划和历史归档，避免方案文档继续散落在仓库根目录。

## 根目录保留规则

根目录只保留下面几类文件：

- 项目入口与对外说明：`README.md`
- 路线图与执行主清单：`TASK.md`
- 协作与工程约束：`AGENTS.md`
- Monorepo 与工具链配置：`package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`.env.example`

其余设计稿、阶段总结、模块计划、历史规格，统一进入 `docs/` 对应子目录。

## 目录划分

### `docs/checkpoints`

用于记录阶段性检查点、架构迁移里程碑、进度审计和对照说明。

- [Chapter Editor V2 Progress](./checkpoints/chapter-editor-v2-progress.md)
- [Prompt Governance Audit 2026-05-08](./checkpoints/prompt-governance-audit-2026-05-08.md)
- [LLM Schema Refactor Checkpoint](./checkpoints/llm-schema-refactor-checkpoint.md)
- [Windows Desktop Installer Manual Checklist](./checkpoints/windows-desktop-installer-manual-checklist.md)

### `docs/plans`

用于放仍有执行价值的模块计划、工作拆解和产品推进方案。

- [Assistant UI Plan](./plans/assistant-ui-plan.md)
- [Chapter Editor V2 Plan](./plans/chapter-editor-v2-plan.md)
- [Character Resource Ledger Plan](./plans/character-resource-ledger-plan.md)
- [Prompt Workbench, Context and Step Runtime Plan](./plans/prompt-workbench-context-and-step-runtime-plan.md)
- [Auto Director Execution Plane Isolation Plan](./plans/auto-director-execution-plane-isolation-plan.md)
- [Director Mode Module and State Refactor Checklist](./plans/director-mode-module-state-refactor-checklist.md)

### `docs/design`

用于放系统设计、模块接口、产品机制和领域建模说明。

- [Style Engine v1](./design/style-engine-v1.md)
- [Style Engine Prompt Compiler v1](./design/style-engine-prompt-compiler-v1.md)
- [Style Engine Boundary and PRD v2](./design/style-engine-boundary-prd-v2.md)
- [World Management v2](./design/world-management-v2.md)
- [World Story Interface v1](./design/world-story-interface-v1.md)

### `docs/architecture`

承接横切架构说明与工程约定（不改变根目录对外入口）。

- [Backend testing](./architecture/testing.md)：后端 `node:test` 脚本的运行方式与目录约定。

### `docs/wiki`

用于沉淀长期项目知识，帮助未来开发者和 AI Agent 理解关键架构决策、工作流边界、运行协议、调试经验和产品设计依据。

Wiki 不替代计划、检查点或发布说明：

- `docs/wiki` 记录稳定规则和原因。
- `docs/plans` 记录仍有执行价值的方案和工作拆解。
- `docs/checkpoints` 记录阶段性状态、迁移里程碑和审计对照。
- `docs/design` 记录模块设计、领域建模和产品机制。
- `docs/releases` 记录用户可见变化。

- [Wiki Index](./wiki/README.md)
- [Wiki Entry Template](./wiki/entry-template.md)
- [Module Boundaries](./wiki/architecture/module-boundaries.md)
- [Auto Director Runtime](./wiki/workflows/auto-director-runtime.md)
- [Chapter Production Chain](./wiki/workflows/chapter-production-chain.md)
- [Prompt Registry and Structured Output](./wiki/prompts/prompt-registry-and-structured-output.md)

### `docs/releases`

用于放完整的用户可见版本更新说明与发布历史；根 `README.md` 只保留最新一次更新，本目录负责承接完整历史。

- [Release Notes](./releases/release-notes.md)

### `docs/public`

用于放面向用户和维护者的公开说明、安装文档、功能介绍和使用指南。

- [宫寒个人版说明](./public/gonghan-personal-edition.md)

### `docs/archive`

用于放历史初始化方案、已不再作为主执行依据但仍需要保留的资料。

- [Project Init Spec](./archive/project-init-spec.md)
- [Outdated Docs Index](./archive/outdated/README.md)

## 新文档命名规则

- 统一使用小写英文文件名，单词之间用 `-` 连接。
- 计划类文档优先放到 `docs/plans/`。
- 架构调整、进度校验、迁移检查点优先放到 `docs/checkpoints/`。
- 模块设计、数据模型、交互机制优先放到 `docs/design/`。
- 长期架构规则、工作流边界、调试经验和产品设计依据优先放到 `docs/wiki/`。
- 用户可见版本更新历史优先放到 `docs/releases/`。
- 已废弃、乱码、明显被当前发布事实取代但需要留档的方案放到 `docs/archive/outdated/`。

## 维护约束

- 新增文档时，先判断是否真的需要留在根目录；默认答案应当是“不需要”。
- 新增或修改核心工作流、Prompt、RAG、任务状态、自动导演、章节生产或重要调试结论时，先判断是否产生稳定 Wiki 价值。
- Wiki 页面应解释长期规则和原因，不写成文件修改列表、临时 TODO 或 release notes 复制品。
- 文档迁移后，如根 `README.md` 或其他入口文档里有引用，应同步更新路径。
- `TASK.md` 负责“当前主路线与优先级”，不替代设计文档；设计细节应沉到 `docs/`。
- 根 `README.md` 的更新说明只保留最新一次；完整历史统一维护在 `docs/releases/release-notes.md`。
