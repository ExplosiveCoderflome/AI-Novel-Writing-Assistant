# 拆书工作流

## 背景

拆书模块的目标不是把一本书拆成若干长篇评论，而是帮助写作新手把参考作品转成可复用的创作认知：作品定位、主线结构、人物系统、世界设定、主题表达、写法技法和商业卖点。由于拆书输入通常是长文本，LLM 成本会随书籍体量、原文片段数和启用小节数明显上升；如果 UI 不先解释范围和成本，用户容易在不了解代价的情况下启动大型任务。

拆书结果还会进入知识库、写法资产或创作中枢引用链路，因此它必须同时满足两类需求：用户能直接读懂，后续系统也能稳定检索和复用。

## 决策

拆书默认采用“范围预设 + 成本可见 + 分小节生成 + 结构化关键结论”的工作流。用户先选择分析范围，再启动任务；系统根据文档版本体量提示预计片段数和模型调用规模；每个小节既生成可读 Markdown，也生成固定字段的 `structuredData`，用于 UI 摘要、发布、导出和后续 RAG 召回。

Prompt 合同、结构化后处理和 UI / 导出字段标签必须共享同一份字段规格，避免 Prompt 让模型输出一套字段、服务归一化消费另一套字段、前端再展示第三套字段。

## 当前规则

- 拆书入口必须让用户看到任务成本与文档体量关系，至少提示字数、预计原文片段数和大致模型调用规模。
- 拆书范围用预设降低新手决策压力：
  - `快速拆书`：适合先低成本看作品是否值得深拆。
  - `标准拆书`：适合大多数网文参考分析，是默认推荐范围。
  - `完整拆书`：适合深度复盘或需要时间线的小节。
