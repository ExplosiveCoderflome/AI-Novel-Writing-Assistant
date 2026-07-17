# 世界上下文门面与小说世界边界

## 背景

世界观模块过去同时通过外部 `World` 绑定、`StoryWorldSlice`、`Bible.worldRules`、`canonicalState.worldState` 和若干旧版扁平字段向生成链提供信息。多源注入会让同一本小说在角色生成、宏观规划、章节生成和修复链路里看到不同的世界约束，最终表现为角色身份脱离世界、章节临时发明规则、世界观参与度偏低。

世界模块重设计的长期方向是拆成两层：外部世界库保存可复用世界样本，小说内部世界保存本书专属世界实例。生成链不应直接读取这两层的内部表结构，而应通过统一门面获取当前任务需要的世界上下文。

## 决策

服务器侧以 `WorldContextGateway` 作为生成链读取世界信息的唯一收敛入口。`NovelWorld` 承载小说世界实例，门面会先确保本书世界副本存在，再通过 `StoryWorldSlice` 裁剪成不同生成目的可用的上下文块。角色、大纲、章节等调用方只依赖门面，不需要感知世界来自外部世界库、本书生成、自定义创建，还是迁移期旧字段初始化。

`NovelWorld` 是小说内部世界实例。它不是外部 `World` 的直接引用，而是从外部世界库导入、由小说主题生成或手动创建后的本书副本。当前迁移期保留 `Novel.worldId` 与 `Novel.storyWorldSliceJson` 旧字段作为兼容来源，但新的世界上下文门面会把旧字段同步进 `NovelWorld`，后续生成链应逐步只读 `NovelWorld`。

当前规则：

