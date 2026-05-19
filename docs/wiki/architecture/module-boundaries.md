# 模块边界与文档治理

## 背景

项目已经从单一写作助手扩展为包含 Web 前端、Express/Prisma 后端、桌面宿主、共享类型、Prompt Registry、自动导演、RAG、任务中心和章节生产链路的 monorepo。功能累积后，重复问题通常不是缺少代码，而是模块边界、状态事实源和文档职责不清。

如果继续把规则只写在计划文档或阶段检查点里，未来开发者和 AI Agent 会反复重新判断同一类问题：一个能力应该归哪个模块、能不能直接调用旧 service、应该写 release notes 还是 Wiki、长文件是否必须拆分。

## 决策

Wiki 记录稳定规则，计划和检查点保留历史语境。模块治理以“小说生产主链路”为核心：setup、planning、production、director、characters、state、export 等业务模块应逐步拥有清晰入口；横切基础设施应收敛到 prompting、RAG、LLM、db、runtime、events 等平台能力。

长文件拆分不是为了行数本身，而是为了把业务规则、应用编排、外部适配和 HTTP/API 映射分开。目录过密时，应建立有责任边界的下级模块，而不是继续堆同级文件。

## 当前规则

- 根目录只保留入口说明、协作规则、路线图和工具链配置；长期知识进入 `docs/wiki/`。
- `docs/plans/` 保留执行方案，`docs/checkpoints/` 保留阶段记录，`docs/design/` 保留模块设计，`docs/releases/` 保留用户可见变化。
- 单个源码文件接近 600 行时应评估职责；超过 700 行后继续扩展前必须拆分。
- 高密度目录新增能力前应先判断是否需要下级责任目录。
- `server/src/services/novel/director` 应继续向 `commands`、`runtime`、`state`、`automation`、`projections`、`recovery`、`phases` 等责任边界收敛。
- 新增业务能力优先通过模块门面或 `index.ts` 暴露，不从外部深链到其他模块内部文件。
- 涉及自动导演、章节执行、Prompt、RAG、任务状态或前端投影的边界变化，应同步更新 Wiki 或模块 README。
- 任何数据回填、同步、抽取或索引刷新，必须只消费章节的稳定快照；在章节仍可能继续修复、重写或回退时，不允许把这类动作挂在热路径里。
- 任务快照、事实检查和恢复建议生成必须保持只读；`recover` 可以返回可恢复位置，但不能在轮询、预览或投影读取时写入 `run_resumed`、恢复提示或其他状态事件。需要记录恢复动作时，必须由显式执行/恢复流程来写入，而不是由读路径顺手写入。
- 小说导出属于独立业务模块：`server/src/modules/export/` 只负责读取现有小说生产数据、转换导出 DTO、生成 TXT/Markdown/JSON 内容和导出文件名。它不拥有小说、章节、角色、时间线或质量修复事实源，也不在导出过程中写回生产状态。
- 时间线约束层属于独立业务模块：`server/src/modules/timeline/` 只管理时间线事件、章节时间锚点、钩子、约束和检测报告。它不替代 `StoryStateSnapshot`、`ConsistencyFact` 或 `CharacterTimeline`，也不直接调用章节 writer 改正文。
- 章节生成、Prompt Registry 和任务中心只能通过时间线模块 facade 获取时间线上下文或检测报告，不应在 writer、route 或 UI 中直接拼接 timeline 表查询规则。

## 示例

推荐做法：

- 自动导演新增可执行命令时，先确定它属于 command、runtime、automation、recovery 还是 projection，再放入对应模块。
- 章节生产链路新增质量检查时，先判断它属于热路径接收闸门、局部修复还是异步资产回灌。
- 章节生产新增时间线规则时，应先进入 timeline 模块的 policy、context、checker 或 extractor，而不是散落到 writer prompt 或章节服务分支里。
- 新文档如果解释长期规则，进入 `docs/wiki/`；如果只是某阶段实施清单，进入 `docs/plans/` 或 `docs/checkpoints/`。

禁止或不推荐做法：

- 在 `services/novel/director` 根目录继续添加多个 `novelDirector*` 同级文件来承载新子系统。
- 用 `helper`、`utils`、`shared` 这类泛名文件承载业务策略。
- 把 release notes 复制到 Wiki，或把 Wiki 写成一次提交的改动列表。

## 失败模式

- 同一个状态在 task、runtime、seed payload、前端缓存中各自推断，导致 UI 展示和实际运行不一致。
- 一个旧 service 同时处理 HTTP 语义、工作流编排、数据库写入和 Prompt 输入拼装，后续修复只能继续加分支。
- 文档只留在阶段计划里，稳定规则难以被未来任务复用。

排查时先找事实源和模块入口，再判断是否是边界缺失导致的重复实现。

## 相关模块

- `server/src/services/novel/director/`
- `server/src/services/novel/runtime/`
- `server/src/modules/export/`
- `server/src/prompting/`
- `client/src/pages/`
- `shared/`
- `docs/`

## 来源文档

- [Docs 管理约定](../../README.md)
- [自动导演执行面隔离与 API 保活计划](../../plans/auto-director-execution-plane-isolation-plan.md)
- [导演模式模块化与状态治理改造清单](../../plans/director-mode-module-state-refactor-checklist.md)
- [Novel Director 子系统](../../../server/src/services/novel/director/README.md)
