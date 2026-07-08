# 仿写能力与生成链路加固方案

## 背景

用户目标：在现有系统上增加"仿写"能力——照着一本参考作品写，既模仿文字手感，也借鉴结构套路。

前置调研结论（2026-07，基于代码逐点验证）：

1. **文字手感仿写已存在**：写法引擎的"从拆书生成写法"（`POST /style-profiles/from-book-analysis`）是通路，生成的写法资产走正常绑定/编译/注入链路，`style_contract` 块在写作 prompt 中真实生效（priority 74，full 模式 required）。
2. **结构仿写的后端管道已有一半**：`NovelReferenceService.buildReferenceForStage` 会把绑定到小说知识库的全部拆书分析按阶段（outline / structured_outline / bible / beats / character）注入规划期 prompt，不限续写模式。缺的是：产品入口、主参考权重机制、结构相似度护栏。
3. **主链基础设施成熟**：写作上下文块系统（35 个 block、独立 priority/required 配置、token 预算裁剪、禁入组）足以支撑新注入，`style_contract` 是活先例；已有可断言"某块是否出现在最终 prompt"的测试模式。
4. **系统性风险是"最后一公里"集成纪律，不是架构**：本轮调研累计确认四个同模式案例——时间线（prompt 中是硬编码占位句）、续写（`humanBlock` 被截到只剩前 3 行标题信息）、拆书 chapter stage（`STAGE_SECTION_MAP` 定义了但从未被调用）、角色资产账本（多层截断+非必需块，预算紧张时静默消失）。共同点：数据管道扎实，渲染进 prompt 的最后一步失效，且无测试守护。
5. **两个调用点/治理隐患**：`buildReferenceForStage` 在 `novelCoreGenerationService.ts` 四处调用均无异常兜底（在 `Promise.all` 内，新逻辑抛错会炸掉整个开书流程）；`ChapterArtifactDeltaService`（926 行）与 `NovelVolumeService`（803 行）已超 AGENTS.md 700 行强制拆分线。

## 设计边界（不可协商）

1. **零影响原则**：未绑定任何参考的小说，生成行为与现在完全一致。所有新逻辑空值降级为空字符串/空数组，异常在服务内部兜底，不允许冒泡到规划/写作调用方。
2. **职责边界遵守 `docs/design/style-engine-boundary-prd-v2.md`**：文字手感归写法引擎；结构套路归 reference/规划层，不得以写法字段形式进入写法引擎。
3. **护栏不阻断主链**（遵守 AGENTS.md Auto-Director Quality Gate 规则）：结构相似度检测是生成后的旁路提示，不做生成时硬拦截，不停自动导演。
4. **AI-first**：结构相似度判断用 AI 结构化输出实现（n-gram 字面相似度对结构问题无效），prompt 走 `server/src/prompting/` + registry，不在 service 内联。

## Phase 0：地基加固（新链路的前置条件）

### PR0-A 上下文块存在性契约测试

- `server/tests/chapterLayeredContext.test.js`：扩展现有测试模式，对关键块建立"启用条件满足时，块必须出现在最终 blocks 且内容非空"的断言矩阵。至少覆盖：`style_contract`、`continuation_constraints`、`character_hard_facts`、`character_resource_context`（有资源压力时）、本方案后续新增的块。
- 目的：把"最后一公里"从口头纪律变成回归测试，任何人改动渲染层导致块静默消失时 CI 直接失败。

### PR0-B `buildReferenceForStage` 调用点加固

- `server/src/services/novel/NovelReferenceService.ts`：`buildReferenceForStage` 内部整体兜底——任何查询/解析异常记 warning 日志后返回空字符串，不向调用方抛出。四个规划阶段的调用代码不动。

### PR0-C（并行赛道，不阻塞后续 Phase）超长文件拆分

- `ChapterArtifactDeltaService.ts`（926 行）、`NovelVolumeService.ts`（803 行）按 AGENTS.md 责任目录规则拆分。
- 本方案的仿写逻辑不触碰这两个文件，因此拆分可与 Phase 1/2 并行；但在拆分完成前，禁止任何新功能往这两个文件继续加码。

## Phase 1：续写渲染修复（仿写共用路径，先修通再复用）

### PR1-A 续写约束渲染增强

- `server/src/prompting/prompts/novel/chapterLayeredContextShared.ts`：`summarizeContinuationConstraints` 从"humanBlock 前 3 行、总量 4 条"改为按 continuation pack 的结构分节提取（来源标题、角色当前状态、前作终局摘要、关键事实、未完线索各取有限条数），输出总量与 token 预算对齐。
- `server/src/prompting/prompts/novel/chapterLayeredContext.ts`：`continuation_constraints` 块评估是否在续写模式下提升为 required（与 `style_contract` 同级），避免预算紧张时被静默丢弃。

### PR1-B 续写绑定拆书分析真正生效

- `server/src/services/novel/NovelContinuationService.ts`：`buildChapterContextPack` 增加对 `continuationBookAnalysisId` 的消费——绑定了拆书分析时，优先使用其结构化小节（timeline / character_system 等）替代原文按行粗切片；未绑定时保持现状。
- 顺带处置死代码：`NovelReferenceService` 的 `STAGE_SECTION_MAP.chapter` 条目，在本 PR 中要么被此路径真正调用，要么删除并在注释/wiki 中说明原因，不允许继续留着无人调用。

### PR1-C 契约测试覆盖

- `server/tests/chapterLayeredContext.test.js` + `server/tests/`（续写相关新测试文件）：断言续写模式下增强后的约束内容真实出现在 writer blocks；断言绑定拆书分析时 pack 内容来自结构化小节。

## Phase 2：结构仿写本体

