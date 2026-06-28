# 拆书工作流

## 背景

拆书模块的目标不是把一本书拆成若干长篇评论，而是帮助写作新手把参考作品转成可复用的创作认知：作品定位、主线结构、人物系统、世界设定、主题表达、写法技法和商业卖点。由于拆书输入通常是长文本，LLM 成本会随书籍体量、原文片段数和启用小节数明显上升；如果 UI 不先解释范围和成本，用户容易在不了解代价的情况下启动大型任务。

拆书结果还会进入知识库、写法资产或创作中枢引用链路，因此它必须同时满足两类需求：用户能直接读懂，后续系统也能稳定检索和复用。

## 决策

拆书默认采用“原文范围 + 分析维度预设 + 成本可见 + 分小节生成 + 结构化关键结论”的工作流。用户先选择要分析的文档版本和可选章节范围，再选择本次需要生成哪些分析维度；系统根据实际输入范围提示预计片段数和模型调用规模；每个小节既生成可读 Markdown，也生成固定字段的 `structuredData`，用于 UI 摘要、发布、导出和后续 RAG 召回。

Prompt 合同、结构化后处理和 UI / 导出字段标签必须共享同一份字段规格，避免 Prompt 让模型输出一套字段、服务归一化消费另一套字段、前端再展示第三套字段。

## 当前规则

- 拆书入口必须让用户看到任务成本与文档体量关系，至少提示字数、预计原文片段数和大致模型调用规模。
- 每次新建拆书必须带有 token 预算上限。默认预算来自后端 `BOOK_ANALYSIS_BUDGET_TOKENS` 配置；历史数据中 `budgetTokens = null` 视为不限额。生成流程应在每个小节完成后累计 `usedTokens`，超过预算时以 `budget_exceeded` 标记失败并保留已完成小节，不能继续派发新的小节任务。
- 拆书预算可以在详情页单独调整。调整预算只修改 `budgetTokens`，不能清空 `usedTokens`，因为累计用量用于解释历史消耗和继续判断剩余空间；归档拆书不可再调整预算。
- 因 `budget_exceeded` 失败或取消的拆书可以走“扩容预算并续跑”。该路径必须先写入新的预算上限，再把任务重新排队；它只重做非冻结且未成功的小节，`succeeded` 小节和 `frozen` 小节保持原内容与状态。
- 拆书失败后重新生成不应覆盖已经 `succeeded` 的小节；重建任务只把非冻结且未成功的小节退回 `idle`，让预算用尽、取消或局部失败后的恢复优先补完缺口。
- 分析维度用预设降低新手决策压力：
  - `快速拆书`：适合先低成本看作品是否值得深拆。
  - `标准拆书`：适合大多数网文参考分析，是默认推荐范围。
  - `完整拆书`：适合深度复盘或需要时间线的小节。