- 预设卡片应展示会生成哪些小节，不能只显示数量；新手需要先知道这次会得到什么结果，再决定是否承担对应成本。
- `overview` 是拆书最小必备小节。即使用户选择较轻范围，也应保留总览，保证结果有作品定位和整体判断。
- 知识文档版本可以按章节缓存为 `DocumentChapter`。章节切分应优先使用确定性中文章节标题规则；规则无法可靠切分时可以调用已注册 Prompt 做 LLM fallback；LLM 仍失败时回退为整文单章，保证旧文档和非小说文档也能继续使用。
- `DocumentChapter` 以 `KnowledgeDocumentVersion` 为边界缓存，记录 `chapterIndex`、标题、原文起止 offset、字数和可选摘要；它不直接依附 `BookAnalysis`，同一源版本的多个拆书可以复用章节缓存。
- 全量拆书生成应采用 `overview -> 其他小节并发` 的两阶段链路：如果启用了 `overview`，先生成总览并提炼 `BookAnalysisOverviewContext`，再把整本定位、题材、卖点、目标读者、优势和短板作为后续小节的口径锚点。若 `overview` 失败，后续小节必须以 `null` context 继续生成；若用户在 overview 后请求取消，必须在进入后续并发前停止。
- 单节重跑非 `overview` 小节时，应读取当前已保存的 `overview` 正文和结构化数据，重新组装 `BookAnalysisOverviewContext` 传入该小节 Prompt；如果历史拆书没有可用总览，则降级为 `null` context 继续生成。
- 两阶段切换必须保留运行心跳和取消检查，进度从 notes 阶段结束点单调推进到 overview 再到其余小节，避免 UI 看到进度回退。
- 拆书支持用户介入但不改变证据边界：`BookAnalysis.userFocusInstruction` 是本次拆书的全局关注点，应进入所有 section prompt；`BookAnalysisSection.focusInstruction` 是单节关注点，只进入对应 section prompt。两类指令只能影响筛选和表达优先级，不能覆盖 evidence grounding、固定 structuredData schema 或当前小节职责。
- 未启用的小节应作为冻结小节保留在任务结构中，而不是从产品模型里消失；这样后续可以局部补充，不破坏分析列表和发布逻辑。
- 每个拆书小节的 Prompt 输入应只携带与该小节有关的 notes 字段。筛不到相关信号时才回退全量 notes，避免为了生成一个小节重复灌入整本分析笔记。
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
- 深度角色档案的场景表现本期使用 `sceneLabel` 字符串承载，不接入正式场景实体；弧线节点可以引用 `chapterIndex`，但没有章节判断依据时应留空而不是猜测。
- 角色档案 Prompt 必须走 Prompt Registry，服务层只能调用注册资产和结构化输出 schema，不得在角色服务里内联业务 prompt。
- 拆书角色配图使用独立的 `book_analysis_character` 图片场景类型，图片任务和图片资产必须归属到 `BookAnalysisCharacter`，不能复用正式角色库的 `character` owner。
- 拆书角色生图入口应放在深度角色档案卡片内，并沿用图片模块的确认式提示词、任务轮询、主图、删除和排序规则；基础全量拆书不自动触发角色生图。
- 拆书角色升格到正式角色库必须由用户显式触发。初版只复制共享人物字段，并默认允许携带当前主图；携带主图时应克隆为新的 `BaseCharacter` 图片资产，不能让正式角色引用拆书角色原资产。
- 拆书角色与升格后的正式角色不做双向同步。删除或修改拆书角色图片不应影响已升格角色；正式角色后续编辑也不回写拆书档案。
- 诊断模式只改变入口和展示文案，不 fork 拆书核心生成链路。用户选择自己的小说后，系统应把当前章节正文导出为 `KnowledgeDocument`，再用现有 `createAnalysis(documentId)` 链路创建拆书。
- 诊断模式的源文档应优先使用小说正文 TXT 导出，而不是包含设定、任务日志和质量报告的完整项目导出；这样节奏、人物、伏笔等结论基于稿件正文，而不是混入生产过程材料。
- 诊断模式不得修改原小说正文，也不得把诊断结果自动写回规划、角色或章节。后续改稿仍应由用户显式触发相应写作/修复链路。
- 发布到知识库或导出 Markdown 时，应优先包含“关键结论”摘要，再输出长文分析；这样后续 RAG 更容易召回可操作结论，而不是只召回大段评论。
- 同一拆书重复发布到同一本小说知识库时，应替换该拆书来源的旧绑定，只让最新发布版进入小说 RAG 绑定集合；旧发布文档本体不级联删除，避免破坏其他引用或历史审计。
- 拆书 UI 应先展示结构化关键结论，再展示完整 Markdown。新手先看结论判断价值，需要细节时再读长文。
- 拆书结果查看应采用阅读优先结构：主要小节使用 Tab 切换展示，默认只显示当前小节，避免所有小节上下堆叠；关键结论是默认可见内容；正文可通过“重点速览 / 完整阅读”切换控制展开密度；复制、重建、导出、生成写法和归档等任务操作应进入顶部 sticky 工具栏；编辑、AI 优化和备注应折叠到用户需要时再展开；证据应按小节内嵌为字段 chip，点击后在当前小节查看摘录和原文定位，避免扫读时被全局长面板打断。
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
- 总览之后的小节口径不一致：检查 `overview` 是否先于其他小节生成、`BookAnalysisOverviewContext` 是否传入后续 section prompt，以及 overview 失败时是否按预期降级为 `null` context。
- 小节内容泛泛：检查该 section 的 notes 是否缺少相关信号；如果缺少，应回到 source note 抽取 prompt 或文档分段策略，而不是让小节 writer 自行虚构。
- 结构化摘要为空：检查 Prompt 固定结构示例、`BOOK_ANALYSIS_STRUCTURED_FIELD_SPECS`、后处理归一和测试 fixture 是否一致。
- 结构化结论被静默截断：检查生成结果是否写入 `normalizationWarningsJson`，序列化是否返回 `normalizationWarnings`，以及前端是否在关键结论区展示对应字段名。
- 历史时间线不显示：检查旧字符串数组是否经过 timeline node wrapper；UI、导出和续写引用都应容忍 `{ label }` 单字段节点。
- 关键结论无法溯源：检查 section evidence 是否带有合法 `fieldKey`，数组项是否按 0-based `fieldIndex` 指向对应结构化条目；如果绑定为空但证据存在，优先检查模型输出是否使用了非当前小节字段名。
- 深度角色档案成本异常：检查是否把角色生成接入了全量拆书链路；角色档案应只由用户在角色面板主动触发，不能在 `runFullAnalysis` 中自动调用。
- 角色档案内容脱离原文：检查角色生成 Prompt 是否只使用 source notes 和 `character_system` 上下文，证据摘录是否来自可用材料；如果缺少依据，应降低结论确定性或留空，不应补写原文外事实。
- 拆书角色图片串到正式角色图片：检查 `ImageSceneType`、任务 owner 和资产 owner 是否使用 `book_analysis_character` 与 `bookAnalysisCharacterId`；只有用户执行升格并选择携带主图时，才应复制为新的正式角色图片资产。
- 升格后图片互相影响：检查升格流程是否克隆图片文件和 `ImageAsset` 记录，不能只把同一个 asset 改 owner 或让两个角色共享同一条图片记录。
- 诊断模式误改原稿：检查 Novel 导出是否只创建知识文档和拆书分析，不应调用章节更新、修复、自动导演或角色写回接口。
- 诊断结论混入过程材料：检查诊断导出的 Document 内容是否来自章节正文 TXT，而不是完整 Markdown/JSON 项目包。
- 发布到知识库后召回效果差：检查导出 Markdown 是否包含“关键结论”，以及知识库索引是否使用最新发布内容。
- 重复发布后召回旧拆书：检查 `KnowledgeBinding.sourceAnalysisId` 是否写入当前拆书 ID，以及同一小说下该拆书旧绑定是否被解绑；不要删除知识文档本体来解决绑定污染。
- UI 决策负担重：检查是否把高级选项放在默认入口，是否缺少推荐预设，是否没有说明 token 消耗与书籍体量的关系。
- 查看结果不方便：检查主要小节是否仍然上下堆叠而不是用 Tab 切换，是否没有速览 / 完整阅读切换，任务操作是否没有进入顶部 sticky 工具栏，证据是否仍在全局长面板里而不是随小节内嵌。
- 切换文档后列表混乱：检查前端列表请求是否传入 `documentId`，以及后端 `listAnalyses` 是否按文档过滤。

## 相关模块

- `client/src/pages/bookAnalysis/`
- `server/src/routes/bookAnalysis.ts`
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
