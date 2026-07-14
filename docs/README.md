# Docs 管理约定

`docs/` 用来承接根目录之外的设计文档、阶段检查点、模块计划、用户文档和历史归档，避免方案文档继续散落在仓库根目录。

## 根目录保留规则

根目录只保留下面几类文件：

- 项目入口与对外说明：`README.md`
- 路线图与执行主清单：`TASK.md`
- 协作与工程约束：`AGENTS.md`
- Monorepo 与工具链配置：`package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`.env.example`

其余设计稿、阶段总结、模块计划、历史规格，统一进入 `docs/` 对应子目录。

## 根目录直属文件与索引

- [README.md](./README.md)：文档管理约定与目录导航（本文件）。
- [codegraph_index.md](./codegraph_index.md)：由 CodeGraph 自动生成的项目逻辑索引，描述代码库的目录结构、核心类与 API 路由等。
- [harnessx_lite_blueprint.md](./harnessx_lite_blueprint.md)：HarnessX-Lite (基于 MacBook 优化的轻量化植入设计) 核心架构蓝图。
- [harnessx_lite_architecture.png](./harnessx_lite_architecture.png)：HarnessX-Lite 架构图。

## 目录划分

### `docs/checkpoints`

用于记录阶段性检查点、架构迁移里程碑、进度审计和对照说明。

- [Chapter Editor V2 Progress](./checkpoints/chapter-editor-v2-progress.md)
- [Prompt Governance Audit 2026-05-08](./checkpoints/prompt-governance-audit-2026-05-08.md)
- [LLM Schema Refactor Checkpoint](./checkpoints/llm-schema-refactor-checkpoint.md)
- [Windows Desktop Installer Manual Checklist](./checkpoints/windows-desktop-installer-manual-checklist.md)

### `docs/plans`

用于放仍有执行价值的模块计划、工作拆解和产品推进方案。

- [AI Comic Adaptation Plan](./plans/ai-comic-adaptation-plan.md)：AI 漫画改编技术方案与工作流计划。
- [AI Comic Product Design](./plans/ai-comic-product-design.md)：AI 漫画产品设计说明。
- [Assistant UI Plan](./plans/assistant-ui-plan.md)：助手 UI 界面重构与设计计划。
- [Auto Director Creation Redesign Plan](./plans/auto-director-creation-redesign-plan.md)：智能导演创作流重新设计方案。
- [Auto Director Execution Plane Isolation Plan](./plans/auto-director-execution-plane-isolation-plan.md)：自动导演执行平面隔离方案。
- [Book Analysis Expansion Plan](./plans/book-analysis-expansion-plan.md)：拆书分析功能扩展计划。
- [Chapter Aftermath Consolidation Followup Plan](./plans/chapter-aftermath-consolidation-followup-plan.md)：章节后置处理与巩固跟进计划。
- [Chapter Editor V2 Plan](./plans/chapter-editor-v2-plan.md)：章节编辑器 V2 版本推进计划。
- [Chapter Output Pipeline Optimization Plan](./plans/chapter-output-pipeline-optimization-plan.md)：章节输出管道优化计划。
- [Character Resource Ledger Plan](./plans/character-resource-ledger-plan.md)：角色资源账本设计与实施计划。
- [Character System Upgrade Plan](./plans/character-system-upgrade-plan.md)：角色系统升级与重构方案。
- [Director Mode Module and State Refactor Checklist](./plans/director-mode-module-state-refactor-checklist.md)：导演模式模块与状态重构检查清单。
- [Director Stage Hardening Plan](./plans/director-stage-hardening-plan.md)：导演阶段稳定性加固计划。
- [Drama Production Pipeline V3](./plans/drama-production-pipeline-v3.md)：微短剧生产流水线 V3 方案。
- [Imitation Writing and Chain Hardening Plan](./plans/imitation-writing-and-chain-hardening-plan.md)：模仿写作与章节生成链加固计划。
- [Novel to Shortdrama Adaptation Plan](./plans/novel-to-shortdrama-adaptation-plan.md)：小说转短剧适配技术方案。
- [Pending Review Auto Promotion Plan](./plans/pending-review-auto-promotion-plan.md)：待审核章节自动晋级与流转方案。
- [Prompt Workbench, Context and Step Runtime Plan](./plans/prompt-workbench-context-and-step-runtime-plan.md)：Prompt 工作台、上下文及步骤运行时方案。
- [Tension Curve Display Edit Split Plan](./plans/tension-curve-display-edit-split-plan.md)：张力曲线展示与编辑拆分计划。
- [Tension Curve Flow Refactor Plan](./plans/tension-curve-flow-refactor-plan.md)：张力曲线流控重构计划.
- [Tension Curve Plan](./plans/tension-curve-plan.md)：小说张力曲线核心技术方案。

### `docs/design`

用于放系统设计、模块接口、产品机制和领域建模说明。

- [产品 UI 总体设计系统](./design/product-ui-design-system.md)
- [Style Engine v1](./design/style-engine-v1.md)
- [Style Engine Prompt Compiler v1](./design/style-engine-prompt-compiler-v1.md)
- [Style Engine Boundary and PRD v2](./design/style-engine-boundary-prd-v2.md)
- [Visualization Stack](./design/visualization-stack.md)：数据与链路可视化技术栈选型与架构设计。
- [World Management v2](./design/world-management-v2.md)
- [World Story Interface v1](./design/world-story-interface-v1.md)
- [Video Adaptation and OpenMontage Bridge Design v1](./design/video-adaptation-openmontage-design-v1.md)：视频改编与 OpenMontage 异步桥接系统设计方案。
- [RAG Retrieval Enhancements Design v1](./design/rag-enhancements-design-v1.md)：RAG 检索上下文化前缀、双路混合检索、Reranker 重排与 SQLite 物理降级直写兜底方案。
- [Title Studio and Library Design v1](./design/title-studio-library-design-v1.md)：基于 LLM 句式分析与 Jaccard 相似度去重去同的标题发散生成及爆款标题库管理系统方案。


### `docs/architecture`

承接横切架构说明与工程约定（不改变根目录对外入口）。

- [Backend testing](./architecture/testing.md)：后端 `node:test` 脚本运行方式与目录约定。

### `docs/wiki`

用于沉淀长期项目知识，帮助未来开发者和 AI Agent 理解关键架构决策、工作流边界、运行协议、调试经验和产品设计依据。

详细的 Wiki 内容导航请参考 **[Wiki 主索引 (Wiki Index)](./wiki/README.md)**，分类包括：

- **Architecture (架构边界)**：[模块边界与文档治理](./wiki/architecture/module-boundaries.md)、[当前模型选择与厂商默认模型边界](./wiki/architecture/model-selection.md)、[配置项归属与可见性规范](./wiki/architecture/configuration-conventions.md) 等。
- **Workflows (核心工作流)**：[自动导演 Runtime 与恢复边界](./wiki/workflows/auto-director-runtime.md)、[章节生产链路](./wiki/workflows/chapter-production-chain.md)、[拆书工作流](./wiki/workflows/book-analysis-workflow.md) 等。
- **Prompts (提示词治理)**：[Prompt Registry 与结构化输出](./wiki/prompts/prompt-registry-and-structured-output.md) 等。
- **RAG (知识库与检索)**：[知识库与上下文组装](./wiki/rag/knowledge-and-context-assembly.md) 等。
- **Debugging (故障排查)**：[重复故障模式与排查路径](./wiki/debugging/recurring-failure-modes.md) 等。
- **Product (产品设计依据)**：[新手优先与整本小说完成原则](./wiki/product/beginner-first-novel-completion.md) 等。

- [Wiki Entry Template](./wiki/entry-template.md)

### `docs/public`

面向用户的产品与使用说明文档、新手教程与故障排除指南。

- [Introduction](./public/introduction.md)：项目简介与新手概念说明。
- [Installation](./public/installation.md)：安装与运行环境配置指南。
- [Usage Guide](./public/usage-guide.md)：基础使用与操作指引。
- [Development Roadmap](./public/development-roadmap.md)：产品功能开发路线图。
- [Troubleshooting](./public/troubleshooting.md)：常见问题解决与排查指引。
- [FAQ](./public/faq.md)：产品与功能常见问答。
- **Flow (业务流程)**:
  - [Auto Director Pipeline](./public/flow/auto-director-pipeline.md)
  - [Chapter Execution](./public/flow/chapter-execution.md)
  - [End to End Production](./public/flow/end-to-end-production.md)
  - [Knowledge and RAG](./public/flow/knowledge-and-rag.md)
- **Modules (模块详解)**: 包含了世界观设定、角色库、自动导演、创意中心、微短剧、任务中心、Prompt 管理等 20 个功能模块的详细说明。
- **Playbook (实战手册)**:
  - [First Novel Walkthrough](./public/playbook/first-novel-walkthrough.md)
  - [Recovery by Phase](./public/playbook/recovery-by-phase.md)

### `docs/releases`

用于放完整的用户可见版本更新说明与发布历史；根 `README.md` 只保留最新一次更新，本目录负责承接完整历史。

- [Release Notes](./releases/release-notes.md)

### `docs/sourcegraph`

存放由 Sourcegraph/CodeGraph 辅助生成的源码审计与静态分析报告。

- [Project Source Audit](./sourcegraph/project-source-audit.md)：源码结构与依赖关系的审计记录。

### `docs/superpowers`

存放特殊核心能力、灰度测试以及特定环境下的技术方案。

- [Lucky Beta Selective Port Plan](./superpowers/plans/2026-04-25-lucky-beta-selective-port.md)：特定测试环境的选择性端口配置方案。

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
- 用户级/公开的产品手册与使用指南优先放到 `docs/public/`。
- 已废弃、乱码、明显被当前发布事实取代但需要留档的方案放到 `docs/archive/outdated/`。

## 维护约束

- 新增文档时，先判断是否真的需要留在根目录；默认答案应当是“不需要”。
- 新增或修改核心工作流、Prompt、RAG、任务状态、自动导演、章节生产或重要调试结论时，先判断是否产生稳定 Wiki 价值。
- Wiki 页面应解释长期规则和原因，不写成文件修改列表、临时 TODO 或 release notes 复制品。
- 文档迁移后，如根 `README.md` 或其他入口文档里有引用，应同步更新路径。
- `TASK.md` 负责“当前主路线与优先级”，不替代设计文档；设计细节应沉到 `docs/`。
- 根 `README.md` 的更新说明只保留最新一次；完整历史统一维护在 `docs/releases/release-notes.md`。