- 预设卡片应展示会生成哪些小节，不能只显示数量；新手需要先知道这次会得到什么结果，再决定是否承担对应成本。
- `overview` 是拆书最小必备小节。即使用户选择较轻范围，也应保留总览，保证结果有作品定位和整体判断。
- 知识文档版本可以按章节缓存为 `DocumentChapter`。章节切分应优先使用确定性中文章节标题规则；规则无法可靠切分时可以调用已注册 Prompt 做 LLM fallback；LLM 仍失败时回退为整文单章，保证旧文档和非小说文档也能继续使用。
- `DocumentChapter` 以 `KnowledgeDocumentVersion` 为边界缓存，记录 `chapterIndex`、标题、原文起止 offset、字数和可选摘要；它不直接依附 `BookAnalysis`，同一源版本的多个拆书可以复用章节缓存。
- `BookAnalysis.sourceRange` 是一次拆书任务的输入边界，不是阅读器过滤条件。未选择章节范围时按全文分析；选择章节范围时必须保存起止 `chapterIndex`、原文 offset 和展示标签，生成 source notes 时只切入该范围，evidence 定位仍回到完整 `KnowledgeDocumentVersion.content` 的原文 offset，保证双栏阅读和发布溯源不丢失。
- 全量拆书生成应采用 `overview -> 其他小节并发` 的两阶段链路：如果启用了 `overview`，先生成总览并提炼 `BookAnalysisOverviewContext`，再把整本定位、题材、卖点、目标读者、优势和短板作为后续小节的口径锚点。若 `overview` 失败，后续小节必须以 `null` context 继续生成；若用户在 overview 后请求取消，必须在进入后续并发前停止。
- 单节重跑非 `overview` 小节时，应读取当前已保存的 `overview` 正文和结构化数据，重新组装 `BookAnalysisOverviewContext` 传入该小节 Prompt；如果历史拆书没有可用总览，则降级为 `null` context 继续生成。
- 两阶段切换必须保留运行心跳和取消检查，进度从 notes 阶段结束点单调推进到 overview 再到其余小节，避免 UI 看到进度回退。
- 拆书支持用户介入但不改变证据边界：`BookAnalysis.userFocusInstruction` 是本次拆书的全局关注点，应进入所有 section prompt；`BookAnalysisSection.focusInstruction` 是单节关注点，只进入对应 section prompt。两类指令只能影响筛选和表达优先级，不能覆盖 evidence grounding、固定 structuredData schema 或当前小节职责。
- 未启用的小节应作为冻结小节保留在任务结构中，而不是从产品模型里消失；这样后续可以局部补充，不破坏分析列表和发布逻辑。
- 每个拆书小节的 Prompt 输入应只携带与该小节有关的 notes 字段。筛不到相关信号时才回退全量 notes，避免为了生成一个小节重复灌入整本分析笔记。
- `BookAnalysisSourceCache` 的唯一键必须包含 source scope。全文缓存使用 `full`，章节范围缓存使用稳定的范围 key；不能让局部拆书复用全文 notes，也不能让全文重跑误用局部 notes。
- `structuredData` 是程序读取层，不是 Markdown 正文的复制。字段应短、稳、可筛选；缺少依据时字符串返回空字符串，数组返回空数组。
- `structuredData` 的普通数组字段最多保留 12 项，时间线节点数组最多保留 30 项。Prompt 应要求模型按重要度和叙事顺序保留最值得复用的条目；后端归一化发现模型仍返回超长数组时，只保留上限内条目，并把字段名写入 `normalizationWarnings`，让 UI 提示用户。
- 时间线小节的 `timeNodes` 与 `eventOrder` 应使用结构化节点数组，每个节点至少包含 `label`，可选 `timeHint`、`phase` 和 `sourceRefs`。旧字符串数组必须在归一化层自动包装为 `{ label }`，避免历史拆书在 UI、导出或续写引用中变空。
- 拆书结构化字段规格、中文标签、后端归一化和 Prompt 固定结构示例应来自 `shared/types/bookAnalysis.ts`，不得在前端、导出服务或 Prompt 中另起一份字段表。
- 时间线节点的兼容归一化和按阶段分组应走 `shared/utils/bookAnalysisTimeline.ts`。UI 摘要、导出发布和续写参考不得各自复制 `normalizeTimelineNode`，避免历史字符串节点、`sourceRefs` 截断和未分阶段兜底行为分叉。
- 新生成的 section evidence 应尽量绑定到 `structuredData` 的具体字段。`fieldKey` 必须来自当前小节字段规格；数组字段可以用 `fieldIndex` 指向具体数组项。归一化层遇到非法字段名时只清空绑定信息，不删除证据本身，以保证历史数据和模型偶发脏值仍可读。
- evidence 的 `fieldIndex` 必须在归一化后的字段数组长度内；如果模型指向了被截断的下标，应清空 `fieldIndex` 但保留 evidence item 和合法 `fieldKey`。
- evidence 可以携带 `chapterIndex` 与 `excerptOffsetRange` 指向原文章节和摘录位置。生成后应优先用 evidence 摘录在源文档中做确定性匹配补齐定位；匹配失败时保留 evidence 本身，不因为缺少章节定位而丢弃证据。
- UI 证据面板应兼容两类证据：有章节定位时提供原文章节预览和摘录高亮；历史 evidence 没有 `chapterIndex` 或 offset 时仍展示原证据摘录。
- `character_system` 小节是拆书报告的一部分，负责给用户快速理解人物系统、关系张力和可复用人物设计；它不应承载所有深度角色材料。
- 深度角色档案使用独立的 `BookAnalysisCharacter` / `BookAnalysisCharacterArc` / `BookAnalysisCharacterScene` 实体，与 `character_system` 小节并存。用户需要研究人物塑造时主动生成或手动维护角色档案；全量拆书默认不自动生成深度角色档案，避免基础拆书成本被隐式放大。
- 深度角色档案应采用“候选识别 -> 按需生成档案”的两阶段流程。`BookAnalysisCharacter.status = candidate` 表示只保存角色候选、定位、重要度、简述和出场章节提示；`generated` 表示已有完整 `profileJson`、弧线和场景；`failed` 表示上次生成失败且允许重试；`generating` 只用于同步生成中的短暂状态。
- 候选识别和档案生成都计入 `BookAnalysis.usedTokens`，但它们是可选研究动作，不应改变 `BookAnalysis.status`，也不能触发基础拆书小节重建。批量生成候选时只处理 `candidate` / `failed` 角色，跳过已经 `generated` 的档案。
- `profileJson` 在候选阶段可以为空；服务端序列化必须给前端返回非空 `profile` 降级对象，至少包含 `name` 和 `role`，避免历史 UI 或候选卡片因为完整档案未生成而空白。
- 深度角色档案的场景表现本期使用 `sceneLabel` 字符串承载，不接入正式场景实体；弧线节点可以引用 `chapterIndex`，但没有章节判断依据时应留空而不是猜测。
- 角色档案 Prompt 必须走 Prompt Registry，服务层只能调用注册资产和结构化输出 schema，不得在角色服务里内联业务 prompt。
- 角色档案深度使用 `brief / standard / deep / exhaustive` 四级。`brief` 与 `standard` 以 source notes 和 `character_system` 骨架为主；`deep` 与 `exhaustive` 必须保留 notes 骨架，同时按角色维度通过 RAG 回溯原文 chunk，补足台词、动作、心理和章节证据。深度提升不能退化成更长的 notes 拼接，也不能脱离原文证据扩写。
- 角色档案维度应以 `shared/types/bookAnalysisCharacter.ts` 为唯一枚举来源。新增维度时先扩展共享类型、结构化输出 schema 和 Prompt Registry 资产，再让服务、路由和 UI 消费同一份维度定义；不要在前端或服务层用临时字符串分支绕过 AI 结构化输出。
- 深度档案的 `profileSectionsJson` 是可单独深化的维度块，`depthMetadataJson` 记录每个维度实际使用的深度、token 与 chunk 引用。`evidenceJson` 中的角色证据应带 `sourceType`、`chapterIndex`、`quote`、可选 `chunkId` / `noteSegmentId` 和 `dimension`，供前端统一渲染证据与后续跳转章节。
- 角色相关 RAG 检索应收口在角色 RAG adapter。深度档案使用 `character.deep` 语义，形象扫描使用 `character.appearance` 语义；检索 query 可以按角色名、维度和章节提示构造，但召回应保持可追踪 evidence，不应把 chunk 当成无来源的普通 prompt 文本。
- 角色外貌维度的 RAG query 必须使用外貌专用词组，例如外貌、容貌、身形、发色、瞳色、衣着、服装、配饰、伤痕、表情、气质和姿态；不要混入台词、心理等非外貌召回词，避免把人物对话或内心活动误当作形象证据。
- 角色形象演变是角色档案的可选增量研究动作，不属于基础全量拆书。用户选择目标覆盖率后，系统按角色出场章节增量补齐快照；已扫描章节不应重复消耗，`manuallyEdited` 快照不能被后续扫描覆盖。
- 角色形象演变扫描属于分钟级 AI 任务，HTTP 入口必须只负责校验并入队，返回扫描 job 状态；实际 RAG、章节快照抽取和合并归纳在后台执行。前端应通过 job 状态与 `GET /appearance` 轮询展示增量结果，不能把用户请求连接当成长任务生命周期。
- 形象覆盖率按“已生成形象快照章节数 / 角色出场章节总数”计算。章节总数应来自角色出场章节提示与章节缓存的交集；没有足够出场章节依据时可以按可用章节降级，但不得为了凑百分比伪造快照。
- 每个形象快照只描述该章节的外貌、服装、配饰、身体状态、精神面貌和场景锚点；跨章节稳定特征与变化策略写回 `BookAnalysisCharacterAppearance`。稳定特征用于后续图片 prompt 的角色一致性，章节快照用于表现当章状态。
- 每个形象快照可以同时产出短外貌候选词条。词条只保存可审阅的视觉信息，如稳定特征、章节状态、服装变化、配饰、伤痕、表情气质或体态；纯剧情动作、临时情绪和场景氛围不应进入词条池。候选词条初始状态为 `pending`，已 `rejected` 或 `merged` 的词条不能因后续扫描被重新推回待处理。
- 外貌词条写回角色档案必须由用户显式勾选并触发融合。融合流程必须走 Prompt Registry 中的结构化 merge prompt，由 AI 判断当前外貌、稳定特征、词条证据和冲突信息如何合并；服务端只做结构化输出校验、事务写入和状态更新，不用固定字符串规则代替 AI 融合判断。
- 外貌词条融合成功后，应同步更新 `BookAnalysisCharacter.profileJson.appearance` 与 `BookAnalysisCharacterAppearance.consolidatedAppearanceJson`，并把参与融合的词条标记为 `merged`。被 AI 判定不适合进入长期外貌的选中词条可以标记为 `rejected`，原因写入 merge notes 供前端展示。
- 形象快照图片仍归属 `ImageSceneType = book_analysis_character` 和 `bookAnalysisCharacterId`，同时通过 `BookAnalysisCharacterAppearanceImage` 记录快照、生成任务和最终 `ImageAsset` 的关系。排队期间允许只有 `generationTaskId`，任务成功后再回填 `imageAssetId`，避免 UI 在生成中失去快照上下文。
- 章节形象快照图应优先参考同一拆书角色的基础形象图，以保持脸型、发型、体态和标志细节一致。存在多张基础形象图时，前端应让用户选择本次要使用的参考图；默认可选主图或第一张图，但不能在用户取消选择后强行恢复。
- 参考图选择必须进入生图预览和最终生成任务。预览用于让用户确认本次会发送哪些参考素材；任务执行时应通过 `ImageGenerationTask.referenceImageAssetIdsJson` 解析同 owner 的 `ImageAsset`，优先用本地文件路径传给图片 provider，并把实际使用的 reference asset ids 写入快照图片关系和生成资产 metadata，保证后续溯源。
- 拆书角色配图使用独立的 `book_analysis_character` 图片场景类型，图片任务和图片资产必须归属到 `BookAnalysisCharacter`，不能复用正式角色库的 `character` owner。
- 拆书角色生图入口应放在深度角色档案卡片内，并沿用图片模块的确认式提示词、任务轮询、主图、删除和排序规则；基础全量拆书不自动触发角色生图。
- 拆书角色升格到正式角色库必须由用户显式触发。初版只复制共享人物字段，并默认允许携带当前主图；携带主图时应克隆为新的 `BaseCharacter` 图片资产，不能让正式角色引用拆书角色原资产。
- 拆书角色与升格后的正式角色不做双向同步。删除或修改拆书角色图片不应影响已升格角色；正式角色后续编辑也不回写拆书档案。
- 诊断模式只改变入口和展示文案，不 fork 拆书核心生成链路。用户选择自己的小说后，系统应把当前章节正文导出为 `KnowledgeDocument`，再用现有 `createAnalysis(documentId)` 链路创建拆书。
- 诊断模式的源文档应优先使用小说正文 TXT 导出，而不是包含设定、任务日志和质量报告的完整项目导出；这样节奏、人物、伏笔等结论基于稿件正文，而不是混入生产过程材料。
- 诊断模式不得修改原小说正文，也不得把诊断结果自动写回规划、角色或章节。后续改稿仍应由用户显式触发相应写作/修复链路。
- 服务端拆书模块以 `BookAnalysisService.ts` 和 `bookAnalysis.generation.ts` 作为稳定 facade。根目录不再继续堆叠同前缀文件；命令/查询/看门狗归入 `application/`，预算和 source notes 缓存归入 `caching/`，队列/并发/进度/序列化归入 `infrastructure/`，发布和导出归入 `publish/`，配置/常量/类型/schema/归一化工具归入 `shared/`，小节写作归入 `writing/`。新增能力应先判断所属责任目录，避免把 Prompt 调用、缓存、状态流转和 HTTP 可见副作用重新堆回 facade。
- 前端拆书工作台的外部稳定入口是 `useBookAnalysisWorkspace`。该 hook 应保持页面 facade 职责，把小节草稿与优化预览、深度角色档案、发布与写法资产动作分别委托给子 hook；页面组件继续只依赖 workspace facade，避免把角色、发布或小节编辑状态散落到多个顶层组件。
- 发布到知识库或导出 Markdown 时，应优先包含“关键结论”摘要，再输出长文分析；这样后续 RAG 更容易召回可操作结论，而不是只召回大段评论。
- 拆书发布到知识库必须使用独立来源通道。用户上传资料使用 `KnowledgeDocument.kind = user_upload`；拆书发布资料使用 `KnowledgeDocument.kind = analysis_published`，并写入唯一的 `sourceAnalysisId`。普通上传可以继续按标题追加版本，但不能合并到拆书发布文档；拆书发布必须按 `sourceAnalysisId` 复用同一知识文档并追加新版本。
- 拆书发布版进入知识库索引时，应把结构化关键结论转成 RAG facet 分块：题材、卖点、目标读者、优势、短板、人物功能和章节锚点必须进入 chunk metadata / Qdrant payload。Markdown 正文仍用于阅读和普通检索，但结构化分块用于后续按维度精确召回。
- 同一拆书重复发布到同一本小说知识库时，应替换该拆书来源的旧绑定，只让最新发布版进入小说 RAG 绑定集合；旧发布文档本体不级联删除，避免破坏其他引用或历史审计。绑定更新应以 `sourceAnalysisId` 和发布文档 ID 清理旧绑定，避免手动绑定过同一发布文档时触发重复绑定。
- 拆书 UI 应先展示结构化关键结论，再展示完整 Markdown。新手先看结论判断价值，需要细节时再读长文。
- 拆书结果查看应采用阅读优先结构：主要小节使用 Tab 切换展示，默认只显示当前小节，避免所有小节上下堆叠；关键结论是默认可见内容；正文可通过“重点速览 / 完整阅读”切换控制展开密度；复制、重建、发布、导出、生成写法和归档等任务操作应进入顶部 sticky 工具栏；编辑、AI 优化和备注应折叠到用户需要时再展开；证据应按小节内嵌为字段 chip，点击后在当前小节查看摘录和原文定位，避免扫读时被全局长面板打断。
- 拆书结果页采用「小节分析 / 角色档案」两个顶层视图互斥切换。顶部 sticky 工具栏在 Page 层渲染，跨视图共享所有任务操作和预算调整入口，切换视图不会丢失工具栏。视图状态以 URL `?view=sections|characters` 同步，刷新与分享链接都会回到对应视图；URL 非法值兜底为默认的 `sections`。视图切换不保留之前视图的局部状态（证据选中、双栏开关），DetailPanel 与 CharacterPanel 走条件渲染卸载重渲染；双栏开关只在 `sections` 视图启用，切到 `characters` 视图时 Toolbar 隐藏双栏按钮。
- 宽屏双栏对照只属于拆书详情阅读区，不应包裹深度角色档案。双栏开关可以放在 sticky 工具栏中，视口不足时隐藏并自动降级为单栏；偏好可持久化，但窄屏不得强行渲染双栏。左栏负责原文章节阅读和证据高亮，章节目录应和正文并排呈现，不能把长目录堆在正文上方；左栏外层必须收住圆角、边框和内部滚动，避免边框线穿透到右栏。右栏继续承载小节 Tab、关键结论、证据 chip 和正文；左栏当前章节只用于给右侧字段显示“本章”提示，不应重排小节或改变生成结果。
- 选择知识文档后，分析列表应按当前文档过滤；用户切换文档时不应继续混入其他文档的拆书记录。