- 生成链需要世界信息时调用 `WorldContextGateway.getWorldContextBlock(novelId, { purpose })`。
- `purpose` 必须明确为 `outline`、`character`、`chapter`、`bible` 或 `optimize`，门面按用途格式化同一份世界切片。
- 没有可用世界时返回 `null`，生成链优雅降级，不把缺失世界当成错误。
- `StoryWorldSlice` 构建时必须优先读取 `NovelWorld.structuredDataJson` 与 `NovelWorld.bindingContractJson`。只有小说还没有 `NovelWorld` 时，才允许退回 `Novel.worldId -> World` 这条旧兼容路径。
- 写入 `StoryWorldSlice` 缓存不能刷新 `NovelWorld.updatedAt`。`updatedAt` 表示本书世界内容发生变化，导入、生成、同步等内容变更会更新它；切片缓存写回只更新 `storySliceJson`、`storySliceBuiltAt` 和 `storySliceDigest`。
- `Bible.worldRules` 只作为 Bible 文档内容保留，角色生成的世界权威来源是 `WorldContextGateway`。
- 章节运行时的 `supportingContextText` 必须先注入 `WorldContextGateway` 产出的本书世界块；Bible 文本不能再把 `worldRules` 作为平行世界约束注入。
- `canonicalState.worldState` 是章节连续性记录，只能在没有 `StoryWorldSlice` 时作为保守提示使用，并且文案必须标记为“连续性记录”，不能压过本书世界切片。
- `GenerationContextAssembler` 必须把 `WorldContextGateway.getWorldContextBlock(..., { purpose: "chapter" })` 返回的 `rawSlice` 写入 `contextPackage.storyWorldSlice`，并把 `promptBlock` 放入章节 `supportingContextText`。相关边界由 `generationContextAssembler.test.js` 覆盖。
- 角色生成优先使用 `purpose="character"` 的世界上下文，突出活跃势力、角色身份边界、地点压力和禁止搭配。
- 角色外显资料补全也属于角色生成链路，必须使用 `purpose="character"` 的本书世界上下文，避免服装、身份标志、种族职业外观脱离世界手册。
- 角色阵容方案与补充角色生成必须提供 `useWorldContext` 开关，默认开启。用户关闭时，生成链跳过 `WorldContextGateway`，只根据书级信息、故事模式、已有角色和用户指令生成角色。
- 角色阵容方案可携带 `worldFocusHints`，用于表达用户希望优先贴合的势力，以及是否强制检查身份、能力来源、阵营归属、地点和禁忌搭配。这个提示只能补充 Gateway 输出的本书世界上下文，不能替代或覆盖本书世界规则。
- `NovelWorld.sourceType` 用于区分 `imported`、`generated`、`manual`，不要再只凭 `Novel.worldId` 判断用户当前世界来源。
- 从小说内新建世界（根据本书生成或自定义空白手册）时，系统必须在同一事务内创建外部 `World` 样本，并把 `Novel.worldId` 与 `NovelWorld.sourceWorldId` 绑定到该样本；不再要求用户额外执行“保存到世界库”。创建完成后默认保留双向同步入口，但后续 `push` / `pull` 仍必须由用户手动确认，系统不得自动覆盖任一侧内容。
- 小说内世界 UI 应优先调用 `GET /api/novels/:id/novel-world` 展示当前本书世界来源与状态。
- 从外部世界库导入到小说时调用 `POST /api/novels/:id/novel-world/import`，后端会复制世界结构到 `NovelWorld`，并清空旧的故事切片缓存，等待下一次按本书内容重新裁剪。
- 当用户没有选择外部世界库样本，或希望让系统先给本书搭建舞台时，调用 `POST /api/novels/:id/novel-world/generate`。该流程必须通过注册 PromptAsset `novel.world.generate_from_theme@v1` 生成结构化世界，不允许用固定关键词或题材分支伪造世界。
- 编排层如需在生成链准备阶段创建本书世界，应优先调用 `WorldContextGateway.generateWorldFromNovelTheme(novelId, options)`，不要直接依赖 `NovelWorldInstanceService` 的内部方法。HTTP 路由可以通过应用服务保留现有接口，但生成链和工作流编排的抽象入口应是 Gateway。
- “根据本书主题生成”会同时创建小说内部 `NovelWorld` 和外部 `World` 样本，并把 `NovelWorld.sourceWorldId` 指向该世界样本。`saveToLibrary` 仅为旧请求兼容字段，不能再改变该创建规则。
- 对于没有来源世界的本书世界，用户可以调用 `POST /api/novels/:id/novel-world/save-to-library` 保存为外部世界库样本。保存后 `sourceWorldId` 指向新样本，默认开启双向同步；如果请求设置 `syncEnabled=false`，则只记录来源，不自动提示同步差异。
- 手动同步使用 `GET /api/novels/:id/novel-world/sync-diff` 查看差异，再用 `POST /api/novels/:id/novel-world/sync` 执行 `push` 或 `pull`。同步粒度按结构分区：世界概要、核心规则、阵营、势力、地点、关系网络。
- 只要本书世界有关联的世界库样本，前端就可以读取 `sync-diff` 展示差异摘要；`syncEnabled=false` 只表示不提示自动同步关系，不应阻止用户手动查看差异或重新执行 `push` / `pull`。
- 同步差异摘要要面向用户解释两边实际差在哪里，例如本书世界有哪些规则、势力、地点，世界库样本有哪些对应内容。不要只返回“字段不一致”这类开发者视角描述。
- 用户可以通过 `direction=none` 关闭同步提示。本书世界仍保留 `sourceWorldId` 作为来源记录，但 `syncEnabled=false`、`syncDirection=none`，后续不会自动计算待同步差异；用户仍可手动执行 `push` 或 `pull` 重新开启同步关系。
- `sync-diff` 会把最近一次差异摘要写入 `NovelWorld.syncPendingChangesJson`，用于小说世界卡片展示待处理分区。这个字段只记录“系统发现的待同步差异”，不代表自动同步，也不能作为生成链世界来源。
- 每次用户执行 `push` 或 `pull` 都必须写入 `WorldSyncRecord`。小说世界视图只读取最近几条同步记录作为解释性历史，帮助用户判断本书世界与世界库样本发生过哪些主动同步。

## 边界

`WorldContextGateway` 负责：

- 确保或刷新本书的 `StoryWorldSlice`。
- 将世界切片转换为生成链可直接使用的 `WorldContextBlock`。
- 为自动化编排提供 `generateWorldFromNovelTheme`，在没有本书世界时创建小说内部世界副本。
- 根据调用目的输出不同重点的 `worldRulesText` 与 `worldStageText`。
- 隔离旧版 `World` 扁平字段、未来 `NovelWorld` 实体和调用方之间的依赖。
- 让调用方只看到“本书世界上下文”，不需要知道该上下文来自小说世界副本、旧世界库绑定，还是迁移期切片缓存。

`WorldContextGateway` 不负责：

- 编辑外部世界库。
- 决定用户是否将小说世界同步回世界库。
- 生成地图、势力图谱或世界资产图像。世界资产由 `WorldAsset` 独立承载，Gateway 只提供生成链需要的文本上下文。
- 直接修改角色、章节或 Bible 内容。

准备状态和流程引导可以读取 `NovelWorld` 的轻量状态来判断“世界观基础”“规则边界”是否足够继续规划。这个读取只服务于用户引导和缺口提示，不能替代 `WorldContextGateway` 参与角色、大纲、章节或修复链路的世界上下文组装。

