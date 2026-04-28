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

## Windows 桌面版

如果你只是想直接下载安装并开始使用，优先从桌面版入口进入：

- 下载入口：[GitHub Releases](https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant/releases)
- 最新版本页：[Latest Release](https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant/releases/latest)
- 建议优先下载 `Setup.exe` 安装版；如果你不想安装，或者想放在 U 盘 / 临时目录里直接运行，再选择 `portable` 版本



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

### 2026-04-28

重大更新：自动导演重构进入统一运行时落地阶段。新建、候选确认、已有项目接管、手动继续和章节执行开始沉淀到同一份运行状态里，系统会先分析当前小说资产，再按统一策略决定下一步怎么推进；后续创作中枢也可以通过同一组入口读取状态、切换策略和继续任务。

- 自动导演开始使用统一运行时记录运行快照、步骤事件、工作区分析和关键产物索引。
- AI 接管已有小说时会先分析当前资产，减少接管链路和新建链路割裂。
- 书级契约、故事规划、角色、分卷、章节任务单、正文草稿和审校报告会先作为可追踪产物进入索引。
- 自动、半自动、只建议和安全范围自动推进会走同一套策略判断。
- 涉及覆盖用户手写内容时会进入保护逻辑；自动修复默认最多尝试一次。
- 章节执行、章节质量修复和接管后的继续执行会先通过统一策略判断，任务需要确认或触及保护范围时会停在明确的待处理状态。
- 自动导演运行状态会附带当前节点、最近事件、是否需要用户处理和阻塞原因，方便任务中心与创作中枢给出清楚的继续入口。
- 章节任务单、正文草稿、审校报告和修复工单会记录来源、依赖与用户内容保护状态，让后续自动执行更稳。
- 完整改造计划已明确为一次性执行路线，后续会继续把手动编辑影响分析、创作中枢、上下文代理、步骤运行时和质量模块纳入同一条主链。
- 手动改过章节正文后，自动导演可以分析受影响章节、相关审校报告和后续产物，并给出最小复查或修复路径，避免轻微润色就重跑整本规划。
- 运行时编排职责开始从主服务中拆出，章节执行、策略门禁、运行状态刷新和待确认处理会更集中。
- 确认方案时的重复提交保护更稳，已有小说或正在建书的任务会优先复用已有结果，减少误触后重复建项目或中断的情况。
- 开书进度、任务中心和小说工作台侧栏会读取同一份导演进度，直接显示当前节点、最近进展、是否需要处理和推进方式。
- 任务中心可以检查章节改动影响，直接看到受影响章节、是否适合继续推进，以及建议的最小复查或修复路径。
- 任务中心可以切换导演推进方式，在只给建议、推进下一步、推进到检查点和安全范围自动推进之间选择。
- 章节正文等产物变化后，自动导演会保留版本线索，并把依赖旧内容的审校结果标为需要重新确认，减少手动改文后误用旧结果的风险。
- 绑定世界观、续写资料、章节任务单、正文、审校报告和修复任务会形成更完整的依赖链，帮助系统判断哪些后续内容需要重新确认。

## 功能预览
### 功能概览中的95%以上编写都是AI完成

下面这组截图优先展示当前版本正在使用的单书工作流：从自动导演开书，到项目设定、故事宏观规划、角色准备、卷战略、节奏拆章、章节执行，再到质量修复，已经开始收成一条连续推进链，而不是一组彼此割裂的演示页。

### Creative Hub

统一承载对话、规划、工具执行和创作推进的创作中枢。

![创作中枢](./images/创作中枢.png)

### 自动导演模式

自动导演创建页现在会把一句灵感、导演起始参数、书级 framing、模型设置和运行方式收进同一面板；进入方向选择后，不只是给你两套整本方案，还会配套书名组选项、推荐理由和定向重做入口，适合先把这本书“该怎么开”定下来。

![自动导演创建](./images/导演模式-创建.png)

![自动导演选择方向](./images/导演模式-选择方向.png)

![自动导演执行中](./images/导演模式-创建中.png)

![自动导演交接与继续执行](./images/导演模式-编辑.png)

### 项目设定

项目设定已经挂到单书工作台的连续流程里：左侧能直接看到当前步骤与整体进度，上方能看到 AI 接管状态，正文区则集中处理标题、简介、书级 framing、写法确认和本书真正会用到的世界边界。

![项目设定](./images/write/项目设定.png)

### 故事宏观规划

