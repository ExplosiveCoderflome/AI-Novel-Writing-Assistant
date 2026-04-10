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
- [LLM Schema Refactor Checkpoint](./checkpoints/llm-schema-refactor-checkpoint.md)
- [Progress Audit](./checkpoints/progress-audit.md)

### `docs/plans`

用于放仍有执行价值的模块计划、工作拆解和产品推进方案。

- [Assistant UI Plan](./plans/assistant-ui-plan.md)
- [Knowledge Module Plan](./plans/knowledge-module-plan.md)
- [Chapter Editor V2 Plan](./plans/chapter-editor-v2-plan.md)

### `docs/design`

用于放系统设计、模块接口、产品机制和领域建模说明。

- [Style Engine v1](./design/style-engine-v1.md)
- [Style Engine Prompt Compiler v1](./design/style-engine-prompt-compiler-v1.md)
- [World Management v2](./design/world-management-v2.md)
- [World Story Interface v1](./design/world-story-interface-v1.md)

### `docs/releases`

用于放完整的用户可见版本更新说明与发布历史；根 `README.md` 只保留最新一次更新，本目录负责承接完整历史。

- [Release Notes](./releases/release-notes.md)

### `docs/archive`

用于放历史初始化方案、已不再作为主执行依据但仍需要保留的资料。

- [Project Init Spec](./archive/project-init-spec.md)

## 新文档命名规则

- 统一使用小写英文文件名，单词之间用 `-` 连接。
- 计划类文档优先放到 `docs/plans/`。
- 架构调整、进度校验、迁移检查点优先放到 `docs/checkpoints/`。
- 模块设计、数据模型、交互机制优先放到 `docs/design/`。
- 用户可见版本更新历史优先放到 `docs/releases/`。
- 已废弃但需要留档的方案放到 `docs/archive/`。

## 维护约束

- 新增文档时，先判断是否真的需要留在根目录；默认答案应当是“不需要”。
- 文档迁移后，如根 `README.md` 或其他入口文档里有引用，应同步更新路径。
- `TASK.md` 负责“当前主路线与优先级”，不替代设计文档；设计细节应沉到 `docs/`。
- 根 `README.md` 的更新说明只保留最新一次；完整历史统一维护在 `docs/releases/release-notes.md`。