世界模块的产品入口也应保持边界清晰：

- 外部世界库页面是“世界样本库”，用于浏览、生成、整理和维护可复用世界样本。
- 外部世界库页面必须解释样本的使用方式：先在样本库整理通用世界手册，再从小说基础信息页导入为本书世界副本，最后由用户手动决定样本与副本之间的同步。不要让用户误以为外部样本会直接驱动小说内容。
- 外部世界库卡片的主动作应进入世界工作台或世界手册，不应把用户导向其他创作入口。
- 外部世界库中已有世界样本的“查看世界手册”入口必须始终可用。生成向导开关只能控制新建/生成入口，不能隐藏已有世界的查看和管理入口。
- 世界样本创建入口应表现为“创建世界样本”的分步向导：先说明世界，再选择世界骨架，最后确认核心规则。题材、灵感、参考作品、生成偏好、模板骨架和属性勾选都服务于这三步，不应在首屏堆成配置表单。
- 小说需要使用世界时，从小说基础信息页的“本书世界”卡片导入为小说内部 `NovelWorld` 副本。
- “本书世界”卡片应先显示清晰的下一步动作，再让用户选择来源路径或处理同步：没有本书世界时引导选择来源；有本书世界但缺少使用范围时引导整理本书使用范围；有关联样本时可打开来源世界手册；有差异时引导处理同步差异。不要把导入下拉、自定义输入、生成选项、同步和保存动作混在同一层级。
- “本书世界”卡片中的状态文案应围绕本书使用范围、来源副本、手动同步和世界资产准备度表达。不要把卡片写成角色、大纲、章节生产链路说明；生成链只通过 Gateway 低耦合消费世界上下文，不是这个 UI 的主叙事。
- 小说基础信息页的主表单不能再把外部世界样本下拉作为主路径展示。兼容用的 `Novel.worldId` 选择只能放在高级设置里，并明确说明小说实际使用的世界来自“本书世界”卡片。
- 小说基础信息页中“围绕这本书的世界边界”应作为本书世界后的直接工作区展示，不应藏在写法或其他折叠区域里。用户需要能直接看到本书世界如何裁出组织、地点和规则，才能理解世界会怎样进入小说生成。
- 世界工作台首屏应优先展示世界手册、核心规则、主要势力、故事舞台和关键张力；表单式结构编辑、分层草稿、参考资料和导入导出都属于次级入口。
- 世界样本的分层生成结果必须同步投影到 `World.structureJson` 和 `bindingSupportJson`。旧版扁平字段可以作为兼容存储，但世界手册、势力图谱、地图和小说导入都应读取结构化手册；不能出现 `factions/geography/conflicts` 已生成，而结构化手册仍停留在向导占位项的状态。
- 世界工作台的编辑入口应先进入“整理世界手册”，帮助用户围绕核心规则、主要势力、故事舞台和关键张力整理世界。高级字段维护只能作为用户主动打开的高级入口。
- 世界工作台打开后默认页签必须是“整理世界手册”。“查看手册/可视化”是预览入口，不能作为编辑页默认首屏，否则用户会误以为世界模块仍是只读总览或后台字段系统。
- 世界手册编辑器中的输入控件必须附带作者视角的段落标题和故事用途提示，例如“一句话世界印象”“规则总纲”“给故事带来的压力”。不要把裸 `Input`、`textarea` 成组堆叠成字段表单。
- 高级字段维护作为次级入口时，也应按“世界概要 / 规则中心 / 阵营与势力 / 地点与地形 / 关系网络”分区渐进展示；分区按钮不能只是视觉标签，必须实际降低同屏表单密度。
- 高级字段维护的复杂分区应拆成 owned section 组件。阵营与势力由 `workspace/structure/WorldFactionsSection` 承载，关系网络与小说使用建议由 `workspace/structure/WorldRelationsSection` 承载；后续若继续维护地点、规则等高密度分区，也应沿用 section 组件边界。
- 分层草稿作为生成和修订入口时，应以“层级选择 + 当前层编辑器”呈现。保留六层状态总览和一键生成能力，但不要同时展开六个长文本框。
- 素材、参考资料和版本能力属于世界工作台工具箱，应以“工具选择 + 当前工具面板”呈现。地图与图谱资产规划是这个工具箱的默认入口；参考资料、素材库、快照、导出和导入不能同时铺满页面。
- 补齐手册应表现为“补齐世界手册空白”的逐题工作流。左侧展示问题进度，右侧只回答当前问题；不要向用户暴露 priority、target、status 等内部字段。
- 手册体检应先展示检查状态、分数、待处理数量和摘要，再以“问题清单 + 当前问题处理”方式逐条处理；不要把所有问题报告同时展开。
- 空世界或未结构化世界也要展示世界手册骨架，引导用户补齐规则、势力、地点和张力，不能退回普通字段列表作为主要体验。
- 世界手册应展示地图与图谱类资产入口。世界地图、势力图谱、世界时间线和力量体系树可以先作为预留入口出现，并根据地点、势力、规则和张力的完整度提示“可整理”或“待补”。这些入口只表示可视化资产方向，不替代世界手册作为生成链权威来源。

