Phase 1：数据库层
# Phase 1 - Prisma Schema + 数据库初始化

基于以下要求，完善 server/ 下的 Prisma Schema 并生成迁移：

## 数据模型要求

去掉所有多用户鉴权字段（无 userId 外键），这是私有化部署应用。

### 保留并调整的模型：

model Novel {
  id               String    @id @default(cuid())
  title            String
  description      String?
  status           String    @default("draft")  // draft / published
  outline          String?   // 发展走向（纯文本）
  structuredOutline String?  // 结构化大纲（JSON string）
  genreId          String?
  genre            NovelGenre? @relation(fields: [genreId], references: [id])
  chapters         Chapter[]
  characters       Character[]
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}

model Chapter {
  id        String   @id @default(cuid())
  title     String
  content   String?  @default("")
  order     Int
  novelId   String
  novel     Novel    @relation(fields: [novelId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Character {
  id              String   @id @default(cuid())
  name            String
  role            String   // 主角/反派/配角
  personality     String?
  background      String?
  development     String?
  novelId         String
  novel           Novel    @relation(fields: [novelId], references: [id], onDelete: Cascade)
  baseCharacterId String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model BaseCharacter {
  id          String   @id @default(cuid())
  name        String
  role        String
  personality String
  background  String
  development String
  appearance  String?
  weaknesses  String?
  interests   String?
  keyEvents   String?
  tags        String   @default("")
  category    String   // 主角/反派/配角/工具人
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model NovelGenre {
  id          String       @id @default(cuid())
  name        String
  description String?
  template    String?
  parentId    String?
  parent      NovelGenre?  @relation("GenreChildren", fields: [parentId], references: [id])
  children    NovelGenre[] @relation("GenreChildren")
  novels      Novel[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

model World {
  id           String   @id @default(cuid())
  name         String
  description  String?
  background   String?
  geography    String?
  cultures     String?
  magicSystem  String?
  politics     String?
  races        String?
  religions    String?
  technology   String?
  conflicts    String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model WorldPropertyLibrary {
  id          String   @id @default(cuid())
  name        String
  description String?
  category    String
  worldType   String?
  usageCount  Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model WritingFormula {
  id                 String   @id @default(cuid())
  name               String
  sourceText         String?
  content            String?
  genre              String?
  style              String?
  toneVoice          String?
  structure          String?
  pacing             String?
  paragraphPattern   String?
  sentenceStructure  String?
  vocabularyLevel    String?
  rhetoricalDevices  String?
  narrativeMode      String?
  perspectivePoint   String?
  characterVoice     String?
  themes             String?
  motifs             String?
  emotionalTone      String?
  uniqueFeatures     String?
  formulaDescription String?
  formulaSteps       String?
  applicationTips    String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}

model TitleLibrary {
  id          String   @id @default(cuid())
  title       String
  description String?
  clickRate   Float?
  keywords    String?
  genreId     String?
  usedCount   Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model APIKey {
  id        String   @id @default(cuid())
  provider  String   // deepseek / openai / siliconflow / anthropic
  key       String
  model     String?
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([provider])
}

## 任务
1. 写入完整的 schema.prisma
2. 运行 prisma migrate dev --name init
3. 创建 server/src/db/prisma.ts（Prisma Client 单例）
4. 创建 server/src/db/seed.ts（插入几条基础小说类型数据作为初始数据）

Phase 2：LLM 基础设施
# Phase 2 - LLM Factory + SSE 流式工具

## 任务 1：LLM Factory（server/src/llm/factory.ts）

实现一个 getLLM 工厂函数，满足：

- 支持 provider：deepseek / openai / siliconflow / anthropic
- 所有 provider 统一使用 @langchain/openai 的 ChatOpenAI，通过 configuration.baseURL 适配
- deepseek baseURL: https://api.deepseek.com/v1，默认 model: deepseek-chat
- siliconflow baseURL: https://api.siliconflow.cn/v1，默认 model: Qwen/Qwen2.5-7B-Instruct
- openai baseURL: https://api.openai.com/v1，默认 model: gpt-4o-mini
- anthropic 暂用 OpenAI 兼容接口预留，默认 baseURL 可配置
- API Key 优先从数据库 APIKey 表读取（按 provider 查），fallback 到 .env 变量
- 导出：getLLM(provider, options?) => ChatOpenAI

## 任务 2：Provider 配置（server/src/llm/providers.ts）

导出 PROVIDERS 配置对象和 SUPPORTED_PROVIDERS 数组：
interface ProviderConfig {
  name: string
  baseURL: string
  defaultModel: string
  models: string[]
  envKey: string  // 对应的环境变量名
}

deepseek 的 models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner']
siliconflow 的 models: ['Qwen/Qwen2.5-7B-Instruct', 'Qwen/Qwen2.5-72B-Instruct', 'deepseek-ai/DeepSeek-V3']
openai 的 models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']

## 任务 3：SSE 流式工具（server/src/llm/streaming.ts）

实现以下工具函数：

// 将 LangChain stream 转为 SSE 响应
async function streamToSSE(
  res: Response,
  stream: AsyncIterable<BaseMessageChunk>,
  onDone?: (fullContent: string) => void
): Promise<void>

规范：
- 设置响应头：Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive
- 每个 chunk 写入：data: {"type":"chunk","content":"..."}\n\n
- 完成时写入：data: {"type":"done","fullContent":"..."}\n\n
- 出错时写入：data: {"type":"error","error":"..."}\n\n
- 每 15 秒发送心跳：data: {"type":"ping"}\n\n
- 支持客户端断连检测（res.writableEnded）

## 任务 4：路由挂载 /api/llm/providers 和 /api/llm/test

GET /api/llm/providers → 返回 PROVIDERS 配置（不含 API Key 值）
POST /api/llm/test → body: {provider, apiKey?} → 发送测试消息验证连通性，返回 {success, model, latency}


Phase 3：小说核心 API

# Phase 3 - 小说管理 + AI 生成 API

实现 server/src/routes/novel.ts 和 server/src/services/novel/ 下的完整小说 CRUD 和 AI 生成接口。

## REST 接口（基础 CRUD）

GET    /api/novels              → 小说列表（含分页，page/limit 查询参数）
POST   /api/novels              → 创建小说（body: {title, description, genreId}）
GET    /api/novels/:id          → 小说详情（含 chapters 和 characters）
PUT    /api/novels/:id          → 更新小说基本信息
DELETE /api/novels/:id          → 删除小说（级联删除章节和角色）

GET    /api/novels/:id/chapters              → 章节列表（按 order 排序）
POST   /api/novels/:id/chapters             → 新建章节
PUT    /api/novels/:id/chapters/:chapterId  → 更新章节
DELETE /api/novels/:id/chapters/:chapterId  → 删除章节

GET    /api/novels/:id/characters           → 角色列表
POST   /api/novels/:id/characters           → 新建角色
PUT    /api/novels/:id/characters/:charId   → 更新角色
DELETE /api/novels/:id/characters/:charId   → 删除角色

## AI 生成接口（SSE 流式）

### POST /api/novels/:id/outline/generate
生成小说发展走向（SSE 流式）

System Prompt：
你是一位专业的小说发展走向策划师。请根据以下信息梳理一个完整的小说发展走向：
要求：
- 明确故事核心主题与立意
- 人物成长轨迹（主角从起点到终点的变化）
- 主要矛盾的起承转合（3-5个核心冲突节点）
- 关键转折点（至少3个）和最终高潮
- 故事节奏（起→铺垫→爆发→回落→升华）
- 尾声与主题升华

Body: { provider?, model?, temperature? }
Response: SSE stream，完成后保存到 novel.outline

### POST /api/novels/:id/structured-outline/generate
生成结构化大纲（SSE 流式）

基于已有的 outline，生成 JSON 格式的结构化大纲。
输出格式（JSON array，包裹在 
[
  {
    "volumeTitle": "第一卷：xxx",
    "chapters": [
      { "order": 1, "title": "xxx", "summary": "100字左右的章节简介" }
    ]
  }
]

章节数量根据小说体量建议（短篇10-20章，中篇30-50章，长篇100+章），
默认生成第一卷的前20章规划。

Body: { totalChapters?, provider?, model? }
Response: SSE stream，完成后将解析后的 JSON 保存到 novel.structuredOutline

### POST /api/novels/:id/chapters/:chapterId/generate
生成单章节内容（SSE 流式）

System Prompt：
你是一位优秀的小说内容创作者。请根据提供的信息，创作一章高质量的小说内容。

要求：
- 严格按照章节简介展开，不偏离主线
- 场景描写生动，注意环境烘托氛围
- 对话自然，体现人物性格
- 保持与前文情节的连贯性
- 字数控制在2000-3000字

Body: { provider?, model?, previousChaptersSummary?: string[] }
Response: SSE stream，完成后保存到 chapter.content

### POST /api/novels/:id/title/generate
生成爆款标题建议（非流式）

System Prompt：
你是一个具备平台流量预测能力的网文标题 AI 专家。
根据小说类型和简介，生成10个候选标题。

生成规则：
- 5个"文学性"标题（含意境词：纪元/命途/诡境/执念/裂变等）
- 5个"冲突前置"标题（首5字出现核心爆点，适合番茄/七猫平台）
- 每个标题附带预测点击率（60-95之间，根据标题质量评估）
- 避免重复词汇，结构多样（主谓/偏正/并列/问句）

返回 JSON：{"titles": [{"title": "...", "clickRate": 85, "style": "literary/conflict"}]}

## Zod 验证 Schema

为所有 POST/PUT 请求定义 Zod schema 并通过 validate 中间件校验。

Phase 4：世界观 + 写作公式 API

# Phase 4 - 世界观生成 + 写作公式 API

## 世界观接口（server/src/routes/world.ts）

GET    /api/worlds              → 世界观列表
POST   /api/worlds              → 创建世界观
GET    /api/worlds/:id          → 世界观详情
PUT    /api/worlds/:id          → 更新世界观
DELETE /api/worlds/:id          → 删除世界观

### POST /api/worlds/generate（SSE 流式）

五维度世界观生成器。

Body:
{
  name: string
  description: string
  worldType: string         // 东方玄幻/西方魔幻/现代都市/科幻/历史/末日
  complexity: 'simple' | 'standard' | 'detailed'
  dimensions: {
    geography: boolean      // 地理环境
    culture: boolean        // 文化社会
    magicSystem: boolean    // 魔法/力量体系
    technology: boolean     // 科技水平
    history: boolean        // 历史与冲突
  }
  provider?: string
  model?: string
}

System Prompt（根据勾选维度动态拼接）：
你是一位专业的奇幻世界设定设计师，擅长构建沉浸式、自洽的小说世界。

请为以下世界生成详细设定，严格按 JSON 格式输出：
世界名称：{name}
世界类型：{worldType}
世界描述：{description}
复杂度：{complexity}

[动态添加维度要求]
geography 维度要求：地形地貌（山脉/平原/海洋分布）、气候带、标志性地点（5个以上）、空间结构（大陆/国家/城市层级）
culture 维度要求：主要种族/势力（3-5个）、核心文化习俗、宗教信仰体系、政治权力结构
magicSystem 维度要求：力量来源与本质、修炼/晋级体系（至少5个层级）、施法者稀缺度、核心限制条件
technology 维度要求：整体科技水平（对标现实朝代）、标志性发明或技术、科技对社会的影响
history 维度要求：世界起源传说、3个以上重大历史事件（含时间线）、当前主要矛盾与潜在冲突

输出 JSON 格式：
{
  "geography": "...",
  "cultures": "...",
  "magicSystem": "...",
  "technology": "...",
  "conflicts": "..."
}

### POST /api/worlds/:id/refine（SSE 流式）
精炼单个世界属性维度
Body: { attribute: 'geography'|'cultures'|..., currentValue: string, refinementLevel: 'light'|'deep' }

## 写作公式接口（server/src/routes/writingFormula.ts）

GET    /api/writing-formula              → 公式列表
GET    /api/writing-formula/:id          → 公式详情
DELETE /api/writing-formula/:id          → 删除公式

### POST /api/writing-formula/extract（SSE 流式）

从源文本中提取写作公式。

Body:
{
  name: string
  sourceText: string
  extractLevel: 'basic' | 'standard' | 'deep'
  focusAreas: string[]    // ['style', 'structure', 'pacing', 'rhetoric', 'narrative']
  provider?: string
  model?: string
}

System Prompt：
你是一个专业的写作风格分析专家，能够深度解析文学作品的创作技巧。

请对以下文本进行{extractLevel}级别的写作公式分析，重点关注：{focusAreas}

分析维度：
- 语言风格与基调（正式/口语/诗意/克制/热烈）
- 句式结构偏好（长句/短句/混合，典型句式模板）
- 修辞手法（比喻/拟人/排比/对比，使用频率和场景）
- 叙事视角与距离（第一/三人称，心理距离远近）
- 情感表达方式（直白/隐晦，内心独白比例）
- 节奏控制（快节奏动作/慢节奏铺垫的切换规律）
- 词汇选择（高频词汇、词汇偏好、语域特征）
- 意象与意境（常用意象，营造氛围的手法）

输出格式（Markdown）：
## 整体风格定位
## 核心写作技巧（含原文例句）
## 可复现的写作公式
## 应用指南（如何用这个公式写新文本）

完成后提取结构化字段保存到数据库（name/style/structure/pacing等）

### POST /api/writing-formula/apply（SSE 流式）

应用写作公式到文本。

Body:
{
  formulaId?: string        // 使用已保存的公式
  formulaContent?: string   // 或直接传公式内容
  mode: 'rewrite' | 'generate'
  sourceText?: string       // rewrite 模式：原文
  topic?: string            // generate 模式：主题/想法
  targetLength?: number     // 目标字数
  provider?: string
  model?: string
}

rewrite 模式 System Prompt：
你是一位专业的写作助手。请严格按照以下写作公式，对给定文本进行改写。
要求：保持原文核心意思不变，但文风、节奏、句式完全按照公式风格重塑。

generate 模式 System Prompt：
你是一位专业的写作助手。请严格按照以下写作公式，围绕给定主题创作新内容。
要求：字数控制在{targetLength}字左右，每个段落都体现公式的核心特征。

Phase 5：AI 对话 + 角色库

# Phase 5 - AI 对话 API + 基础角色库

## 对话接口（server/src/routes/chat.ts）

### POST /api/chat（SSE 流式）

主对话接口，支持多轮上下文。

Body:
{
  messages: Array<{role: 'user'|'assistant'|'system', content: string}>
  systemPrompt?: string
  agentMode?: boolean
  provider?: string
  model?: string
  temperature?: number
  maxTokens?: number
  enableSearch?: boolean    // 是否启用联网搜索（预留，当前返回提示）
}

默认 System Prompt（当 systemPrompt 未传时使用）：
你是一位专业的小说创作助手，擅长帮助作者进行小说创作、世界设定、角色设计等工作。
- 使用 Markdown 格式组织回答
- 提供具体、可操作的创作建议
- 结合文学理论与商业写作实践
- 擅长领域：写作技巧/情节构思/角色设计/世界观构建/文风建议/创作瓶颈突破

agentMode 追加内容：
作为智能创作代理，你需要：
- 主动分析用户需求背后的深层问题
- 提供多个解决方案并分析各自优劣
- 给出具体的下一步行动建议
- 在必要时主动提问以获取更多信息

实现要求：
- 使用 ChatOpenAI.stream() 流式响应
- 上下文窗口限制：最多传入最近 20 条消息
- 支持 DeepSeek Reasoner 特殊处理：识别 reasoning_content 字段，作为单独的 SSE 事件推送
  data: {"type":"reasoning","content":"..."}\n\n

### GET /api/chat/history（可选）
说明：对话历史由前端存储在 IndexedDB，此接口预留但可先返回空数组

## 基础角色库接口（server/src/routes/character.ts）

GET    /api/base-characters                  → 角色列表（支持 category/tags/search 查询）
POST   /api/base-characters                  → 创建角色
GET    /api/base-characters/:id              → 角色详情
PUT    /api/base-characters/:id              → 更新角色
DELETE /api/base-characters/:id              → 删除角色

### POST /api/base-characters/generate（非流式）

AI 生成角色设定。

Body:
{
  description: string     // 角色大致描述
  category: string        // 主角/反派/配角
  genre?: string          // 小说类型（影响角色风格）
  provider?: string
  model?: string
}

System Prompt：
你是一位专业的小说角色设计师。请根据以下描述，生成一个完整的角色设定。

输出 JSON 格式：
{
  "name": "角色名（符合小说类型风格）",
  "role": "主角/反派/配角",
  "personality": "性格特征（200字，包含核心性格、优点、缺点、行为模式）",
  "background": "背景故事（300字，包含出身、成长经历、关键转折事件）",
  "development": "成长轨迹（200字，预设角色在故事中的变化方向）",
  "appearance": "外貌描写（150字，有辨识度的特征）",
  "weaknesses": "核心弱点（3-5条，用于制造戏剧冲突）",
  "interests": "兴趣爱好与特长",
  "keyEvents": "可能经历的关键事件（3-5个剧情触发点）",
  "tags": "标签（逗号分隔，如：腹黑,天才,复仇）"
}

Phase 6：LangGraph 工作流

# Phase 6 - LangGraph 核心工作流实现

实现 server/src/graphs/ 下的 LangGraph 工作流，用于替代简单的单次调用，
实现可复用、可调试的 AI 生成流程。

## 图 1：小说大纲生成图（novelOutlineGraph.ts）

状态定义：
{
  novelTitle: string
  novelDescription: string
  genre: string
  characters: string[]
  
  // 中间状态
  themeAnalysis: string      // 主题分析结果
  conflictDesign: string     // 冲突设计结果
  
  // 最终输出
  outline: string            // 完整发展走向
  structuredOutline: object  // 结构化大纲 JSON
  
  // 控制
  provider: string
  model: string
  error?: string
}

节点：
1. analyzeTheme：分析小说主题和核心立意
2. designConflicts：基于主题设计矛盾冲突节点
3. generateOutline：综合前两步生成完整发展走向
4. structureOutline：将大纲结构化为章节列表 JSON

边：analyzeTheme → designConflicts → generateOutline → structureOutline

提供：
- 普通调用：graph.invoke(input)
- 流式调用：graph.streamEvents(input, {version:"v2"}) 过滤 on_llm_stream 事件
- 导出编译后的 novelOutlineGraph

## 图 2：章节写作图（chapterWritingGraph.ts）

状态定义：
{
  novelContext: string       // 小说基本信息
  chapterTitle: string
  chapterSummary: string
  previousSummaries: string[] // 前几章摘要
  
  // 中间状态
  scenePlan: string          // 场景规划
  dialoguePoints: string     // 关键对话点
  
  // 输出
  chapterContent: string     // 完整章节内容
  chapterSummaryGenerated: string  // 自动生成的本章摘要（供后续章节使用）
}

节点：
1. planScene：规划章节场景结构（开头/中段/结尾）
2. generateContent：基于场景规划生成章节全文
3. summarizeChapter：生成本章节100字摘要（供后续章节上下文使用）

边：planScene → generateContent → summarizeChapter

## 图 3：写作公式提取图（writingFormulaGraph.ts）

状态定义：
{
  sourceText: string
  extractLevel: string
  focusAreas: string[]
  
  // 中间状态
  styleAnalysis: string      // 风格分析
  techniqueExtraction: string // 技巧提取
  
  // 输出
  formulaMarkdown: string    // Markdown 格式的完整公式
  formulaStructured: object  // 结构化字段（用于数据库存储）
}

节点：
1. analyzeStyle：深度分析语言风格
2. extractTechniques：提取可复现的写作技巧
3. buildFormula：整合成完整写作公式文档
4. structureFormula：将公式解析为结构化数据库字段

边：analyzeStyle → extractTechniques → buildFormula → structureFormula

## 通用要求

- 每个图都提供 createXxxGraph(llm: BaseChatModel) 工厂函数
- 所有节点函数添加 try-catch，错误写入 state.error
- 条件边：如果 state.error 存在，跳转到 END
- 导出类型：XxxGraphState / XxxGraphInput / XxxGraphOutput
- 在 server/src/services/ 对应服务中调用图，封装流式响应逻辑

Phase 7：前端核心页面

# Phase 7 - 前端核心页面实现

实现以下页面，UI 风格使用 Shadcn/UI + TailwindCSS，保持与参考项目一致的现代深色/浅色风格。

## 页面 1：小说列表页（/novels）

展示所有小说的卡片列表：
- 每张卡片：标题/简介/类型/状态标签（草稿/已发布）/章节数/创建时间/操作按钮（编辑/删除）
- 右上角"创建新小说"按钮（弹出 Dialog 填写标题/简介/类型）
- 状态筛选（全部/草稿/已发布）
- 空状态引导（无小说时显示引导创建）

## 页面 2：小说编辑页（/novels/:id/edit）

Tabs 布局（4个 Tab）：

Tab 1 - 基本信息：
- 标题/简介/类型编辑
- 状态切换

Tab 2 - 发展走向：
- 右上角：LLMSelector 组件
- "生成发展走向"按钮 → 调用 SSE 流式接口
- StreamOutput 组件展示流式内容
- 内容可直接编辑（Textarea）
- "保存"按钮

Tab 3 - 章节大纲：
- "生成结构化大纲"按钮（基于发展走向）
- 树形展示：卷 → 章节列表
- 每个章节显示序号/标题/简介
- "批量创建章节"按钮（将大纲章节写入数据库）

Tab 4 - 章节管理：
- 章节列表（可拖拽排序）
- 每章：标题/字数/操作（编辑/生成内容/删除）
- "新建章节"按钮

## 页面 3：章节编辑页（/novels/:id/chapters/:chapterId）

左右分栏布局：
- 左侧（40%）：
  - 章节标题编辑
  - 章节简介（只读，来自大纲）
  - "AI 生成内容"按钮（SSE 流式，展示在右侧）
  - LLMSelector
  - 前置章节摘要折叠展示
- 右侧（60%）：
  - Textarea 编辑器（自动保存，防抖 2s）
  - 工具栏：字数统计/保存状态
  - Markdown 预览切换

## 页面 4：AI 对话页（/chat）

三栏布局：
- 左侧（240px）：
  - "新对话"按钮
  - 历史对话列表（IndexedDB 存储）
  - 系统提示词管理（预设列表 + 自定义）
- 中间（主内容）：
  - 消息列表（支持 Markdown 渲染）
  - Reasoning 内容折叠展示（DeepSeek Reasoner 的思考过程）
  - 底部输入框（多行/Shift+Enter 换行/Enter 发送）
- 右侧面板（可折叠）：
  - LLM 设置（provider/model/temperature/maxTokens）
  - Agent 模式开关

## 通用组件要求

LLMSelector 组件（全局复用）：
- Props: { value, onChange, showModel?: boolean }
- 两个 Select：Provider 选择 + Model 选择
- Provider 变化时自动更新 Model 列表
- 从 /api/llm/providers 加载配置

StreamOutput 组件：
- Props: { isStreaming, content, onAbort }
- 流式输出时显示光标闪烁动画
- 支持 Markdown 渲染
- 显示"停止生成"按钮（调用 onAbort）
- 完成后显示字数统计

useSSE Hook 用法规范：
const { start, abort, content, isStreaming, isDone, error } = useSSE()
// start(url, body) 发起 SSE 请求
// abort() 中止
// content 累积的文本内容
// isDone 是否完成


Phase 8：设置页 + 收尾
# Phase 8 - 设置页 + 全局收尾

## 设置页（/settings）

API Key 管理：
- 卡片列表展示所有 Provider（deepseek/openai/siliconflow/anthropic）
- 每个 Provider 显示：名称/图标/当前状态（已配置/未配置）/默认模型选择
- "配置"按钮打开 Dialog，输入 API Key（密码框）
- "测试连接"按钮（调用 /api/llm/test）→ 显示延迟和成功/失败
- 保存到数据库 APIKey 表

## 全局状态（Zustand）

llmStore.ts：
{
  provider: string          // 当前选择的 provider
  model: string             // 当前选择的 model
  temperature: number       // 默认 0.7
  maxTokens: number         // 默认 4096
  setProvider: (p) => void
  setModel: (m) => void
  setTemperature: (t) => void
}
// localStorage 持久化

chatStore.ts：
{
  sessions: ChatSession[]   // 所有对话 session
  currentSessionId: string
  // 持久化到 IndexedDB（通过 useLocalDB hook）
}

## React Query 配置

为所有接口定义 Query Keys 常量文件（client/src/api/queryKeys.ts）：
export const queryKeys = {
  novels: { all: ['novels'], detail: (id) => ['novels', id], ... },
  worlds: { all: ['worlds'], ... },
  ...
}

## 错误处理

全局 Axios 响应拦截器：
- 4xx：提取 error 字段，通过 Sonner toast 显示
- 5xx：显示"服务器错误，请稍后重试"
- 网络错误：显示"网络连接失败"

## 启动脚本（根目录 package.json）

{
  "scripts": {
    "dev": "concurrently \"npm run dev -w server\" \"npm run dev -w client\"",
    "dev:server": "npm run dev -w server",
    "dev:client": "npm run dev -w client",
    "db:migrate": "npm run migrate -w server",
    "db:studio": "npm run studio -w server"
  }
}


执行顺序建议： Phase 1 → 2 → 3 → 5（角色库）→ 7（边做后端边做前端对应页面）→ 4 → 6 → 8
每个 Phase 完成后建议做：启动前后端，用浏览器访问对应页面或用 Postman 测试 API，确认无误再进入下一阶段。