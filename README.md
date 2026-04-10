# AI 小说创作工作台 / AI Novel Production Engine
一个面向长篇小说创作的 AI Native 开源项目。

当前开发主线：
`Creative Hub + 自动导演开书 + 整本生产主链 + 写法引擎`

![Monorepo](https://img.shields.io/badge/Monorepo-pnpm%20workspace-3C873A)
![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB)
![Backend](https://img.shields.io/badge/Backend-Express%20%2B%20Prisma-111827)
![AI](https://img.shields.io/badge/AI-LangChain%20%2F%20LangGraph-0EA5E9)
![Editor](https://img.shields.io/badge/Editor-Plate-7C3AED)
![Vector DB](https://img.shields.io/badge/RAG-Qdrant-E63946)


## ✨ 项目简介

这是一个**面向长篇小说的 AI 生产系统**。

它不再是“你写一句，AI补一句”的聊天模式，而是：

- 👉 从一个想法出发
- 👉 自动构建世界观、人物、剧情结构
- 👉 管理知识与设定（RAG）
- 👉 控制写作风格与叙事一致性
- 👉 最终生成完整章节甚至整本小说



## 项目定位

很多 AI 写作工具的使用方式其实差不多：
- 你输入一句 Prompt
- 它回你一段正文
- 不满意就重试
- 写短篇还行，写长篇容易越写越散

这个仓库是“AI 导演式长篇小说生产系统”，而不是传统的写作聊天壳子。

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

- 可以从一句模糊灵感直接进入自动导演，不必先自己把世界观、主线、角色和卷纲全想完；系统会先整理项目设定、对齐书级 framing，再生成多套整本方向和对应标题组。
- 方案选择不再只是“满意就确认、不满意就整批重来”。如果第一轮方向不够准，可以继续生成下一轮；如果已经偏向某一套，也可以只让 AI 修这套方案，或者只重做这套的标题组。
- 自动导演创建时已经支持三种推进方式：`按重要阶段审核`、`自动推进到可开写`、`继续自动执行前 10 章`。对应链路会把书级方向、故事宏观规划、角色准备、卷战略、节奏拆章和章节执行接成一条连续流程。
- 这条链路已经支持检查点恢复、现有项目接管、页内继续推进和换模型重试。到 `front10_ready` 之后，不仅能直接进入章节执行，也可以继续让 AI 自动执行前 10 章的写作、审校和修复。
- 自动导演里的角色阶段也不再无条件把第一套阵容直接落库。现在会优先生成可直接进入正文的人物资产；如果角色名仍像功能位、缺少身份锚点或质量不够稳定，系统会停在角色审核点，而不是继续把坏阵容带进后续卷规划和拆章。

### 2. Creative Hub 与 Agent Runtime

- `Creative Hub` 现在已经不只是一个聊天页，而是在往统一创作中枢收：对话、追问、规划、工具调用、执行状态和回合总结都在往这里并。
- 系统里已经有了比较明确的 Planner、Tool Registry、Runtime、审批节点、状态卡片和中断恢复链路，说明这个项目现在关注的已经不是“AI 会不会写字”，而是“AI 能不能组织一条真实的创作工作流”。
- 如果你关心的是 AI Native Product 怎么落地，这一块已经不是零散按钮拼盘了，而是开始长出一套值得继续往下做的骨架。

### 3. 整本生产主链

- 单章运行时、章节执行和整本批量 pipeline 现在都在往同一条主链上收，不再是“这里一个试写入口，那里一个批量按钮”的割裂状态。
- 已经可以从结构化规划、章节目录和资产准备状态出发，启动整本写作任务，并持续查看当前阶段、失败原因和下一步建议。
- 它当然还不是那种完全不用管的一键出书机，但也已经不是“只能演示几张截图”的阶段了，至少主链是真的能往前推。

### 4. 写法引擎

- 写法现在不再只是提示词里的一段长说明，而是可以保存、编辑、绑定、试写和复用的长期资产。
- 可以从现有文本里提取写法特征，并把原文样本一起保存下来，后面不是只能靠记忆去猜“当时那个味道到底怎么来的”。
- 提取出来的特征会沉淀成可见特征池，进入编辑页以后可以逐项启用、停用和组合，写法规则也会跟着同步重编译，便于后续试写、修正和整本绑定。
- 这意味着写法引擎现在已经开始真的参与生成、检测和修正链路，而不是一个摆在侧边栏里的概念功能。

### 5. 世界观、角色、拆书、知识库联动

- 世界观已经不只是大段设定文本，而是支持创建、分层设定、快照、深化问答、一致性检查和小说绑定的结构化资产。
- 角色体系也不再只是静态角色卡，已经开始往动态角色资产走，会把关系阶段、卷级职责、缺席风险和候选新角色一起带进后续规划与生成。
- 拆书结果可以继续发布到知识库，再回灌到续写、规划和正文生成；知识库本身也已经支持文档管理、向量检索、关键词检索和重建任务追踪。
- 换句话说，这一块现在已经开始像“长期记忆系统”，而不是做完一次设定就丢在那里的资料堆。

### 6. 模型路由与本地运行

- 已经支持 OpenAI、DeepSeek、SiliconFlow、xAI 等多提供商配置，规划、正文、审阅这些链路可以按路由拆开配。
- 前后端已经完成 Monorepo 拆分，适合本地持续开发，也比较适合继续往 Prompt Registry、Workflow Registry 和 Runtime 这条路上扩。
- 默认使用 SQLite 就能把主链先跑起来；如果你要完整体验知识库 / RAG，再按需接 Qdrant 就行，不需要一上来就把所有基础设施堆满。


## 典型使用路径

1. 在小说创建页输入一句灵感，先让 AI 自动导演给出整本方向候选。
2. 进入 `项目设定`，先把题材、卖点、目标读者感受和前 30 章承诺定下来。
3. 用 `故事宏观规划`、`角色准备` 和世界观资产，把整本主线、角色网和世界边界补到能写。
4. 进入 `卷战略 / 卷骨架` 决定怎么分卷，再到 `节奏 / 拆章` 把当前卷落到章节列表和单章细化。
5. 按需绑定拆书结果、知识库文档和写法资产，让后续正文不只是靠一次性提示词。
6. 进入 `章节执行` 逐章写作、审计、修复，必要时回到卷工作台做再平衡和重规划。
7. 想加速推进时，再启动整本生产任务，持续查看状态、失败原因和回灌结果。

## 当前长篇生成能力支撑图

![当前长篇生成能力支撑图](./images/流程图.svg?v=1)

- 开书定盘负责先把这本书“要写成什么样”说清楚，避免后面越写越散。
- 整本控制层和卷级规划层负责把长篇拆成可推进、可回看、可调整的结构，而不是一次性写死。
- 角色、世界观、写法、知识库和质量控制一起托住单章生成，让每一章都尽量还在同一本书里。
- 每写完一章，系统都会把新状态回灌回去，继续影响后续章节、卷级节奏和必要时的重规划。

## 最新更新

完整历史更新见 [docs/releases/release-notes.md](./docs/releases/release-notes.md)。

### 2026-04-10

重大更新：章节编辑器现在变成独立的正文中心精修入口，选中段落后可以直接发起 AI 改写、查看候选差异并确认，不会再把工作台和编辑器混在一起。
- 书级方向确认更准确：自动导演停在“等待确认书级方向”时，不会再在编辑页里误报“已在后台推进”；系统会直接带你回到正确的确认入口，先定方案，再继续后面的主链。
- 批量章节结果更清楚：如果一批章节已经生成完成、只是部分章节低于质量阈值，系统现在会保留结果并明确提示“已完成，部分章节需要复查”，不再把整批任务直接打成失败。
- 继续操作更顺手：任务中心会直接展示这类结果提醒，相关继续入口也能在章节批次待确认时继续接回；旧任务里残留的错误恢复入口也会自动纠正，减少“看起来能继续、实际不会推进”的困惑。
- 书级方案生成更稳：模型若输出书名备选，风格标签与系统约定一致，并兼容常见写法差异；自动导演在使用 Kimi 2.5 推进书级规划时，对结构化返回也更稳，减少刚起步就因模型输出边界而中断。
- 角色准备更稳：自动导演现在会直接生成 1 套可自动落库的核心角色阵容；如果阵容里还有功能位角色名、主角锚点不清或关系撑不起长篇推进，系统会先停在角色审核点，不再把问题角色继续带进后面的卷规划。
- 中途恢复更准：如果自动导演其实已经推进到故事宏观规划阶段，系统会自动清掉过期的候选阶段残留状态，避免被旧检查点误导回错误入口。
- 结构化结果更不容易“差一点就白跑”：对书级规划、角色阵容这类生成结果，如果主要问题只是字段略长、但语义本身成立，系统现在会优先保留有效内容并继续推进，减少因为长度边界反复修复甚至整步失败。

## 功能预览
### 功能概览中的95%以上编写都是AI完成
### Creative Hub

统一承载对话、规划、工具执行和创作推进的创作中枢。

![创作中枢](./images/创作中枢.png)

### 自动导演模式

从一句想法出发，先选整本方向，再决定是阶段审核、自动推进到可开写，还是直接继续自动执行前 10 章。

![自动导演创建](./images/导演模式-创建.png)

![自动导演选择方向](./images/导演模式-选择方向.png)

![自动导演执行中](./images/导演模式-创建中.png)

![自动导演交接与继续执行](./images/导演模式-编辑.png)

### 项目设定

先把题材、卖点、读者预期和前 30 章承诺讲清楚，再把后续规划和生成都建立在同一条开书控制轴上。

![项目设定](./images/项目设定.jpeg)

### 故事宏观规划

从整本走向、阶段升级和长线兑现出发，先把长篇主线搭稳，再继续卷级和章节级规划。

![故事宏观规划](./images/故事宏观规划.jpeg)

### 角色准备

围绕主角团、关系网和卷级职责做角色准备，减少开书后角色断档、功能位缺失和关系推进失速。

![角色准备](./images/角色准备.jpeg)

### 卷战略 / 卷骨架

先决定怎么分卷、哪些卷要硬规划，再把每卷使命、升级节点和卷尾钩子钉稳。

![卷战略 / 卷骨架](./images/卷骨架.jpeg)

### 节奏 / 拆章

先看当前卷节奏，再把节奏落实成章节列表和单章细化，卷内推进链路更适合连载网文的追读节奏。

![节奏 / 拆章](./images/节奏拆章.jpeg)

### 章节执行

章节执行页把章节导航、当前结果和 AI 快捷操作放进同一工作流里，适合逐章推进、审计和修复。

![章节执行](./images/章节执行.jpeg)

### 正文修改

在正文编辑页里直接回看当前章、修正文案，并继续衔接任务单、审计结果和修复链路。

![正文修改](./images/正文修改.jpeg)

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

### 类型管理

集中维护题材与类型资产，让故事规划、角色准备和正文生成共享同一套题材语言。

![类型管理](./images/类型管理.jpeg)

### 流派管理

把推进模式、兑现方式和冲突边界收成可复用的流派模式资产，让整本书更容易保持读者预期。

![流派管理](./images/流派管理.jpeg)

### 标题工坊

批量生成、筛选和微调书名与标题方向，降低新手在开书命名阶段的试错成本。

![标题工坊](./images/标题工坊.jpeg)

### 写法引擎与反 AI 规则

统一管理写法资产、风格约束和反 AI 规则，让正文更像作品本身，而不是模板式补全文本。

![写法引擎与反 AI 规则](./images/写法引擎与反AI规则.jpeg)

### 任务中心

查看拆书、知识库重建和其他后台任务的排队、执行与失败状态。

![任务中心](./images/任务中心.png)

### 模型配置

为不同能力配置不同模型，减少一套模型硬吃所有任务的成本。

![模型配置](./images/模型配置.png)

## 快速开始

### 环境要求

- Node.js `^20.19.0 || ^22.12.0 || >=24.0.0`
  推荐直接使用 `20.19.x LTS`
- pnpm `>= 9.7`
- 至少一组可用的 LLM API Key
  也可以先把项目跑起来，再在页面里配置
- 如果你要完整体验知识库 / RAG，再额外准备可用的 Qdrant

### 1. 安装依赖

```bash
pnpm install
```

如果你在 Windows 上执行 `pnpm install` 时卡在 `prisma preinstall`，通常先检查这两类问题：

1. Node 版本过低
   Prisma 7 目前要求 Node `^20.19.0 || ^22.12.0 || >=24.0.0`。如果你还在 `20.0 ~ 20.18`，建议先升级到 `20.19.x LTS` 再安装。
2. `script-shell` 被配置成了交互式 shell
   如果全局 `npm/pnpm script-shell` 被设成了 `cmd.exe /k` 之类会保留提示符的形式，Prisma 的 lifecycle script 可能不会自动退出，看起来就像安装“卡死”在：
   `node_modules/.../prisma>`

可以先运行下面几条命令自查：

```bash
node -v
pnpm config get script-shell
npm config get script-shell
```

如果 `script-shell` 返回的是带 `/k` 的 `cmd.exe`，建议删除这项配置后重新打开终端：

```bash
npm config delete script-shell
pnpm config delete script-shell
```

然后重新执行：

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

这也包括“同一台机器启动服务，然后用局域网 IP 在别的设备上访问”的场景。
例如页面开在 `http://192.168.0.37:5173`，前端默认会自动把 API 指到：

```text
http://192.168.0.37:3000/api
```

只有在这些场景下，才建议创建 `client/.env`：

- 前端和后端不在同一台机器
- 你想把前端显式指向别的 API 地址
- 你需要固定 `VITE_API_BASE_URL`

如果你已经复制了 `client/.env.example`，又发现浏览器请求都跑到了 `http://localhost:3000/api`，通常就是因为你把 API 显式固定死了。对同机 / 局域网访问，建议直接删除或注释掉 `VITE_API_BASE_URL`。

示例：

```bash
# macOS / Linux
cp client/.env.example client/.env

# Windows PowerShell
Copy-Item client/.env.example client/.env
```

内容通常只需要：

```env
# 同机 / 局域网访问时，通常不需要这一行
# VITE_API_BASE_URL=http://localhost:3000/api
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

如果你已经复制好了 `server/.env` 和 `client/.env`，默认就是直接运行这一条。
不需要在首次启动前手动再执行 `prisma generate`、`prisma db push` 或 `pnpm db:migrate`。

默认情况下：

- 前端：`http://localhost:5173`
- 后端：`http://localhost:3000`
- API：`http://localhost:3000/api`

首次启动服务端时，会自动执行 Prisma generate 和 `db push`。
只有在你自己修改了 Prisma schema，或者要处理正式迁移流程时，才需要手动使用 Prisma / 数据库相关命令。

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

下面这些都不是首次启动 `pnpm dev` 的前置步骤：

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
# 仅在你开发/调整 Prisma schema 时再手动使用
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

## 交流反馈

如果你想反馈问题、交流使用体验，或者讨论自动导演、整本生产主链、写法引擎等方向，可以扫码加入 QQ 群。

![QQ 群二维码](./images/群.png)

## 贡献方式

如果你想参与这个项目，最有价值的贡献方向包括：

- 提升整本生产稳定性
- 改善新手开书体验和自动导演成功率
- 强化写法引擎、知识库回灌和世界观一致性链路
- 补充测试、错误回放和运行时可观察性

欢迎直接提 Issue 或 Pull Request。

## 致谢

感谢提交修复 Pull Request 的贡献者 [@ystyleb](https://github.com/ystyleb)。


## 说明

- 这是一个持续快速迭代中的 AI Native 创作系统，功能边界仍在演化。
- README 优先描述当前最值得体验、最能代表方向的能力，而不是列出全部历史实现细节。
- 如果你更关心阶段目标、优先级和后续优化计划，请直接查看 [TASK.md](./TASK.md)。


## 目标：只需要进行书名配置 和 点击确认按钮 即可生成（理想）小说
# 
## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