故事宏观规划不再只是大段摘要，而是先把故事引擎、推进与兑现摘要、长期对立和前 30 章承诺压成后续可继承的书级引导层，先保证整本主线能推，再把卷级和章节级规划建在这套底盘上。

![故事宏观规划](./images/write/故事宏观规划.png)

### 角色准备

角色准备页现在更像角色工作台而不是角色表单：会先盘点目标区段的核心角色，再给出 AI 阵容方案、结构关系网和动态角色系统，减少开书后角色断档、功能位缺失和关系推进失速。

![角色准备](./images/write/角色准备.png)

### 卷战略 / 卷骨架

卷战略阶段已经开始显式区分“卷战略、卷骨架、节奏板、拆章节”四个阶段完成度。系统会先判断当前是不是已经具备继续推进条件，再生成卷战略建议、审查卷骨架，并把版本控制与影响分析收进同一页。

![卷战略 / 卷骨架](./images/write/卷战略.png)

### 节奏 / 拆章

节奏 / 拆章现在把节奏段列表、批量细化、单章标题、摘要、章节目标和任务单放进同一工作区；可以按当前可见章节或指定范围连续细化，也可以对摘要和目标做局部 AI 修正，更适合连载网文式的持续推进。

![节奏 / 拆章](./images/write/节奏拆章.png)

### 章节执行

章节执行页现在更像主写作工作台：左侧是章节卡片与下一步状态，中间是已保存正文和版本区，右侧则把执行计划、正文写作、审核、修复、状态同步和伏笔回填收在同一套动作面板里，适合逐章推进。

![章节执行](./images/write/章节执行.png)

### 质量修复

质量修复已经从零散按钮收成独立工作台：可以围绕当前章节执行审核、执行修复、生成钩子，并结合当前批次、质量阈值和 AI 输出继续往后处理，适合把“写完之后怎么稳住质量”也纳入主流程。

![质量修复](./images/write/质量修复.png)

### 正文修改

当一章已经写出正文后，还可以进入独立正文编辑器继续局部改写。正文修改页会把任务单、审计结果和修复链路继续挂在这章身上，避免用户在“主写作区”和“精修区”之间断掉上下文。

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
- pnpm `>= 10.6`
  推荐直接使用仓库声明的 `pnpm@10.6.0`
- 至少一组可用的 LLM API Key
  也可以先把项目跑起来，再在页面里配置
- 如果你要完整体验知识库 / RAG，再额外准备可用的 Qdrant

### 1. 安装依赖

```bash
pnpm install
```

默认的 `pnpm install` 现在只准备 Web / Server 开发所需依赖，不会在首次安装时强制下载 Electron 桌面运行时。

- 如果你只是运行现有 Web / Server 开发流，到这里就够了
- 如果你要启动桌面端开发壳，首次运行 `pnpm dev:desktop` 时会自动补拉 Electron 运行时
- 如果你想提前完成这一步，也可以手动执行：

```bash
pnpm run prepare:desktop-runtime
```

桌面端运行时首次下载需要可访问 Electron 分发源的网络环境；如果你所在网络无法访问 GitHub Releases，建议先配置代理或镜像后再执行桌面端命令。

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
提交 Pull Request 即表示你确认自己有权提交该内容，并已阅读且同意 [CLA.md](./CLA.md)；如果包含第三方代码、素材、AI 生成内容或其他受许可证约束的内容，请在 PR 中明确说明来源和许可证。详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 致谢

感谢提交修复 Pull Request 的贡献者 [@ystyleb](https://github.com/ystyleb)。


## 说明

- 这是一个持续快速迭代中的 AI Native 创作系统，功能边界仍在演化。
- README 优先描述当前最值得体验、最能代表方向的能力，而不是列出全部历史实现细节。
- 如果你更关心阶段目标、优先级和后续优化计划，请直接查看 [TASK.md](./TASK.md)。


## 目标：只需要进行书名配置 和 点击确认按钮 即可生成（理想）小说
# 
## License

本项目采用双许可证授权模式：

- 默认情况下，本项目基于 GNU Affero General Public License v3.0 (AGPLv3) 授权，详见 [LICENSE](./LICENSE)；归属与附加说明见 [NOTICE](./NOTICE)。
- 服务型商用：将本项目（或其修改版本）作为后端以 SaaS、托管或其他形式向第三方提供服务，须通过作者获取商业授权许可。
- 请遵守开源协议条款，并在适用场景下取得相应授权。

贡献说明：新贡献默认按 [CLA.md](./CLA.md) 提交，可随项目按 AGPL-3.0-only 分发，并可纳入项目维护者另行提供的商业授权；详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。
