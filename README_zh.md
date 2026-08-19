# Daydream Engine (白日做梦引擎) / AI 小说整本生产与多模态模拟沙盘引擎
一个旨在将人类想象力与故事世界具现化的多功能智能体多模态模拟沙盘。

Languages: [English](README.md) | [简体中文](README_zh.md)

当前开发主线：
`Creative Hub + 自动导演开书 + 本书世界上下文 + 整本生产主链 + 写法引擎`

![Monorepo](https://img.shields.io/badge/Monorepo-pnpm%20workspace-3C873A)
![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB)
![Backend](https://img.shields.io/badge/Backend-Express%20%2B%20Prisma-111827)
![LangChain](https://img.shields.io/badge/AI-LangChain-0EA5E9)
![LangGraph](https://img.shields.io/badge/Agent-LangGraph-7C3AED)
![Editor](https://img.shields.io/badge/Editor-Plate-7C3AED)
![Database](https://img.shields.io/badge/Database-SQLite%20%2B%20Prisma-111827)
![Vector DB](https://img.shields.io/badge/RAG-Qdrant-E63946)

---

## 🌌 项目愿景与路线图：白日做梦的连续谱

白日做梦引擎（Daydream Engine）不是一个普通的“你写一句、AI 补一句”的编辑器外壳。它的核心设计理念是将创意写作与生成看作一个多阶段的“编译”和“沙盘演化”过程：

```mermaid
flowchart LR
    A["灵感火花"] --> B["1. 小说整本生产"]
    B --> C["2. 小说改漫画"]
    C --> D["3. 漫画变分镜剧本"]
    D --> E["4. 分镜生成短剧"]
    E --> F["5. 电影级大片"]
    F --> G["6. 虚拟世界沙盘 (西部世界)"]
    
    style B fill:#bfdbfe,stroke:#2563eb,stroke-width:2px
    style G fill:#fbcfe8,stroke:#db2777,stroke-width:2px
```

1. **小说整本生产 (第一步 - 目前实现最充分的一步)**
   将单句灵感和提示词自动导演，规划出方向、故事结构、动态角色网、事实账本，并提供自动写作、审校、修复与状态回灌的闭环生产链。
2. **小说改漫画**
   提取小说的场景、视觉特征和角色模型表，在保持画面一致性的前提下，自动输出分镜面板并生成连贯的漫画资产。
3. **漫画变成分镜剧本**
   将画面序列和剧情节奏解构为专业级别的影视分镜剧本，包含镜头轨迹、对话旁白、舞台调度与配音指令。
4. **分镜生成短剧 (VellumReel 改编工坊)**
   集成高保真本地语音合成（TTS）、音视频对齐与渲染引擎，将剧本一键合成生成 9:16 竖版视频。
5. **电影级大片**
   向大屏幕演进，扩展本地视频生成模型，提供可控的宏大场景、音轨混合与镜头生成链路。
6. **终极目标：世界沙盘 (虚拟西部世界)**
   将小说里的角色、阵营、地理和物理/法则全部映射到一个演化沙盘（Sandbox）中。在这个虚拟“西部世界”里，智能体拥有长期记忆和动机，在网格上自主交互、做出决策并发生冲突，系统自动记录编年史并源源不断地生成无限故事。

适合**完全不懂写作的新手**走完一本长篇创作并进行视觉延展，也适合研究 AI Native 应用、Agent Workflow、LangGraph 编排和长链路任务的开发者参考。

---

## Windows 桌面版

如果你想直接下载安装运行预编译桌面版：
- 下载入口：[GitHub Releases](https://github.com/winnerineast/GeneralAgent/releases)
- 最新版本页：[Latest Release](https://github.com/winnerineast/GeneralAgent/releases/latest)
- 建议优先下载 `Setup.exe` 安装版；如需免安装运行，可下载 `portable` 便携版。
- 公开介绍站：[GitHub Pages 介绍站](https://winnerineast.github.io/GeneralAgent/) 提供功能预览、模块文档和使用指南。

## 本地 Codex 创作：Ani Book Skill

如果你希望直接在 Codex 的本地工作区中推进创作，可以使用 [Ani Book Skill](https://github.com/ExplosiveCoderflome/ani-book-skill)。它将方向判断、故事发动机、章节推进、审校修复和连续性管理组织为一条可恢复、可追溯的长篇创作流程。

- 需要可视化工作台、模型配置和小说/漫画多模态工坊：使用本仓库。
- 偏好在本地通过 Codex 文件和流程进行无界面纯创作：前往 [Ani Book Skill](https://github.com/ExplosiveCoderflome/ani-book-skill)。

---

## 🛠️ 已实现功能 (What Has Been Done)

### 1. AI 自动导演开书与四种运行模式
- 从一句灵感直接进入自动导演，无需手写设定；系统整理项目设定、对齐书级 framing，生成多套整本方向与标题组。
- 方向不满意时可以局部修订，支持单独重做标题组。
- 四种运行模式：**先准备到可开写**（推荐首本书）、**全书自动成书**、**按范围执行**（全书/前N章/指定卷）、**正文后去 AI 检测与修正**（质量闭环）。
- 智能检查点：遇到配额耗尽或修复失败会主动暂停并保存状态，支持无缝接管与恢复。
- 批量运行后自动确认 pending 角色，角色信息灌回名册以消除后续生成中的一致性漂移。

### 2. Creative Hub 与 Agent Runtime
- 统一创作中枢承载对话、追问、规划、工具调用、任务状态卡片和回合总结。
- 采用 LangGraph 编排，包含 Planner、Tool Registry、Runtime、审批节点和中断恢复链路。
- 状态到达 checkpoint 时自动弹出浏览器系统通知，后台挂机更安心。

### 3. 整本生产主链与章节执行
- 单章运行与整本批量 pipeline 收敛到同一条主链。
- 章节上下文精确筛选参与角色，防止无关角色污染 context。
- 章节执行链覆盖正文生成、AI 审核、质量债务记录、角色状态回灌和下一章入口。
- 限速器按 provider 动态淘汰，彻底解决长时间挂机运行的内存泄漏问题。

### 4. 拆书工作台与角色形象演变
- 角色档案分为简要、标准、深入、完整四档，深度分析会回溯原文片段补全数据。
- **角色形象演变**：按 25% / 50% / 75% / 100% 覆盖率增量扫描出场章节，提取每章外貌和状态，基于快照生成同一角色在不同阶段的形象参考图，保持特征一致。
- 提供双栏阅读、证据回溯、token 预算守卫与稿件诊断。

### 5. 写法引擎与反 AI 规则
- 写法可以从现有文本提取写法特征，沉淀为特征池，逐项启用/停用并实时编译为约束。
- 反 AI 规则减少正文的模板感、叙事解释感和空泛表达。

### 6. 本书世界、角色、知识库联动与 RAG
- 势力图谱、地图、法则等作为背景世界观自动进入章节上下文。
- 拆书结论和知识库文档通过 Qdrant 向量库回灌到规划、续写和正文生成。
- RAG 索引流式并行、chunk hash 去重与 retrieval trace 后端追溯。

### 7. GA-Argus 持久化 Agent 运行时与 PAI 架构
- **工作合同 ($K_t$) 与带验证转向 (Verified Pivoting)**：显式解耦立项核心意图 ($\iota$) 与阶段执行合同 ($o_t, c_t, v_t$)，当遇到严重剧情碰撞或审核卡点时，支持有数据验证的局部大纲转向（Pivot），彻底避免目标漂移或推翻全书。
- **已否决死枝账本 (Falsified Route Ledger)**：自动持久化已经被 Reviewer 打回的错误剧情路线，提炼为结构化负向约束 (`negativePromptConstraint`) 注入上下文，实现**重复踩坑率 0%**。
- **四角色权责状态机 ($M, P, E, R$)**：严格定义 Manager (导演/合同准入)、Planner (拆章/负向注入)、Engineer (撰稿/修文) 与 Reviewer (4级分流质检) 的结构化契约。
- **Daniel Miessler PAI 8 大启示全量融入**：创作者 TELOS 档案驱动意图，用户资产物理隔离 (`protectedUserContent`)，Hot/Warm/Cold 三层记忆管理与确定性防幻觉网关。
- **固定模型运行时自我演化与降本**：随着 $H_t$ 持久化状态沉淀，实测成熟写作波次 Input Token 消耗降低 21%，审查打回救回率达 75%。

### 8. 虚拟世界沙盘模拟 (西部世界沙盘)
- 实现完整的锁步回合制沙盘模拟，反映小说世界的物理与生态法则（详见 [world-sandbox-simulation.md](./docs/design/world-sandbox-simulation.md)）。
- **地球物理与生态**：实时模拟动态温度（纬度/季节/海拔/时角）与基于 Lotka-Volterra 方程的捕食者-猎物动态。
- **角色认知智能体**：包含艾宾浩斯遗忘曲线记忆衰减模型与跨区域谣言扩散模型。
- **行为树与 LLM 调度器**：采用 LOD 2 行为树维护背景角色的饥饿、精力与理智，LOD 1 主角决策交由沙盘 LLM 调度器。
- **剧情张力与一致性审计**：追踪局部与全局张力，通过虚拟镜头审计地理瞬移或已故角色发言等一致性冲突。

### 9. 衍生多模态工坊
- **漫画工作台**：生成分镜与面板，采用确认弹窗防止误触耗额，自动继承角色的视觉资产。
- **VellumReel 短剧生产管线**：将分镜剧本合成为 9:16 竖版短剧。
  - **完全离线渲染**：内置 6 张高精水墨风景画作为离线 Fallback。
  - **本地高保真 TTS**：基于 Kokoro-ONNX v1.0 与 `misaki[zh]` 的 FastAPI 语音服务，支持中英文离线朗读。
  - **声音映射与提示词清洗**：自动映射性别音色（`am_*`/`bm_*` 映射为男声 `zm_yunjian`，`af_*`/`bf_*` 映射为女声 `zf_xiaoxiao`），正则清洗旁白中的角色名与舞台指示。

### 10. PAI 核心基础设施架构 (启示 #1 - #8)
全量落地 Daniel Miessler 的个人 AI 基础设施 (PAI) 架构思想：
- **启示 #1 (确定性优先)**：纯代码词法 JSON 修复 (`tryFixSyntacticJson`) 与 250+ 调用点强转换，节省延迟与 Token。
- **启示 #2 (用户/系统隔离与资产保护)**：非破坏性设置管理与项目备份打包网关。
- **启示 #3 (三层记忆架构)**：确定性 15% Hot / 35% Cold / 50% Warm 预算分配，锁定世界法则与角色红线。
- **启示 #4 (Pipeline 钩子与主动导演)**：异步事件总线 (`PipelineHookRegistry`)，带错误隔离与渲染状态自动恢复。
- **启示 #5 (TELOS 创作者档案)**：10 维创作者画像与 4 大美学预设（修仙、悬疑古风、赛博朋克、都市爽文）。
- **启示 #6 (安全与权限护栏)**：4 级风险护栏，破坏性操作强制双重确认 Token 与自动快照。
- **启示 #7 (CLI 优先与 UNIX 哲学)**：独立 CLI 自动化网关 (`pnpm --filter server run:cli`)，支持 Headless 审计与索引重建。
- **启示 #8 (规格优先与防幻觉)**：定量知识置信度评估，缺少上下文时自动注入 `ALLOW "I DON'T KNOW"`。

### 12. OpenRSI 演化算子引擎与杂交重组
集成 Frontis OpenRSI 递归自我改进 (RSI) 原则，构建标准化文本演化算子：
- **`Draft` 算子**：基于大纲、三层记忆与 TELOS 生成初始章节候选。
- **`Improve` 算子**：基于 `AuditService` 诊断进行无损文风与节奏润色。
- **`Debug` 算子**：对设定碰撞或人设 OOC 进行外科手术式局部修补。
- **`Crossover` 算子 (核心创新)**：解构亲本 A（动作/高潮）与亲本 B（心理/环境）优良基因，杂交重组为更高满意度的新候选。
- **演化算子引擎与 REST API**：提供中央门面 `EvolutionaryOperatorEngine` 与 `/api/novel/director/operators/crossover` 等接口。

### 13. 数字员工团队架构与数字员工基础设施
将 Daydream Engine 从单回合提示词升级为**数字员工团队基础设施**：
- **数字员工 Profile 标准化 (`Identity + Domain + Scope`)**：注册 `novel-director`、`style-auditor`、`crossover-operator` 等角色，明确能力边界与 4 级风险 Scope。
- **长寿 Thread 引擎与 Prompt Cache 优化**：固定 `staticPromptHead` 静态角色头，保证 100% 缓存命中，降低 50%-90% API 成本与 42.5% 延迟。
- **动态 Warm Memory 压缩**：多回合对话自动提炼 `workingMemoryDigest`，控制 Token 膨胀。
- **双层通用阶段 Hand-off 关卡与价值函数 ($V_{\text{handoff}}$)**：
  - **Layer 1 (通用元评估器框架)**：确定性计算 $V_{\text{handoff}} \in [0.0, 1.0]$ 得分。
  - **Layer 2 (载荷驱动公式编译器)**：动态编译 `ValueFormulaSpec` 规则与硬约束。
  - **防篡改证书**：通关产生带 SHA256 签名证书；轻微扣分自动触发 `AUTO_REPAIR`。
- **配额感知全自动无看守恢复调度器 (Module 2)**：遇到 429 或配额耗尽自动进入 `QUOTA_COOLING`，后台 Heartbeat Worker 自动恢复运行。
- **持久化 Agent 可执行 Todo 看板引擎 (Module 3)**：基于 SQLite 数据库 (`AgentExecutableTodo`)，提供原子抢占、凭证完工与死锁自愈。
- **OpenRSI 演化算子证据追踪日志 (Module 4)**：记录 AI 谱系树 (`getChapterMutationLineage`)、防退化回滚护栏与精英向量 RAG 反馈回路。
- **经验自动化 Benchmark**：包含完整测试脚本验证 Prompt Head 匹配、双层 Gate、自动唤醒、看板抢占与突变日志。

### 14. 国际化 (i18n) 多语言支持
- 前端深度集成 `i18next` 与 `react-i18next`，UI 界面、日志、页面标签与设置路由支持中英文无缝切换并本地持久化。

---

## 🔮 未来规划 (Future Vision)

随着项目从小说写作引擎演进为完整的 **Daydream Engine**，未来的开发重点集中在深化**数字员工团队**与**循环工程内核**：

### 🎭 阶段 1：无缝衍生改编 (小说 ➔ 漫画 ➔ 短视频)
- **跨模态 Hand-off Gate**：将 Hand-off 关卡扩展至校验小说章节 $\rightarrow$ 分镜脚本 $\rightarrow$ 视觉资产。
- **多模态持久化看板**：扩展 Durable Executable Todos 跟踪图像生成、TTS 语音与视频渲染。
- **持久化视觉 Style Sheet**：建立角色脸型、发型、服装的跨图/跨视频一致性规范。

### 🎬 阶段 2：分镜剧本 ➔ 电影级大片
- **视频渲染证据日志**：记录音视频渲染参数与美学得分，支持失败自动回滚。
- **影视级管线扩展**：扩展本地渲染管线（VellumReel）支持宽屏 (16:9, 2.39:1) 与多轨音效剪辑。

### 🗺️ 阶段 3：可视化西部世界控制台与阵营对抗
- **长寿 Agent 团队沙盘**：结合数字员工 Profile 与长寿 Thread，支持数十个 Agent 在沙盘中长期自洽互动。
- **可视化西部世界控制台**：构建 Web 端地理网格、阵营边界与动态角色定位图。

---

## 🚀 技术运行指南

### 环境要求

- **Node.js**: `^20.19.0 || ^22.12.0 || >=24.0.0` (推荐 `20.19.x LTS`)
- **pnpm**: `>= 10.6.0` (推荐声明的 `pnpm@10.6.0`)
- **LLM API Key**: 至少配置一个提供商（OpenAI, DeepSeek, SiliconFlow, xAI 等），可在启动后在页面配置。
- **Qdrant**: 可选，仅在开启知识库 / RAG 检索时需要。
- **VellumReel 视频管线要求**：
  - Python `^3.10`
  - 系统配置好 FFmpeg（用于视频合成与字幕）
  - ONNX runtime 依赖（本地 FastAPI TTS 服务首次运行会自动下载 Kokoro 模型权重）

### 1. 安装依赖
```bash
pnpm install
```

*注意: 默认 `pnpm install` 仅安装 Web 与 Server 依赖，不会自动下载 Electron 运行时。*
- 如果只运行 Web/Server 流程，这就足够了。
- 如果需要运行桌面端外壳，首次运行 `pnpm dev:desktop` 时会自动下载 Electron。
- 你也可以手动预拉取 Electron 运行时：
  ```bash
  pnpm run prepare:desktop-runtime
  ```

#### Windows 下 Prisma 安装故障排查:
如果在 Windows 上 `pnpm install` 卡在 `prisma preinstall`，请检查：
1. **Node 版本**: Prisma 7 要求 Node `^20.19.0 || ^22.12.0 || >=24.0.0`。
2. **Script-shell 设置**: 如果 npm/pnpm 的 script-shell 被设为交互式终端（如 `cmd.exe /k`），Prisma 预安装脚本会挂起。请检查：
   ```bash
   node -v
   pnpm config get script-shell
   npm config get script-shell
   ```
   如果返回包含 `/k`，请删除并重启终端：
   ```bash
   npm config delete script-shell
   pnpm config delete script-shell
   ```
   然后重新运行 `pnpm install`。

---

### 2. 配置环境变量

项目结构采用 Monorepo 隔离，配置加载如下：
- 后端运行在 `server/` 工作区，读取 `server/.env`。
- 前端运行在 `client/` 工作区，读取 `client/.env` 或 `client/.env.local`。
- 根目录 `.env.example` 仅作为聚合参考。

#### 2.1 后端环境变量配置
复制后端示例文件：
```bash
# macOS / Linux
cp server/.env.example server/.env

# Windows PowerShell
Copy-Item server/.env.example server/.env
```
`server/.env` 中的核心配置：
- `DATABASE_URL`: 默认指向本地 SQLite (`file:../prisma/dev.db`)，开箱即用。
- `RAG_ENABLED`: 未启动 Qdrant/RAG 时请设为 `false`。
- `QDRANT_URL` / `QDRANT_API_KEY`: 仅在开启 RAG 时填写。
- API Keys (`OPENAI_API_KEY`, `DEEPSEEK_API_KEY` 等) 可先留空，后续在 Web UI 页面配置。

#### 2.2 前端环境变量配置
默认情况下 Vite 开发服务器会自动将请求映射到 `http(s)://[当前主机名]:3000/api`，局域网开发无需额外配置。仅当前后端分离部署时才需复制配置：
```bash
# macOS / Linux
cp client/.env.example client/.env

# Windows PowerShell
Copy-Item client/.env.example client/.env
```

#### 2.3 在 UI 页面配置模型
无需在 `.env` 中硬编码模型，可在运行后在页面直接管理：
- `/settings`: 配置 API Key，测试连通性。
- `/settings/model-routes`: 为规划、正文、审阅不同任务分配不同模型。
- `/knowledge?tab=settings`: 管理 Embedding 提供商、集合与重建计划。

---

### 3. 启动开发环境

#### 方式 A：一键启动（全量服务）
```bash
pnpm dev
```
同时启动 shared 编译器、Express 后端服务与 Vite 前端客户端。

#### 方式 B：分步启动（推荐 macOS 调试）
打开三个独立的终端窗口：
1. **终端 1: Shared 编译**
   ```bash
   pnpm dev:shared
   ```
2. **终端 2: 后端服务**
   ```bash
   pnpm dev:server
   ```
   (运行在 `http://localhost:3000`，启动时自动生成 Prisma Client 并应用 DB 迁移)。
3. **终端 3: 前端客户端**
   ```bash
   pnpm dev:client
   ```
   (运行在 `http://localhost:5173`)。

#### 方式 C：后台服务管理脚本 (macOS 脚本)
在 [scripts/manage.sh](./scripts/manage.sh) 提供了服务管理辅助脚本：
- **启动所有后台服务**: `./scripts/manage.sh start`
- **停止所有后台服务**: `./scripts/manage.sh stop`
- **查看服务状态**: `./scripts/manage.sh status`
- **重启服务**: `./scripts/manage.sh restart`

#### 方式 D：本地离线 TTS 服务 (用于 VellumReel 视频配音)
进行离线语音合成（首次运行会自动安装 ONNX/Kokoro）：
```bash
python scripts/start-local-tts.py
```

#### 默认访问入口:
- 前端客户端: `http://localhost:5173`
- 后端 API 服务: `http://localhost:3000`
- API Endpoint: `http://localhost:3000/api`
- 本地 TTS 服务: `http://localhost:8000`

---

### 4. SenseNova 本地多模态图片模型配置 (可选)

系统支持基于本地 Ollama 运行 `SenseNova-U1-8B-MoT-Infographic-V3` 模型进行离线图片微调与文字气泡生成。

#### 4.1 安装 Ollama 并拉取模型
1. 安装 [Ollama](https://ollama.com/)。
2. 手动拉取 SenseNova 模型，或由服务端在首次调用时自动拉取：
   ```bash
   ollama pull sensenova-u1:8b-v3
   ```

#### 4.2 硬件自诊断与性能分级
服务端启动时会自动诊断显存/内存并划定性能等级：
- **Tier 1 (显卡强力加速)**: 显存 $\ge$ 15GB 或 Mac 统一内存 $\ge$ 32GB。使用 BF16/FP16 生成（约 8 秒）。
- **Tier 2 (显卡中度加速)**: 显存 6GB–14GB 或 Mac 统一内存 16GB–24GB。使用 INT8/INT4 模型（约 30 秒）。
- **Tier 3 (CPU 纯本地)**: 无 GPU 加速，使用 CPU 计算（约 1.5 - 3 分钟）。

若启动时无法连通 `11434` 端口，系统会自动拉起 Ollama 服务。

#### 4.3 运行 SenseNova 测试
- **运行本地推理测试**:
  ```bash
  pnpm --filter @ai-novel/server test
  # 或直接运行 SenseNova 测试脚本：
  node --test server/tests/sensenovaLocalInference.test.js
  ```
- **运行 E2E API 模拟集成测试**:
  在主服务 (`pnpm dev`) 运行时执行，模拟图片修改、本地 API 调用与视频渲染：
  ```bash
  node server/scripts/test-e2e-api-simulation.js
  ```

---

### 5. Qdrant Cloud 云数据库配置 (可选)

如需开启 RAG，请在 `server/.env` 中设置 `RAG_ENABLED=true` 并按如下步骤配置：
1. 注册 [Qdrant Cloud](https://cloud.qdrant.io/)。
2. 创建 Cluster（免费版即可）。
3. 复制 Cluster URL 和 API Key。
4. 填入 `server/.env`:
   ```env
   QDRANT_URL=https://your-cluster.region.cloud.qdrant.io:6333
   QDRANT_API_KEY=your_database_api_key
   ```
5. 在 Web 页面中配置 Embedding 模型 (`知识库 -> 向量设置`)。

通过 curl 验证连通性：
```bash
curl -X GET "https://your-cluster.region.cloud.qdrant.io:6333" \
  --header "api-key: your_database_api_key"
```

---

### 6. SearXNG 本地 Docker 开源搜索引擎配置 (美股热点抓取可选)

美股投研 Agent 深度集成了本地运行在 Docker 容器中的开源元搜索引擎 **SearXNG**（运行在 `http://127.0.0.1:8080`），实现美股盘前新闻与个股催化剂的自动检索。

```bash
# 方式 1：Docker 一键快捷运行（推荐 8088 端口映射，避免 8080 被占用）
docker run -d \
  --name searxng \
  -p 8088:8080 \
  -v $(pwd)/scratch/searxng/settings.yml:/etc/searxng/settings.yml:ro \
  searxng/searxng:latest

# 环境变量 (可选，默认 http://127.0.0.1:8088)
# SEARXNG_URL=http://127.0.0.1:8088

# 运行连通性测试
node server/scripts/runSearXNGTest.cjs
```
- **零中断降级保护**：当 SearXNG 容器未启动时，系统会自动平滑降级为“存量知识图谱模式”，保障主服务稳定运行。

---

## 🏗️ 技术栈与架构

### 技术栈

| 层级 | 技术 |
| --- | --- |
| **前端** | React 19 + Vite + React Router + TanStack Query + Plate 编辑器 |
| **后端** | Express 5 + Prisma 7 + Zod |
| **AI 编排** | LangChain + LangGraph |
| **数据库** | SQLite (主库) + Qdrant (向量库/RAG) |
| **工程形态** | pnpm workspace Monorepo (pnpm@10.6.0) |
| **桌面端** | Electron (electron-builder 打包) |
| **Node 版本** | `^20.19.0 \|\| ^22.12.0 \|\| >=24.0.0` |

### Monorepo 目录结构

```text
GeneralAgent/
├── client/          # React + Vite 前端 (@ai-novel/client)
├── server/          # Express + Prisma + Agent 运行时 (@ai-novel/server)
├── shared/          # 共享类型与契约 (@ai-novel/shared)
├── desktop/         # Electron 桌面端外壳 (@ai-novel/desktop)
├── docs/            # 设计文档、发布日志与归档
├── images/          # 架构图、截图与视觉资产
├── scripts/         # 开发与构建管理脚本
├── infra/           # 基础设施配置 (Docker 等)
└── .github/         # CI/CD 工作流
```

*详细的代码文件统计与审计见 [docs/sourcegraph/project-source-audit.md](./docs/sourcegraph/project-source-audit.md)。*

---

### 核心架构支柱

为保证长篇故事的连续性与一致性，系统依托五大架构支柱：

| 支柱 | 机制 |
| :--- | :--- |
| **物理记忆 (Physical Memory)** | 定期将激活的剧情与摘要序列化至 `docs/story_board.json` 与 `docs/story_ledger.md`，防止上下文漂移并支持崩溃恢复。 |
| **分支隔离 (Worktree)** | 在 `ChapterDraft` 数据库中隔离草稿缓冲区，在事务性 `mergeAndCommit` 前通过 `WorktreeManager` 隔离并行编辑会话。 |
| **辩论审校 (Debate Auditing)** | `EditorAgent` 对照 Zod 校验 Schema 检查文本，返回结构化修改建议或拦截缺陷文本生成。 |
| **自检心跳 (Self-Checking Heartbeat)** | 后台诊断器自动检查全局叙事冲突，将预警打印至 `docs/STORY_TASKS.md`。 |
| **驾驶舱控制台 (Cockpit Console)** | 实时展示 Agent 运行状态、模型健康评级、预警标记与实时辩论日志的仪表盘。 |

---

## 🎨 功能预览与截图

### 创作中枢 (Creative Hub)
统一承载对话、规划与任务运行步帧的创作控制台。
![创作中枢](./images/创作中枢.png)

### 提示词编辑器 (Prompt Editor)
调试与维护系统提示词、变量与槽位规则的交互界面。
![提示词编辑器](./images/ScreenShot_2026-07-08_140153_328.png)

### 自动导演模式
包含项目 Setup、标题候选组与定制 Framing 的开书界面。
![导演创建](./images/导演模式-创建.png)
![导演生成中](./images/导演模式-创建中.png)

### 卷战略与拆章
可视化卷结构布局与目标章节大纲拆解。
![卷战略](./images/write/卷战略.png)
![章节拆解](./images/write/节奏拆章.png)

### 漫画与视频衍生工坊
从已生成小说提取资产并一键渲染 9:16 竖版视频的多模态工坊。
![漫画工坊](./images/漫画工坊.png)
![视频工坊](./images/视频工坊.png)

---

## 🗺️ Roadmap 路线图
- **P0**: 核心稳定性、上下文记忆优化、检查点恢复与一致性检查。
- **P1**: 完善改编编译器管线 (小说 $\rightarrow$ 漫画 $\rightarrow$ 分镜剧本 $\rightarrow$ 短视频)。
- **P2**: 推出西部世界沙盘框架：阵营网格、自主角色模拟与动态编年史记录。

## 💬 社区与交流
如需反馈问题、讨论 LLM 路由、自动导演或多模态合成，欢迎加入 QQ 交流群：

![QQ 群](./images/群2.png)

## 开源协议 (License)
本项目采用双重许可模式：
- 默认协议: **GNU Affero General Public License v3.0 (AGPLv3)**。详见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE)。
- Commercial / SaaS 商业授权: 托管或向第三方提供本引擎的修改版本服务需要获取商业授权。贡献条款请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md) 与 [CLA.md](./CLA.md)。