### PR2-A 主参考绑定数据模型

- `server/src/prisma/schema.prisma` + `schema.sqlite.prisma`（两份同步）：`Novel` 新增结构主参考字段（对齐 `continuationBookAnalysisId` 的先例形态：分析 ID + 可选 section 选择），需要一次加字段迁移。
- `shared/types/` 相应类型与 zod schema 扩展。
- `server/src/modules/novel/setup/http/novelBaseRoutes.ts`：创建/更新入参校验扩展，校验逻辑对齐 `NovelContinuationService.validateWritingModeConfig` 的做法（分析必须 succeeded 且来源可达）。

### PR2-B 主参考权重注入

- `server/src/services/novel/NovelReferenceService.ts`：复用现有 continuation preferred 的代码模式（`resolveContinuationAnalysisConfig` → preferred 优先注入 + 其余参考降权），为结构主参考建立同构的解析与注入路径；主参考与续写 preferred 同时存在时明确优先级（建议续写优先，因其语义更强）。
- 注入内容按阶段吃 `plot_structure / character_system / timeline` 等结构小节，标签区分于普通参考（如 `structure.reference.primary`）。

### PR2-C 产品入口

- 创建页与项目设定页（`client/src/pages/` 对应模块）：新增"选择参考作品结构"入口——从已完成拆书的分析中选择一份作为主参考，展示当前绑定状态与可解绑操作。
- UI 文案遵守 AGENTS.md UI Copy 规则（面向用户任务，不写实现叙事）。

### PR2-D 结构相似度护栏（旁路提示，不阻断）

- 新增 prompt：`server/src/prompting/prompts/novel/` 下新建结构对比 PromptAsset 并注册进 `registry.ts`，输入为生成的结构化大纲摘要 + 主参考的结构小节摘要，输出结构化的相似点清单与风险分级。
- 新增服务：`server/src/services/novel/reference/`（或按现有目录归属）结构相似度检测服务，挂在结构化大纲/卷骨架生成完成后的确认环节，结果以提示形式展示（对齐 `openAuditIssues` 的展示模式），用户可无视继续。
- 检测失败静默降级（记日志、不出提示、不阻断），遵守零影响原则。

### PR2-E 自动导演透传

- `server/src/services/novel/director/` 相关 runtime（对齐 `continuationBookAnalysisId` 现有的透传点：candidateRuntime / confirmRuntime / helpers / takeover）：主参考字段随导演创建链路透传，自动导演开书时主参考同样生效。

## Phase 3：产品整合与文档

- 把"从拆书生成写法"（已有）与"结构主参考"（Phase 2）在产品叙事上合并为"照着这本书写"的完整体验；入口文案与引导统一。
- `docs/public/modules/book-analysis.md` 与写法引擎公开文档：补充仿写路径说明。
- `docs/wiki/workflows/`：新增结构仿写工作流 wiki（Background / Decision / Current Rule / Failure Modes 格式），说明与写法引擎的职责分界及"最后一公里"契约测试要求。
- README 最新更新与 release notes 按 readme-release-updater 流程处理。

## 明确不做

- 不在章节写作阶段注入结构参考全文（token 预算不允许，规划期注入已覆盖结构影响）。
- 不把结构字段塞进写法引擎 schema。
- 不做生成时硬拦截的相似度门禁。
- 不在本方案内处理时间线恢复、资产账本预算调整等已知历史问题（另行立项）。

## 测试范围

- Phase 0：契约测试矩阵本身；`buildReferenceForStage` 异常注入下四个规划阶段仍正常返回。
- Phase 1：续写约束的分节提取正确性；required 语义；拆书分析小节替代粗切片的选择逻辑；无绑定时行为不变。
- Phase 2：主参考校验（不存在/未成功/跨来源的拒绝）；权重注入顺序；与续写 preferred 共存时的优先级；相似度检测的结构化输出解析与降级路径；未绑定主参考时全链路行为与现在逐字节一致（关键回归）。
- 全程：现有测试套件不回退。

## 风险

| 风险 | 等级 | 应对 |
| --- | --- | --- |
| 新逻辑异常影响正常开书流程 | 高（未兜底时） | PR0-B 强制内部降级；Phase 2 所有新查询同样内部兜底 |
| 新增块被 token 预算静默丢弃，重演最后一公里问题 | 中 | PR0-A 契约测试 + required/priority 显式决策，不依赖默认值 |
| 结构仿写生成内容与参考作品过近 | 中 | PR2-D 旁路检测提示；检测本身 AI 化，随样本迭代 prompt |
| 主参考与续写 preferred 语义冲突 | 低 | PR2-B 明确优先级规则并写入 wiki |
| Prisma 迁移（加字段） | 低 | 纯增量字段，两份 schema 同步，无数据回填 |

## 实施顺序与分支

- 顺序：Phase 0（PR0-A/B）→ Phase 1 → Phase 2 → Phase 3；PR0-C 并行。
- 分支：feature branch → beta → main，影响生成主链，不得直跳 main。
- 每个 PR 独立可验证、独立可回滚；Phase 1 完成后即产生用户可见价值（续写实质生效），不必等全部完成才合入。

## 验收标准

- 未绑定任何参考/未开续写的小说：生成链路行为、prompt 内容与改动前一致（契约测试与抽样 diff 验证）。
- 续写模式：writer prompt 中可见前作角色状态/终局摘要/未完线索的结构化约束，且有测试守护。
- 结构仿写：绑定主参考后，规划期产物可见参考结构影响；结构化大纲确认环节出现相似度提示（当相似点存在时）；解绑后回归普通行为。
- 全部新增 prompt 在 registry 注册；wiki 与 release notes 按规则更新。