## 示例

推荐做法：

- 用户选择大型文档时，页面提示“书籍越长，分析时间和 token 用量通常越高”，并给出大型书籍的模型调用估算。
- 生成“人物系统”小节时，Prompt 输入优先保留人物、剧情和主题信号，不强行带入商业卖点、世界设定等低相关字段。
- 新增一个结构化字段时，先修改 `BOOK_ANALYSIS_STRUCTURED_FIELD_SPECS` 和 `BOOK_ANALYSIS_STRUCTURED_FIELD_LABELS`，再让 Prompt、归一化、UI 和导出自然消费这份定义。
- 发布拆书结果时，把“主线梗概 / 冲突升级 / 可复用套路”等短结论放在小节正文前，方便知识库检索。

禁止做法：

- 用一个 checkbox 让用户自己理解“是否生成时间线”这类专家决策，而不解释范围和成本。
- 在 Prompt 里硬编码一份字段 JSON，在服务归一化里再维护一份字段列表。
- 为了让某个小节生成更丰富，把所有 source notes 原样塞给每次 section prompt。
- 只导出 Markdown 长文，不导出结构化关键结论。

## 失败模式

- 拆书成本过高：先检查启用的小节数、文档字数、原文片段数、notes 最大 token 限制和每个 section 是否带入了无关 notes。
- 预算用尽后仍在运行：检查 `BookAnalysisBudgetGuard` 是否在小节写入后执行、`runWithConcurrency` 是否停止派发新任务并等待已启动 worker 收尾，以及 UI 是否用 `lastError` 中的 `budget_exceeded` 展示预算停止原因。
- 预算用尽后只能整单重做：检查详情页是否暴露预算调整入口和“扩容预算并续跑”动作；检查续跑接口是否只允许 `failed/cancelled + budget_exceeded`，并确认重建 section 的条件仍包含 `frozen: false` 与 `status: { not: "succeeded" }`。
- 预算调整后用量丢失：检查预算更新路径是否只更新 `budgetTokens`，不要重置 `usedTokens`；只有普通重新生成可以按从头重跑语义重置累计用量。
- 总览之后的小节口径不一致：检查 `overview` 是否先于其他小节生成、`BookAnalysisOverviewContext` 是否传入后续 section prompt，以及 overview 失败时是否按预期降级为 `null` context。
- 小节内容泛泛：检查该 section 的 notes 是否缺少相关信号；如果缺少，应回到 source note 抽取 prompt 或文档分段策略，而不是让小节 writer 自行虚构。
- 结构化摘要为空：检查 Prompt 固定结构示例、`BOOK_ANALYSIS_STRUCTURED_FIELD_SPECS`、后处理归一和测试 fixture 是否一致。
- 结构化结论被静默截断：检查生成结果是否写入 `normalizationWarningsJson`，序列化是否返回 `normalizationWarnings`，以及前端是否在关键结论区展示对应字段名。
- 历史时间线不显示：检查旧字符串数组是否经过 timeline node wrapper；UI、导出和续写引用都应容忍 `{ label }` 单字段节点。
- 关键结论无法溯源：检查 section evidence 是否带有合法 `fieldKey`，数组项是否按 0-based `fieldIndex` 指向对应结构化条目；如果绑定为空但证据存在，优先检查模型输出是否使用了非当前小节字段名。
- 深度角色档案成本异常：检查是否把角色生成接入了全量拆书链路；角色档案应只由用户在角色面板主动触发，不能在 `runFullAnalysis` 中自动调用。
- 候选角色重复或覆盖已生成档案：检查候选 upsert 是否按同一 `analysisId` 下的规范化姓名去重，且 `generated` 角色只保留原档案，不被识别结果覆盖。
- 候选卡片显示空档案：检查 `profileJson = null` 的序列化降级是否返回 `{ name, role }`，以及前端是否按 `status` 区分候选卡和完整档案卡。
- 角色档案内容脱离原文：检查角色生成 Prompt 是否只使用 source notes 和 `character_system` 上下文，证据摘录是否来自可用材料；如果缺少依据，应降低结论确定性或留空，不应补写原文外事实。
- 深度档案看似更长但没有更多证据：检查 `generationDepth` 是否进入 `deep/exhaustive` 分支，角色 RAG adapter 是否返回 chunk evidence，`profileSectionsJson` 是否记录维度深度，以及 `depthMetadataJson` 是否写入 chunkIds 与 token 用量。
- 角色外貌召回混入对话或心理：检查角色 RAG adapter 的 appearance query 是否仍带有台词、心理、行动等泛化词；外貌维度应只带视觉词和章节提示。
- 形象扫描显示网络失败但稍后出现快照：检查扫描入口是否退化为同步 HTTP、前端是否等待完整扫描响应、dev proxy 是否提前中止连接，以及扫描 job 是否仍在后台运行。正确行为是 POST 立即返回 queued/running job，UI 继续轮询 job 与 appearance。
- 形象覆盖率增加但章节没有新增：检查已扫描快照是否被重复选择、出场章节总数是否为空、章节分桶是否只在可用章节内取样，以及 `manuallyEdited` 快照是否被误判为可覆盖。
- 新发现外貌没有沉淀到角色档案：检查快照 prompt 是否输出 `candidateTerms`、服务端是否保存 pending 词条、前端是否只展示待确认词条，以及 merge 接口是否成功更新角色 `profile.appearance` 与稳定特征。
- 词条被错误自动写入角色外貌：检查扫描流程是否绕过用户确认直接更新了 `profileJson.appearance`；正确行为是扫描只生成快照与 pending 词条，只有用户勾选并融合后才写回角色档案。
- 形象快照图片生成后不显示在对应章节：检查 `BookAnalysisCharacterAppearanceImage.generationTaskId` 是否在排队时写入，图片任务成功时 `ImageGenerationService` 是否把新 `ImageAsset` 回填到等待中的快照图片记录，以及序列化 include 是否带出 `imageAsset`。
- 章节形象图人物不一致：检查角色是否已有基础形象图、形象演变面板是否选中了参考图、确认弹窗是否保留参考素材、生成请求是否写入 `referenceImageAssetIdsJson`，以及任务执行时是否解析出本地参考图路径传给 provider。
- 拆书角色图片串到正式角色图片：检查 `ImageSceneType`、任务 owner 和资产 owner 是否使用 `book_analysis_character` 与 `bookAnalysisCharacterId`；只有用户执行升格并选择携带主图时，才应复制为新的正式角色图片资产。
- 升格后图片互相影响：检查升格流程是否克隆图片文件和 `ImageAsset` 记录，不能只把同一个 asset 改 owner 或让两个角色共享同一条图片记录。
- 诊断模式误改原稿：检查 Novel 导出是否只创建知识文档和拆书分析，不应调用章节更新、修复、自动导演或角色写回接口。
- 诊断结论混入过程材料：检查诊断导出的 Document 内容是否来自章节正文 TXT，而不是完整 Markdown/JSON 项目包。
- 发布到知识库后召回效果差：检查导出 Markdown 是否包含“关键结论”，以及知识库索引是否使用最新发布内容。
- 重复发布后召回旧拆书：检查 `KnowledgeDocument.kind` 是否为 `analysis_published`、`sourceAnalysisId` 是否写入当前拆书 ID、重复发布是否创建了同一文档的新版本，以及同一小说下该拆书旧绑定是否被解绑；不要删除知识文档本体来解决绑定污染。
- UI 决策负担重：检查是否把高级选项放在默认入口，是否缺少推荐预设，是否没有说明 token 消耗与书籍体量的关系。
- 查看结果不方便：检查主要小节是否仍然上下堆叠而不是用 Tab 切换，是否没有速览 / 完整阅读切换，任务操作是否没有进入顶部 sticky 工具栏，证据是否仍在全局长面板里而不是随小节内嵌；宽屏双栏失效时，检查视口判断、localStorage 偏好、章节缓存和 evidence 的 `chapterIndex` / `excerptOffsetRange` 是否可用。
- 切换文档后列表混乱：检查前端列表请求是否传入 `documentId`，以及后端 `listAnalyses` 是否按文档过滤。