生产状态和整本生产入口判断“世界观资产是否完成”时，应优先识别小说内部 `NovelWorld`。外部 `World` 绑定只能作为兼容来源；没有 `sourceWorldId` 的本书生成世界或自定义世界，也应被视为本书可用世界。

封面和视觉提示词也属于世界体验的一部分。小说封面提示词需要通过 `WorldContextGateway` 读取本书世界摘要、活跃势力和舞台地点，再降级到旧 `Novel.storyWorldSliceJson`；不能只根据外部世界样本或旧切片生成视觉氛围。

`NovelWorldInstanceService` 负责小说世界实例的来源转换：

- `importFromWorldLibrary`：复制外部 `World` 的结构化设定到本书副本。
- `generateFromNovelTheme`：读取小说标题、简介、目标读者、卖点、前 30 章承诺、商业标签、类型和故事模式，调用注册 prompt 生成本书世界副本。
- `generateFromNovelTheme` 和 `createManualNovelWorld` 都会创建外部世界库样本并更新 `Novel.worldId`；创建与绑定必须原子提交，避免生成链读到“本书世界存在但没有来源样本”的半完成状态。
- 每次导入或生成都会清空旧 `StoryWorldSlice` 缓存，后续由切片服务按当前本书世界重新整理进入生成链的设定范围。
- `getSyncDiff` 和 `syncWithLibrary` 只处理本书世界与其来源世界库样本之间的显式同步。它们不参与 LLM 生成上下文组装，也不自动覆盖用户修改。
- `pull` 会把选中的世界库分区写入 `NovelWorld`，并清空旧 `StoryWorldSlice`；`push` 会把选中的本书世界分区写回外部 `World` 并递增世界库版本。

## 读取优先级

门面内部优先级是：

1. 读取当前小说的 `NovelWorld`。
2. 根据 `NovelWorld` 的结构化内容构建或复用 `StoryWorldSlice`。
3. 返回 `WorldContextBlock`。
4. 若没有 `NovelWorld`，迁移期可从旧 `Novel.worldId` 初始化或回退。
5. 若仍无任何可用世界，返回 `null`。

外部世界库与小说世界之间的同步应保持用户手动确认，差异对比和字段级同步由独立 `WorldSyncService` 处理，不应进入生成链门面。

## 世界资产预留

`WorldAsset` 是世界模块面向地图和图谱能力的扩展点。它可以挂在外部 `World` 样本上，也可以挂在小说内部 `NovelWorld` 副本上，两者不能通过自动同步隐式覆盖。后续地图、势力图谱、世界时间线、角色关系网和力量体系树都应写入 `WorldAsset.renderDataJson`，而不是塞回 `World.structureJson` 或 `NovelWorld.storySliceJson`。

小说内世界视图通过 `GET /api/novels/:id/novel-world` 返回 `assets` 摘要。后端会合并本书 `NovelWorld` 资产和来源 `World` 样本资产，并为地图、势力图谱、世界时间线、角色关系网和力量体系树返回标准占位项。同一资产类型存在多条记录时，摘要按更新时间保留最新记录。前端应渲染这个摘要，不应在小说内世界页面自行决定有哪些资产类型或把资产状态硬编码成固定文案。

外部世界样本工作台也应展示地图与图谱类资产规划，但在没有后端资产摘要 API 前，可以只展示固定预留入口和整理前置条件。这个入口用于帮助作者理解“世界手册可以沉淀成哪些可视化资产”，不能替代 `WorldAsset` 的正式资产列表，也不能成为生成链权威来源。

当前资产类型约定：

- `map`：世界地图，承载区域、连通关系、势力控制区、故事发生地和冲突热度。
- `faction_diagram`：势力图谱，承载势力节点、盟友/敌对/附庸/竞争关系和力量对比。
- `timeline`：世界时间线，承载历史事件、当前局势和后续变化。
- `character_network`：角色关系图，承载人物、阵营归属和关系张力。
- `power_system_tree`：力量体系树，承载等级、资源、代价、禁忌和突破边界。

