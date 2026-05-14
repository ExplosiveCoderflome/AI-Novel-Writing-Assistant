# 项目开发 Wiki

本目录用于沉淀长期项目知识，帮助未来开发者和 AI Agent 理解项目为什么这样设计，以及后续应该如何维护。

Wiki 不记录单次提交改了什么，也不替代 release notes。它只记录跨阶段仍然有用的架构规则、工作流边界、运行协议、调试经验和产品设计依据。

## 使用方式

- 先从本页找到相关主题，再进入对应分类页面。
- 如果页面内容来自历史计划、设计文档或检查点，保留来源链接，不搬空原文档。
- 如果一次开发澄清了长期规则，应更新对应 Wiki；如果只是小改动或发布流水账，不写 Wiki。
- 新页面默认使用 [entry-template.md](./entry-template.md) 的结构。

## 目录

### Architecture

- [模块边界与文档治理](./architecture/module-boundaries.md)
- [当前模型选择与厂商默认模型边界](./architecture/model-selection.md)

### Workflows

- [自动导演 Runtime 与恢复边界](./workflows/auto-director-runtime.md)
- [章节生产链路](./workflows/chapter-production-chain.md)
- [Creative Hub 边界](./workflows/creative-hub-boundary.md)

### Prompts

- [Prompt Registry 与结构化输出](./prompts/prompt-registry-and-structured-output.md)

### RAG

- [知识库与上下文组装](./rag/knowledge-and-context-assembly.md)

### Debugging

- [重复故障模式与排查路径](./debugging/recurring-failure-modes.md)

### Product

- [新手优先与整本小说完成原则](./product/beginner-first-novel-completion.md)

## 写作边界

Wiki 应写：

- 长期架构决策和原因。
- 自动导演、章节生产、Creative Hub、Prompt、RAG、任务状态等核心链路的边界。
- 可重复使用的调试结论和排查路径。
- 新手优先、整本完成、低认知负担等产品原则如何影响实现。

Wiki 不应写：

- 单次提交的文件修改清单。
- 临时 TODO。
- 发布说明复制。
- 很快会废弃的实现细节。
- 只描述“本次改了什么”的流水账。

## 与其他 docs 目录的关系

- `docs/wiki/`：稳定知识和原因。
- `docs/plans/`：仍有执行价值的方案和任务拆解。
- `docs/checkpoints/`：阶段性进度、迁移里程碑和审计记录。
- `docs/design/`：系统设计、领域模型和产品机制。
- `docs/releases/`：用户可见更新历史。
- `README.md`：对外入口和最新公开摘要。
