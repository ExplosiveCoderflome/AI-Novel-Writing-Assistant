# 项目开发 Wiki

本目录用于沉淀长期项目知识，帮助未来开发者和 AI Agent 理解项目为什么这样设计，以及后续应该如何维护。

Wiki 不记录单次提交改了什么，也不替代 release notes。它只记录跨阶段仍然有用的架构规则、工作流边界、运行协议、调试经验和产品设计依据。

## 使用方式

- 先从本页找到相关主题，再进入对应分类页面。
- 如果页面内容来自历史计划、设计文档或检查点，保留来源链接，不搬空原文档。
- 如果一次开发澄清了长期规则，应更新对应 Wiki；如果只是小改动或发布流水账，不写 Wiki。
- 新页面默认使用 [entry-template.md](./entry-template.md) 的结构。

## 目录

### Architecture (架构边界与设计约定)

- [模块边界与文档治理](./architecture/module-boundaries.md)
- [当前模型选择与厂商默认模型边界](./architecture/model-selection.md)
- [配置项归属与可见性规范](./architecture/configuration-conventions.md)
- [章节运行时边界](./architecture/chapter-runtime-boundaries.md)
- [章节身份与规划边界](./architecture/chapter-identity-and-planning-boundary.md)
- [Drama Forge 模块边界](./architecture/drama-forge-module-boundary.md)
- [事件副作用边界](./architecture/event-side-effect-boundaries.md)
- [图片生成服务商配置与选择](./architecture/image-generation-providers.md)
- [小说应用服务架构层设计](./architecture/novel-application-services.md)
- [读路径性能与数据缓存边界](./architecture/read-path-performance-boundaries.md)
- [服务端架构演进与迁移路径](./architecture/server-architecture-migration-plan.md)
- [世界观上下文网关设计规范](./architecture/world-context-gateway.md)
- [世界观可视化资源配置边界](./architecture/world-visualization-assets.md)

### Workflows (核心业务工作流)

- [自动导演 Runtime 与恢复边界](./workflows/auto-director-runtime.md)
- [自动导演候选生成与自动确认机制](./workflows/auto-director-candidate-auto-confirm.md)
- [自动导演阶段切换检查清单](./workflows/auto-director-stage-checklist.md)
- [自动导演世界观背景初始化流](./workflows/auto-director-world-setup.md)
- [章节生产链路](./workflows/chapter-production-chain.md)
- [角色资源账本工作流](./workflows/character-resource-ledger.md)
- [拆书工作流与分段解析设计](./workflows/book-analysis-workflow.md)
- [图片生成确认与统一运行时](./workflows/image-generation-confirmation-runtime.md)
- [Creative Hub 边界与职责划分](./workflows/creative-hub-boundary.md)
- [漫画角色资产生成管道](./workflows/comic-character-asset-pipeline.md)
- [漫画分镜生产 Prompt 治理](./workflows/comic-panel-production-prompt-governance.md)
- [漫画场景一致性控制与检验](./workflows/comic-scene-consistency.md)
- [桌面版发布与版本号控制规范](./workflows/desktop-release-versioning.md)
- [惰性章节规划与动态内容生成](./workflows/lazy-chapter-planning.md)
- [小说封面图片生成与确认流程](./workflows/novel-cover-image-generation.md)
- [小说事实账本与连续性维护](./workflows/novel-fact-ledger.md)
- [小说快照保留与版本回滚机制](./workflows/novel-snapshot-retention.md)
- [待审核内容自动晋级与状态机流转](./workflows/pending-review-auto-promotion.md)
- [质量债追踪与归因判定规则](./workflows/quality-debt-attribution.md)
- [微短剧工作台协作机制与数据规范](./workflows/short-drama-workspace.md)
- [时间线约束层与时序碰撞检测](./workflows/timeline-constraint-layer.md)
- [视频改编桥接适配流程](./workflows/video-adaptation-bridge.md)

### Prompts (提示词编写与结构化控制)

- [Prompt Registry 与结构化输出](./prompts/prompt-registry-and-structured-output.md)
- [小说生成质量卫士与 Prompt 防火墙](./prompts/novel-generation-quality-guards.md)

### RAG (检索与上下文组装)

- [知识库与上下文组装](./rag/knowledge-and-context-assembly.md)

### Debugging (故障排查与已知问题)

- [重复故障模式与排查路径](./debugging/recurring-failure-modes.md)
- [角色连续性事实硬冲突调试排查](./debugging/character-continuity-hard-facts.md)
- [LLM 请求限流器内存泄漏排查与分析](./debugging/llm-request-limiter-memory-leak.md)
- [日志保留机制与过度膨胀排查](./debugging/log-retention.md)

### Product (产品设计原则与依据)

- [新手优先与整本小说完成原则](./product/beginner-first-novel-completion.md)
- [GitHub 开源介绍页面设计与运营指导](./product/github-intro-site.md)
- [全局与项目级配置就绪性检查规范](./product/settings-readiness.md)
- [世界观骨架自动生成设计依据](./product/world-skeleton-generation.md)

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
