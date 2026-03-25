# AI Novel Writing Assistant v2

一个面向长篇小说创作的 AI Native 开源项目。

它的目标不是“帮你写一段文”，而是把开书、设定、世界观、角色、大纲、章节、拆书、知识库、RAG、写法控制、Agent 调度串成一条完整的创作生产链，让完全不懂写作的人也有机会在 AI 引导下完成整本小说。

当前开发主线：
`Creative Hub + 自动导演开书 + 整本生产主链 + 写法引擎`

![Monorepo](https://img.shields.io/badge/Monorepo-pnpm%20workspace-3C873A)
![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB)
![Backend](https://img.shields.io/badge/Backend-Express%20%2B%20Prisma-111827)
![AI](https://img.shields.io/badge/AI-LangChain%20%2F%20LangGraph-0EA5E9)
![Editor](https://img.shields.io/badge/Editor-Plate-7C3AED)
![Vector DB](https://img.shields.io/badge/RAG-Qdrant-E63946)

## 目录

- [项目定位](#项目定位)
- [现在已经能做什么](#现在已经能做什么)
- [典型使用路径](#典型使用路径)
- [最近进展](#最近进展)
- [功能预览](#功能预览)
- [快速开始](#快速开始)
- [常用命令](#常用命令)
- [技术栈与架构](#技术栈与架构)
- [当前路线图](#当前路线图)
- [贡献方式](#贡献方式)

## 项目定位

这个仓库更接近“AI 导演式长篇小说生产系统”，而不是传统的写作聊天壳子。

它最核心的产品判断是：

- 目标用户优先是完全不懂写作的新手，而不是熟悉结构设计的资深作者。
- 优先解决“如何把整本书写完”，再逐步优化“写得多精巧”。
- AI 不只是一个补全文本的模型，而是参与规划、判断、调度、执行和追踪的系统角色。

如果你正在找的是下面这种项目，这个仓库会更值得关注：

- 想验证 AI 是否真的能参与整本小说生产，而不是只写单段文案。
- 想研究 AI Native Product、Agent Workflow、LangGraph 编排怎样落到真实创作业务。
- 想把世界观、角色、拆书、知识库、写法控制和章节生成串成一套稳定工作流。

## 现在已经能做什么

### 1. AI 自动导演开书

- 可以从一句灵感开始，让 AI 先给出多套整本方向候选。
- 如果第一批方向不满意，可以继续指出偏差，让系统生成下一批方案，而不是整页重来。
- Novel Setup 状态会告诉你当前缺的是题材、故事承诺、世界观、角色还是大纲。

### 2. Creative Hub 与 Agent Runtime

- `Creative Hub` 已经成为统一创作中枢，承接对话、规划、工具调用、执行追踪和回合总结。
- 系统已经具备 Planner、Tool Registry、Runtime、审批节点、状态卡片和中断恢复链路。
- 当前重点已经从“AI 能不能生成文本”转向“AI 能不能组织整个创作系统”。

### 3. 整本生产主链

- 单章运行时与整本批量 pipeline 正在收拢到同一条主链。
- 可以从结构化大纲、章节目录和资产准备状态出发，启动整本写作任务。
- 整本生产状态会提示当前阶段、失败原因和下一步建议。

### 4. 写法引擎

- 写法不再只是长段说明，而是可保存、编辑、绑定、试写和复用的资产。
- 可以从文本中提取写法特征，并把原文样本一起保存。
- 提取出的特征会沉淀成可见特征池，进入编辑页后可像绑定反 AI 规则一样逐项启用或停用。
- 调整特征启用状态后，写法规则会同步重编译，便于后续试写和整本绑定。

### 5. 世界观、角色、拆书、知识库联动

- 世界观支持创建、分层设定、快照、深化问答、一致性检查和小说绑定。
- 角色体系支持全局角色库与小说内角色管理。
- 拆书结果可以发布到知识库，再回灌到续写、规划和正文生成。
- 知识库支持文档管理、向量检索、关键词检索与重建任务追踪。

### 6. 模型路由与本地运行

- 支持 OpenAI、DeepSeek、SiliconFlow、xAI 等多提供商配置。
- 前后端已经完成 Monorepo 拆分，适合本地持续开发。
- 默认使用 SQLite，知识库检索可按需接入 Qdrant。

## 典型使用路径

1. 在小说创建页输入一句灵感，先让 AI 自动导演给出整本方向候选。
2. 确认故事方向、题材风格、世界舞台和核心承诺。
3. 进入 `Creative Hub` 或小说编辑页，继续补齐世界观、角色、大纲和章节目录。
4. 按需绑定拆书结果、知识库文档和写法资产。
5. 通过写法引擎确认整本默认写法，必要时叠加反 AI 规则。
6. 启动章节生成或整本生产任务，持续查看状态、审阅结果并回灌修正。

## 最近进展

### 2026-03-25

重大更新：小说规划正式升级为卷级工作台，长篇主线、卷纲和章纲现在可以在同一套结构里联动维护。
重大更新：角色准备正式升级为动态角色系统，卷级职责、关系阶段和新角色候选现在会持续进入规划、生成与重规划链路。

- 小说编辑页的“故事主线”正式升级为卷级工作台，可以按卷维护主承诺、冲突升级、主角变化、卷末高潮和下卷承接钩子，长篇规划不再只能堆在一整块文本里。
- 结构化大纲升级为卷纲 / 章纲联动工作台，章节现在直接挂在所属卷下维护，并支持批量调整冲突强度、目标字数和任务单，卷级修改后也能先看同步预览再落到章节目录。
- 卷纲生成流程进一步拆成“三步走”：先生成全书卷骨架，再按卷生成章节列表，最后按章补章节目标、执行边界和任务单，长篇规划不再一上来就把所有字段一次塞满。
- 卷级规划新增版本草稿、设为生效版、冻结、差异对比和影响分析，调整长篇结构时可以先判断会波及哪些卷和章节，再决定是否正式切换。
- 旧项目首次打开卷级工作台时，会自动把原有主线、大纲和阶段规划回填成卷级方案，后续章节规划也会开始参考这套卷级控制层。
- 默认预估章节数提升到 80 章，更贴近长篇小说起步配置，减少新手一开始就把整本书压成过短篇幅的情况。
- 角色页新增“动态角色系统”主区，可以直接看到当前卷核心角色、卷级职责、缺席风险、关系阶段和待确认的新角色候选，不再需要靠手工追踪人物推进节奏。
- 新角色候选会在章节写完后自动从正文里提取出来，确认或并入现有角色后，会立刻进入下一章的规划与生成上下文。
- 关系阶段和阵营变化会持续沉淀到角色系统中，planner、runtime 和 replan 都会开始参考“谁该推进、谁缺席过久、哪条关系已进入新阶段”。
- 应用 AI 角色阵容方案后，不再只生成静态角色卡，而是会同时初始化卷级职责、关系阶段和后续缺席风险基线，让长篇角色推进更连续。

### 2026-03-24

- 小说创建页和小说编辑页的基础信息区新增“书级 framing”，用户可以先把目标读者、核心卖点、熟悉阅读感和前 30 章承诺讲清楚，再进入后续规划与生成。
- 基础信息支持 AI 一键补全书级 framing 建议，后续世界裁剪、写法推荐和主线规划会开始参考这些信息，开书定位更稳，也更适合小白直接起步。
- 小说编辑页的角色区重构为“角色资产工作台”，新增角色和导入角色改成按需入口，日常主区更聚焦当前角色的状态、动机、成长弧和时间线维护。
- 新增 AI 角色阵容方案，可一次生成多套核心角色与关键关系候选，并在确认后批量同步到小说角色资产，降低新手前期搭角色系统的门槛。
- 模型设置补充更多可选提供商与默认模型，设置页也支持按需展开完整模型列表，减少配置时的信息拥挤和历史参数兼容问题。

### 2026-03-23

- 章节运行时面板开始直接展示章节职责、阶段标签、必须推进/必须保留事项，并支持在发现结构问题后发起重规划，减少写到一半才发现方向漂移。
- 章节生成上下文进一步收口到“规划 + 最新状态 + 活跃冲突 + 创作决策”这条主链，长篇连续生成时更容易保持人物、关系和伏笔的一致性。
- 文本提取型写法资产现在会同时保存原文样本，方便回看、比对和继续微调。
- 提取到的写法特征会沉淀成可编辑的特征池，用户可以在写法编辑里逐项启用或停用。
- 当一次提取没有产出可用特征时，编辑页会明确提示原因，并支持直接重新提取。

### 2026-03-22

- 小说创建页新增了“AI 自动导演创建”入口，可以先生成多套整本方向候选，再继续追问和修正。
- 整本批量生成与单章运行时主链进一步收拢，减少两条链路生成结果割裂的问题。
- 小说编辑页补上了“正文开写前的写法确认”环节，降低新手选风格门槛。

### 2026-03-21

- 写法引擎工作区重构为更聚焦的模块化界面，主流程更专注于选资产、编辑、绑定与试写。
- 写法约束开始更深地接入章节生成、检测与自动修正链路。
- 标题快选和模型连通性错误提示进一步优化。

### 2026-03-20

- 新增“写法引擎”模块，写法资产开始真正参与试写、生成约束、AI 味检测和一键修正。
- 拆书页可将“文风与技法”一键转成写法资产。
- 小说页开始更明确地区分“这本书真正会用到的世界切片”和全量世界资料。

更细的阶段规划可以看 [TASK.md](./TASK.md)。

## 功能预览

### Creative Hub

统一承载对话、规划、工具执行和创作推进的创作中枢。

![创作中枢](./images/创作中枢.png)

### 小说列表

从这里进入开书、管理、编辑和整本生产。

![小说列表](./images/小说列表.png)

### 拆书分析

把参考作品拆成结构化知识，再回灌给后续创作链路。

![拆书分析](./images/拆书.png)

### 知识库

统一管理文档、索引、重建任务和检索能力。

![知识库](./images/知识库.png)

### 世界观

世界观不再只是描述文本，而是能被绑定、检查和持续维护的结构化资产。

![世界观](./images/世界观.png)

### 角色库

统一维护角色基础档案与小说内角色信息。

![角色库](./images/角色库.png)

### 任务中心

查看拆书、知识库重建和其他后台任务的排队、执行与失败状态。

![任务中心](./images/任务中心.png)

### 模型配置

为不同能力配置不同模型，减少一套模型硬吃所有任务的成本。

![模型配置](./images/模型配置.png)

## 快速开始

### 环境要求

- Node.js `>= 20`
- pnpm `>= 9.7`
- 至少一组可用的 LLM API Key
  也可以先把项目跑起来，再在页面里配置
- 如果你要完整体验知识库 / RAG，再额外准备可用的 Qdrant

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

这个仓库通过 pnpm workspace 分别启动前后端，所以环境变量也是按子包读取的：

- 服务端运行在 `server/` 工作目录，默认读取 `server/.env`
- 前端运行在 `client/` 工作目录，默认读取 `client/.env` / `client/.env.local`
- 根目录 `.env.example` 目前更适合当“总览参考”，不是 `pnpm dev` 默认读取的主入口

#### 2.1 服务端环境变量

先复制服务端示例文件：

```bash
# macOS / Linux
cp server/.env.example server/.env

# Windows PowerShell
Copy-Item server/.env.example server/.env
```

最少建议先确认这些项目：

- `DATABASE_URL`
  默认就是本地 SQLite，可直接使用
- `RAG_ENABLED`
  如果你暂时不接知识库，建议先设为 `false`
- `QDRANT_URL`、`QDRANT_API_KEY`
  只有要启用 Qdrant / RAG 时才需要

注意：

- `OPENAI_API_KEY`、`DEEPSEEK_API_KEY`、`SILICONFLOW_API_KEY` 这类变量可以先留空
- 项目启动后，也可以在页面中配置模型供应商和默认模型

#### 2.2 前端环境变量

大多数本地开发场景，其实不需要单独创建前端 env。

因为前端开发模式下默认会把 API 指到：

```text
http(s)://当前页面 hostname:3000/api
```

只有在这些场景下，才建议创建 `client/.env`：

- 前端和后端不在同一台机器
- 你想把前端显式指向别的 API 地址
- 你需要固定 `VITE_API_BASE_URL`

示例：

```bash
# macOS / Linux
cp client/.env.example client/.env

# Windows PowerShell
Copy-Item client/.env.example client/.env
```

内容通常只需要：

```env
VITE_API_BASE_URL=http://localhost:3000/api
```

#### 2.3 模型供应商并不一定要写死在 env

当前项目已经支持在页面里配置模型相关设置：

- `/settings`
  配置供应商 API Key、默认模型、连通性测试
- `/settings/model-routes`
  给不同任务分配不同 provider / model
- `/knowledge?tab=settings`
  配置 Embedding provider、Embedding model、集合命名和自动重建策略

所以环境变量里的 `OPENAI_MODEL`、`DEEPSEEK_MODEL`、`EMBEDDING_MODEL` 等，更适合当作：

- 启动默认值
- 数据库里还没保存设置时的回退值

### 3. 启动开发环境

```bash
pnpm dev
```

默认情况下：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3000`
- API：`http://localhost:3000/api`

首次启动服务端时，会自动执行 Prisma generate 和 `db push`。

建议第一次启动后先做这几步：

1. 打开 `http://localhost:5173/settings`，至少配置一组可用的模型供应商 API Key
2. 打开 `http://localhost:5173/settings/model-routes`，检查各任务实际使用的模型路由
3. 如果要启用知识库，打开 `http://localhost:5173/knowledge?tab=settings`，保存 Embedding / Collection 设置

### 4. 如果你使用 Qdrant Cloud

如果你只是先体验主流程，其实可以先跳过 Qdrant，直接在 `server/.env` 里设：

```env
RAG_ENABLED=false
```

如果你要启用 Qdrant Cloud，可以按下面的最小流程来：

1. 到 [Qdrant Cloud](https://cloud.qdrant.io/) 注册账号。
2. 在 `Clusters` 页面创建一个集群。
   测试阶段用 Free cluster 就够了。
3. 集群创建完成后，到集群详情页复制 Cluster URL。
4. 在集群详情页的 `API Keys` 中创建并复制一个 Database API Key。
   这个 key 创建后通常只展示一次，建议立即保存。
5. 把它们写入 `server/.env`：

```env
QDRANT_URL=https://your-cluster.region.cloud.qdrant.io:6333
QDRANT_API_KEY=your_database_api_key
```

6. 启动项目后，再去 `知识库 -> 向量设置` 页面选择 Embedding provider / model，并保存集合设置。

对这个项目来说，`QDRANT_URL` 建议直接填 REST 地址，也就是带 `:6333` 的地址。

如果你想手动验证连通性，可以用：

```bash
curl -X GET "https://your-cluster.region.cloud.qdrant.io:6333" \
  --header "api-key: your_database_api_key"
```

你也可以把集群地址后面拼上 `:6333/dashboard` 打开 Qdrant Web UI。

Qdrant 官方文档：

- [Create a Cluster](https://qdrant.tech/documentation/cloud/create-cluster/)
- [Database Authentication in Qdrant Managed Cloud](https://qdrant.tech/documentation/cloud/authentication/)
- [Cloud Quickstart](https://qdrant.tech/documentation/cloud/quickstart-cloud/)

### 5. 可选初始化

```bash
pnpm db:seed
pnpm db:studio
```

## 常用命令

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm db:migrate
pnpm db:seed
pnpm db:studio
pnpm --filter @ai-novel/server test
pnpm --filter @ai-novel/server test:routes
pnpm --filter @ai-novel/server test:book-analysis
```

## 技术栈与架构

### 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 19、Vite、React Router、TanStack Query、Plate |
| 后端 | Express 5、Prisma、Zod |
| AI 编排 | LangChain、LangGraph |
| 数据库 | SQLite |
| RAG | Qdrant |
| 工程形态 | pnpm workspace Monorepo |

### Monorepo 结构

```text
client/   React + Vite 前端
server/   Express + Prisma + Agent Runtime + Creative Hub
shared/   前后端共享类型与协议
images/   README 与产品预览截图
scripts/  启动和辅助脚本
docs/     设计文档、阶段检查点、模块计划与历史归档
```

更细的文档分区说明可以看 [docs/README.md](./docs/README.md)。

### 当前系统关注点

- `Creative Hub` 负责统一创作中枢与 Agent 运行时体验
- `Novel Setup / Director` 负责从一句灵感走到整本可写
- `Novel Production` 负责整本生成主链
- `Style Engine` 负责写法资产、特征提取、绑定和反 AI 协同
- `Knowledge / Book Analysis / World` 负责长期上下文沉淀与回灌

## 当前路线图

当前最重要的不是继续堆零散功能，而是提高“小白把整本书写完”的成功率。

### P0

- 把自动导演、Novel Setup、整本生产主链进一步收拢成稳定闭环
- 让用户从一句灵感进入“整本可写”状态
- 降低新手在写法、世界观、角色和章节规划上的认知负担

### P1

- 提高整本一致性、节奏稳定性和人物成长质量
- 让写法资产、世界观约束、章节重规划和审阅反馈形成闭环
- 让系统更擅长“持续掌控整本书”，而不只是“生成某一章”

### P2

- 继续强化多阶段 Agent 协同
- 完善更自动化的生产调度、回合记忆和整本质量控制

## 贡献方式

如果你想参与这个项目，最有价值的贡献方向包括：

- 提升整本生产稳定性
- 改善新手开书体验和自动导演成功率
- 强化写法引擎、知识库回灌和世界观一致性链路
- 补充测试、错误回放和运行时可观察性

欢迎直接提 Issue 或 Pull Request。

## 说明

- 这是一个持续快速迭代中的 AI Native 创作系统，功能边界仍在演化。
- README 优先描述当前最值得体验、最能代表方向的能力，而不是列出全部历史实现细节。
- 如果你更关心阶段目标、优先级和后续优化计划，请直接查看 [TASK.md](./TASK.md)。

## 这是对AI完全接入项目开发的一次尝试
## 项目中所有代码都是AI编写
## 目标：只需要进行书名配置 和 点击确认按钮 即可生成（理想）小说
# 