## 相关模块

- `client/src/pages/bookAnalysis/`
- `server/src/routes/bookAnalysis.ts`
- `server/src/modules/bookAnalysis/http/`
- `server/src/services/bookAnalysis/`
- `server/src/services/bookAnalysis/bookAnalysisCharacter/`
- `server/src/services/image/`
- `server/src/modules/export/`
- `server/src/prompting/prompts/bookAnalysis/`
- `shared/types/bookAnalysis.ts`
- `shared/types/bookAnalysisCharacter.ts`
- `shared/types/characterProfile.ts`
- `shared/types/image.ts`
- `shared/utils/bookAnalysisTimeline.ts`
- `server/tests/bookAnalysis.test.js`

## 长期演进方向

拆书模块正在从“全自动产出工具”演进为“用户协同的研究工作台”，覆盖学习、续写、素材库三类使用场景。完整演进方向、PR 路线、角色模块独立扩展方案见 [拆书模块扩展长期方案](../../plans/book-analysis-expansion-plan.md)。

当前已落地的关键扩展是独立深度角色档案、角色配图、升格到正式角色库和诊断模式。后续对话式精读、增量追读或多书对比仍应保持阶段边界：不要把正式小说角色、图片资产、诊断入口或后续研究能力的职责反向塞进基础拆书生成链路。

## 来源文档

- [Prompt Registry 与结构化输出](../prompts/prompt-registry-and-structured-output.md)
- [知识库与上下文组装](../rag/knowledge-and-context-assembly.md)
- [新手优先与整本小说完成原则](../product/beginner-first-novel-completion.md)
- [拆书模块扩展长期方案](../../plans/book-analysis-expansion-plan.md)