这些资产是展示和编辑资产，不是生成链权威来源。章节、角色、大纲等 LLM 调用仍然通过 `WorldContextGateway` 读取本书世界切片；资产后续若要参与生成，也应先被汇总进 `NovelWorld` 或 `StoryWorldSlice`，再由 Gateway 输出。

## 当前迁移期 API

- `GET /api/novels/:id/novel-world`：返回本书是否已有小说世界实例、来源类型、来源世界 ID、同步状态、最近同步时间、待同步分区、最近同步记录、是否已有结构化数据和 Story Slice。
- `GET /api/novels/:id/novel-world` 同时返回轻量 `handbook` 投影，用于前端展示“世界手册”：世界概要、核心设定、主要势力、本书舞台和关键张力。这个投影来自 `NovelWorld.structuredDataJson`，不应让前端直接解析内部结构字段。
- `handbook.generationGuidance` 是面向用户解释的投影，用于说明本书世界能提供哪些角色身份边界、故事范围线索、场景规则约束和越界检查依据。它只解释现有结构化世界，不是新的生成链上下文来源；真正进入 LLM 的文本仍由 `WorldContextGateway` 输出。
- `GET /api/novels/:id/novel-world` 同时返回 `assets` 摘要，用于展示世界地图、势力图谱、世界时间线、角色关系网和力量体系树等入口。没有已生成资产时，后端返回占位状态，前端只负责展示。
- `POST /api/novels/:id/novel-world/import`：从外部世界库导入一个世界为本书副本。导入后 `Novel.worldId` 仍会同步更新以兼容旧模块，但新的权威副本是 `NovelWorld`。
- `POST /api/novels/:id/novel-world/manual`：创建最小结构化世界手册，并同时保存为外部世界库样本、绑定回本书，随后等待用户补充规则、势力和故事舞台。
- `POST /api/novels/:id/novel-world/generate`：根据小说主题生成本书世界副本，并同时创建、绑定外部世界库样本。兼容请求中的 `saveToLibrary` 字段会被接受，但不会关闭自动建库。
- `POST /api/novels/:id/novel-world/save-to-library`：把没有来源样本的本书世界保存成外部世界库样本，并把本书世界重新关联到该样本。
- `GET /api/novels/:id/novel-world/sync-diff`：比较本书世界副本和来源世界库样本，返回可展示的分区差异。
- `POST /api/novels/:id/novel-world/sync`：由用户指定 `direction=push|pull` 和可选分区列表后执行同步。
- `GET /api/novels/:id/world-slice` 与相关刷新接口暂时保留，用于查看和刷新实际进入生成链的 `StoryWorldSlice`。

后续 UI 不应再把“绑定世界观”作为单一下拉概念，而应展示三入口：从世界库导入、根据小说主题生成、自定义本书世界。当前三入口都收敛到 `NovelWorld` 副本，生成链继续只通过 `WorldContextGateway` 读取世界上下文。

小说工作台基础信息页使用“本书世界”卡片作为世界入口。它展示小说世界副本是否存在、来源类型、同步状态和可用切片状态，并提供“选择世界来源”“整理本书使用范围”“打开来源世界手册”“同步管理”“保存为世界样本”等主动作。基础信息高级设置里的参考世界样本只用于初始化参考和迁移期默认值，不能被展示成小说实际使用世界的主路径。

前端组件边界：

- `NovelWorldManagerCard` 只负责本书世界总览、世界手册投影、世界资产入口、同步状态和同步管理。
- 本书世界来源选择、从样本库导入、根据本书生成、自定义空白手册属于 `novelWorld/NovelWorldSourcePanel`，避免主卡片继续膨胀成多流程混合组件。
- 后续新增“地图生成”“势力图谱生成”等资产动作时，应优先放入世界资产子组件或独立资产面板，不要继续塞进 `NovelWorldManagerCard` 顶层。

## 相关模块

- `server/src/services/novel/worldContext/WorldContextGateway.ts`
- `server/src/services/novel/worldContext/NovelWorldInstanceService.ts`
- `server/src/services/novel/storyWorldSlice/NovelWorldSliceService.ts`
- `server/src/modules/novel/setup/http/novelWorldSliceRoutes.ts`
- `client/src/pages/novels/components/NovelWorldManagerCard.tsx`
- `client/src/pages/novels/hooks/useNovelWorldSlice.ts`
- `server/src/services/novel/characterPrep/CharacterPreparationService.ts`
- `server/src/services/novel/characterPrep/characterCastGeneration.ts`
- `server/src/services/novel/characterPrep/characterPreparationSupplemental.ts`
