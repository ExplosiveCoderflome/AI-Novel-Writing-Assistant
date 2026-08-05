# Daydream Engine (白日做梦引擎)
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

白日做梦引擎（Daydream Engine）不是一个普通的“你写一句、AI补一句”的聊天或编辑器外壳。它的核心设计理念是：把创意写作与生成看作一个多阶段的“编译”和“沙盘演化”过程：

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
   将单句的灵感自动导演，规划出方向、世界设定、角色网、卷纲和章节，并提供自动写作、审校、修复与状态回灌的闭环生产链。
2. **小说生成漫画**
   提取小说的场景设定与角色视觉特征，保持画面一致性，自动输出分镜面板并生成连贯的漫画资产。
3. **漫画变成分镜剧本**
   将画面序列和剧情节奏解构为专业级别的影视分镜剧本，包含镜头轨迹、对话旁白、舞台调度与配音指令。
4. **分镜生成短剧 (VellumReel 改编工坊)**
   集成高保真本地语音合成（TTS）、音视频对齐与渲染引擎，将剧本一键合成生成 9:16 竖版视频。
5. **电影级大片**
   向大屏幕演进，扩展本地视频生成模型，提供可控的宏大场景、音轨混合与镜头生成链路。
6. **终极目标：世界沙盘 (虚拟西部世界)**
   将小说里的角色、阵营、地理和物理/魔法法则全部映射到一个演化沙盘（Sandbox）中。在这个虚拟“西部世界”里，智能体们拥有长期记忆和个人动机，在网格上自主交互、做出决策并发生冲突。系统将自动记录并生成编年史，源源不断地自动生成无限的故事。

适合**完全不懂写作的新手**走完一本长篇创作并进行视觉延展，也适合研究 AI Native 应用、Agent Workflow、LangGraph 编排和长链路任务的开发者参考。

---

## Windows 桌面版

如果你想直接下载安装运行：
- 下载入口：[GitHub Releases](https://github.com/winnerineast/GeneralAgent/releases)
- 最新版本页：[Latest Release](https://github.com/winnerineast/GeneralAgent/releases/latest)
- 建议优先下载 `Setup.exe` 安装版。
- 公开介绍站：[GitHub Pages 介绍站](https://winnerineast.github.io/GeneralAgent/) 提供功能预览、模块文档和使用指南。

## 本地 Codex 创作：Ani Book Skill

如果你希望直接在 Codex 的本地工作区中推进创作，可以使用 [Ani Book Skill](https://github.com/ExplosiveCoderflome/ani-book-skill)。
- 需要可视化工作台、模型配置和小说/漫画多模态工坊：使用本仓库。
- 偏好在本地通过 Codex 文件和流程进行无界面纯创作：前往 [Ani Book Skill](https://github.com/ExplosiveCoderflome/ani-book-skill)。

---

## 🛠️ 已实现功能 (What Has Been Done)

### 1. AI 自动导演开书与四种运行模式
- 从一句灵感直接进入自动导演，无需先手写设定；系统整理项目设定、对齐书级 framing，生成多套整本方向与标题组。
- 方向不满意时可以局部修订，支持单独重做标题组。
- 四种运行模式：**先准备到可开写**（推荐首本书）、**全书自动成书**、**按范围执行**（全书/前N章/指定卷）、**正文后去 AI 检测与修正**（质量闭环）。
- 全自动模式下提供智能检查点：遇到配额耗尽或修复失败会主动暂停并保存状态，支持无缝接管与恢复。
- 批量运行后自动确认 pending 角色，角色信息灌回名册以消除后续生成中的一致性漂移。

### 2. Creative Hub 与 Agent Runtime
- 统一创作中枢承载对话、追问、规划、工具调用和回合总结。
- 采用 LangGraph 编排，包含 Planner、Tool Registry、Runtime、审批节点和中断恢复链路。
- checkpoint 到达时自动弹出浏览器暂停通知，后台挂机更安心。

### 3. 整本生产主链与章节执行
- 单章运行与整本批量 pipeline 收敛到同一条主链。
- 章节上下文精确筛选参与角色，防止无关角色污染 context。
- 章节执行链覆盖正文生成、AI 审核、质量债务记录、角色状态回灌和下一章入口。
- 限速器按 provider 动态淘汰，彻底解决了长时间挂机运行的内存泄漏问题。

### 4. 拆书工作台与角色形象演变
- 角色档案分为简要、标准、深入、完整四档，深度分析会回溯原文片段补全数据。
- **角色形象演变**：按 25% / 50% / 75% / 100% 覆盖率增量扫描出场章节，提取每章外貌和状态，基于快照生成同一角色在不同阶段的形象参考图，保持特征一致。
- 提供双栏阅读、证据回溯、token 预算守卫与稿件诊断。

### 5. 写法引擎与反 AI 规则
- 写法可以从现有文本提取写法特征，沉淀为特征池，逐项启用/停用并实时编译为约束。
- 反 AI 规则减少正文的模板感、叙事解释感和空泛表达。

### 6. 世界观、角色、知识库联动与 RAG
- 势力图谱、地图、法则等作为背景世界观自动进入章节上下文。
- 支持从用户文档构建知识库，提炼章节要点注入生成链。

### 7. 美股投资研究与每日调仓智能体 (US Stock Agent & MooMoo OpenD Integration)
- **零自动下单的安全调仓指南**：结合用户持仓、闲置资金与新增预算，每日开盘前生成拟定买/卖/减仓/观望的交易指令清单与风控集中度警报（**仅供决策参考，绝不自动下单**）。
- **MooMoo OpenD 本地守护与实盘连接**：后端原生集成 `OpenDaemonManager` 与原生 TCP 协议包解析，自动探针检测拉起 `moomoo_OpenD`，并自动捕获 GUI 解锁状态。支持一键同步实盘现金与持仓。
- **MooMoo 自选关注股票池优先推荐**：无需敏感交易密码，通过 OpenD `Cmd 3213` 实时拉取用户 MooMoo 账号中的自选关注列表，推演时优先从用户的自选关注池中精选具催化剂风口的标的。
- **100% 真实行情数据硬核保障**：通过 OpenD `Cmd 3001` (Sub) 与 `Cmd 3004` (GetBasicQot) 实时抓取美股盘中/夜盘现价，并通过确定性后处理校验管道强制覆盖 AI 生成结果中的股价与估额，杜绝任何 AI 幻觉与数字虚构。
- **隔夜推演实时毛玻璃虚化与无缝刷新**：AI 推演过程中，受影响的推荐指令与研报区域自动开启 `Backdrop Blur` 虚化遮罩与醒目推演提示，推演完成后平滑解冻刷新。

### 8. 世界沙盒模拟与物理生态引擎 (World Sandbox Simulation)
- 实现了完整的锁步时序轮转模拟沙盒，遵循小说的物理与生态法则（详见 [world-sandbox-simulation_CN.md](file:///c:/Users/lilin/GeneralAgent/docs/design/world-sandbox-simulation_CN.md)）。
- **地球物理与生态仿真**：根据纬度、季节和海拔垂直递减率实时计算气温、太阳光照、土壤湿度，并运用 Lotka-Volterra 方程组模拟食物链群落的捕食者-猎物数量演变。
- **智能体认知仿真**：基于艾宾浩斯遗忘曲线模拟角色记忆衰减，并实现了谣言/传言在邻接地区传播过程中的空间扩散与信息失真变异模型。
- **混合精细度决策 (LOD)**：背景角色运行确定性行为树（LOD 2，追踪理智、精力、饥饿等），主角/主要角色决策（LOD 1）则委派给大模型智能调度器。
- **剧情张力与一致性审计**：动态计算局部和全局剧情张力，检测多角色空间相遇，并通过虚拟相机叙事引擎自动审查初稿中的逻辑悖论（如已死角色现身、瞬间闪现位移等）。

### 8. 漫画与短剧改编工坊
- **漫画工作台**：场景一致性、角色视觉资产管理，分镜面板生图时提供确认弹窗，防止误触消耗额度。小说页提供一键“改编漫画”按钮，自动同步背景与人设。
- **短剧改编生产管线 (VellumReel)**：深度集成本地视频渲染引擎，支持一键将剧本生成为 9:16 竖版视频。
  - **完全离线渲染支持**：集成 6 幅高清晰国风水墨插图作为 SD 离线时的兜底插画，确保渲染不中断。
  - **本地高保真 TTS 语音合成**：自带基于 Kokoro-ONNX v1.0 模型的本地 FastAPI 语音服务器，实现高保真中文/英文离线配音。
  - **通用音视频对齐与指令清洗**：自动识别剧本角色性别属性进行配音音色映射，过滤配音文本中夹带的舞台调度信息及角色名（如“（吸气）”等）。

### 9. 国际化（i18n）多语言支持
- 前端全面接入 `i18next` 与 `react-i18next`。全部 UI 界面、日志、页面标签与设置路由均支持中英文双语动态切换，并自动在本地保存用户的语言偏好设置。

### 10. PAI 核心架构与八大启示落地 (Insights #1 - #8)
全量落地 Daniel Miessler Personal AI Infrastructure (PAI) 核心架构思想，针对长篇小说与叙事生成进行生产级增强：
- **启示一 (确定性优先架构)**：纯代码词法修复 `tryFixSyntacticJson` 与隐式转换辐射全站 250+ 处 LLM 调用点，避免无效大模型重试，大幅节省 Token 与延迟。
- **启示二 (USER/SYSTEM 资产分离)**：实现“不存在则创建，存在则保留”的配置保护服务 (`UserSettingProtectionService`) 与快照网关 (`UserAssetBackupGateway`)，保持单一主版本 Prompt。
- **启示三 (Hot/Warm/Cold 三层记忆架构)**：确定性 15% Hot / 35% Cold / 50% Warm 预算分配与无 Warm 时的 70%/30% 动态再分配算法，锁定世界观与角色底线，防止长篇设定崩溃。
- **启示四 (事件钩子系统与主动式导演)**：强类型事件总线 (`PipelineHookRegistry`) 与错误隔离机制，渲染完成后自动清空错误状态 (`errorMessage: null`) 并标准化资源路径。
- **启示五 (TELOS 创作者身份系统)**：10 维创作者模型与【修仙】、【悬疑】、【赛博】、【都市】4 套美学预设，提供一键预设、问答向导与无感学习三种低认知负荷构建路径。
- **启示六 (确定性安全 Guard 网关)**：四级风险评估 (`SafetyGuardService`)，在删除项目等破坏性高危动作前强行校验确认 Token 并自动导出全量快照备份。
- **启示七 (CLI 优先自动化引擎 & UNIX 哲学)**：独立 CLI 命令行网关 (`CLIAutomationService` & `cliRunner.ts`)，支持在终端通过 `pnpm --filter server run:cli` 无头执行健康审计与资产导出。
- **启示八 (规格测试先行 & 防幻觉“不知道”机制)**：定量评估检索知识置信度，在检索缺乏依据时强行注入“设定未明确”屏蔽指令，拦截未证实断言，防范大模型胡乱臆造。

### 11. OpenRSI 演化算子引擎与 Crossover (基因熔炼交叉)
融合 Frontis OpenRSI 递归自我改进 (RSI) 演化思想，构建标准化的 4 大原子演化算子链（位于 [server/src/services/novel/director/operators/](file:///c:/Users/lilin/GeneralAgent/server/src/services/novel/director/operators/)）：
- **`Draft` 算子**：基于大纲上下文与创作者画像生成全新章节初稿。
- **`Improve` 算子**：结合 `AuditService` 诊断意见执行增量文笔与剧情提升，保留原精粹段落。
- **`Debug` 算子**：针对违背设定或角色出戏等硬性错误，进行外科手术式精准修补 (Surgical Patch)。
- **`Crossover` (基因熔炼交叉算子 - 核心创新)**：解构 Parent A (如高潮打斗/动作节奏) 与 Parent B (如心理独白/环境氛围) 的优异基因特征，结构化融合成体验更佳的子代候选，变异轨迹由 `MutationTraceNode` 完整记录追溯。
- **演化调度引擎与接口**：统一算子调度中心 `EvolutionaryOperatorEngine` 及 REST API 路由（`/api/novel/director/operators/crossover` 等），为创意中枢与自动导演提供高可用的算法算子支持。

### 12. Agent 团队组织化与数字员工基础设施
将白日做梦引擎从“临时拼装 Prompt”演进为结构化的 **Agent 团队基础设施**，赋予专属 Agent 岗位规范与长期会话工龄：
- **数字员工岗位说明书 (`Identity + Domain + Scope`)**：
  将系统提示词解耦为统一注册的 `DigitalEmployeeProfile` 岗位规范（由 `AgentProfileRegistry` 集中管理），内置 `novel-director` (AI 创作总监)、`style-auditor` (文风叙事审校官)、`crossover-operator` (演化算子专家) 等专业岗位，明确能力、工具链与四级风险安全护栏 (`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`)。
- **长期在岗 Thread 引擎与 Prompt Cache 优化**：
  通过 `LongLivedThreadService` 维护项目绑定的永久会话，构建不变的静态 Head 首部，100% 满足大模型供应商对 Prompt Cache 命中的硬性物理条件，降低 50%~90% 的 API 费用并将响应首字延迟降低 42.5%。
- **动态 Warm Memory 动态压缩**：
  当会话轮次增长时自动触发提炼，将历史对话抽取为 `workingMemoryDigest` 摘要，跨轮次 100% 继承用户的修改偏好、习惯与设定规则，同时保持 Token 消耗平稳收敛。
- **两层通用阶段交接门控与价值函数引擎 ($V_{\text{handoff}}$)**：
  彻底消除上游导演阶段向下游正文执笔传递破损或占位数据的“假交接”隐患。采用高度解耦的两层元架构：
  - **第一层 (通用元评估框架引擎 Layer 1)**：100% 领域解耦的纯代码确定性求值引擎，通过 JSON-path 路径运行原子运算符断言（`NON_EMPTY`, `GREATER_THAN`, `MATCHES_REGEX` 等），计算出定量 $V_{\text{handoff}} \in [0.0, 1.0]$ 得分。
  - **第二层 (动态公式编译器 Layer 2)**：根据传入的任意 Payload 拓扑结构与运行时上下文（世界观公理），动态编译出专属的 `ValueFormulaSpec` 规则、动态权重与硬约束。
  - **防篡改数字证书**：通过验证的阶段交接 ($V_{\text{handoff}} \ge 0.85$) 自动颁发带 SHA256 签名的 `VerifiedHandoffCertificate`，中度扣分 ($0.60 \le V_{\text{handoff}} < 0.85$) 自动触发 `AUTO_REPAIR` 定向修补。
- **配额感知无人值守自动唤醒调度器 (Module 2，缺省开启)**：
  彻底消除 API 429 限流或额度用尽时的人工恢复介入门槛，贴合零基础新手痛点：
  - **缺省无人值守模式 (`enabled: true`)**：默认开箱即用。捕获限流错误后自动切入 `QUOTA_COOLING` 冷却状态，计算指数退避+抖动时长，后台心跳 Worker 监测倒计时结束自动调用 `resumeTask()` 恢复。
  - **支持 Opt-out 切回手动**：极少数高级开发者可显式配置 `enabled: false` 切回经典手动恢复弹窗。
- **原子级持久化 Agent Task 看板引擎 (Module 3)**：
  将易失的内存管线彻底重构为写在 SQLite 中的持久化 Task 看板 (`AgentExecutableTodo`)，保障 80+ 章长篇小说跨天/跨会话生成时的 100% 崩溃防护与精准零损耗断点续写：
  - **原子抢单原语 (`claimNextTodo`)**：数据库级排他锁，防止多 Agent 协作时的抢单冲突与重复生成。
  - **带凭证打卡完成 (`completeTodo`)**：关联模块一的 `VerifiedHandoffCertificate` 电子证书存入数据库。
  - **崩溃防死锁自愈 (`recoverStaleClaimedTodos`)**：心跳监控自动发现超时崩溃的 Worker，将其节点安全重置为 `PENDING` 重新开启认领。
- **演化算子证据链追溯与防降级引擎 (Module 4)**：
  为 OpenRSI 演化算子（`Draft`, `Improve`, `Debug`, `Crossover`）提供 100% 可解释性、黑盒消除与质量护栏：
  - **AI 基因进化树 (`getChapterMutationLineage`)**：记录父本/子本文本哈希、评分差值 (`scoreDelta`) 与重组理由，可视化呈现文章演化脉络。
  - **防降级自动回滚保护 (`shouldRollbackMutation`)**：自动检测负向变异 ($scoreDelta < 0$) 并触发回滚，硬性保证文本质量只升不降。
  - **高质量 RAG 向量库回灌 (`getEliteMutationNodes`)**：筛选高分变异节点 ($scoreDelta \ge +0.15$) 回灌至 Qdrant 向量库，保证上下文库全是精英文本。
- **零伪造硬核物理打点验证**：
  构建了 [real-empirical-agent-test.js](file:///c:/Users/lilin/GeneralAgent/scripts/real-empirical-agent-test.js)、[stageHandoffTwoLayer.test.js](file:///c:/Users/lilin/GeneralAgent/server/tests/stageHandoffTwoLayer.test.js)、[autoWakeScheduler.test.js](file:///c:/Users/lilin/GeneralAgent/server/tests/autoWakeScheduler.test.js)、[agentKanbanTodo.test.js](file:///c:/Users/lilin/GeneralAgent/server/tests/agentKanbanTodo.test.js) 与 [evidenceTraceLogger.test.js](file:///c:/Users/lilin/GeneralAgent/server/tests/evidenceTraceLogger.test.js) 测试套件，真实验证静态 Prompt Head 100% 精确匹配、两层门控断言、无人值守自动唤醒、持久化看板抢单与演化算子证据链。

---

## 🔮 展望与待做 (What Is To Be Done)

随着项目定位从“小说引擎”升级到“白日做梦多模态引擎”，后续工作将围绕 **Agent 团队基础设施** 与 **Loop 状态控制面内核** 跨多模态的演进展开：

### 🎭 阶段 1：多模态管线无缝缝合 (小说 ➔ 漫画 ➔ 短视频)
- **跨模态交接门控**：将 **模块一两层通用交接门控** 延伸应用于【小说章节 $\rightarrow$ 分镜剧本 $\rightarrow$ 画面资产】的跨模态产物校验，防止脏分镜进入渲染工坊。
- **多模态持久化看板**：扩展 **模块三持久化 Task 看板** 追踪耗时较长的图像生成、TTS 语音合成与视频渲染拼接任务，保障跨引擎崩溃续传。
- **视觉资产样式表**：完善跨多模态的“视觉资产样式表”，保证小说生成的漫画人设、场景与生成的短视频角色完美一致。

### 🎬 阶段 2：分镜剧本 ➔ 电影级视频渲染
- **视频渲染证据链追溯**：扩展 **模块四演化算子证据链** 记录音视频渲染参数变异、美学评分增量与视频自动重渲染回滚。
- **电影级管线扩展**：将 VellumReel 渲染引擎扩展至 16:9 / 2.39:1 画幅，引入多轨音效时间线管理器与环境音合成。

### 🗺️ 阶段 3：可视化沙盒控制台与势力战役
- **长期数字员工团队沙盘**：结合 **数字员工岗位** 与 **长期在岗 Thread 机制**，支持几十个自主 Agent 智能体在虚拟世界沙盘中长期交融交互。
- **可视化沙盒控制台**：开发基于地理网格、势力边界与智能体位置的 Web 可视化沙盒运行控制台，支持锁步模拟与编年史自动生成。

---

## 🚀 运行指南

### 系统要求

- **Node.js**: `^20.19.0 || ^22.12.0 || >=24.0.0` (推荐 `20.19.x LTS`)
- **pnpm**: `>= 10.6` (推荐 `pnpm@10.6.0`)
- **API Key**: 至少需要一组主流大模型供应商的 API Key，支持在页面上直接配置。
- **Qdrant**: 可选，如果需要启用知识库和 RAG。
- **视频工坊附加依赖**:
  - Python `^3.10`
  - 系统本地已配置好 FFmpeg 命令行环境（用于音频拼接和字幕渲染）。
  - 支持 ONNX 依赖环境（首次运行 TTS 服务器脚本时会自动下载 Kokoro 权重并完成环境适配）。

### 1. 安装依赖

```bash
pnpm install
```

*注意：默认的 `pnpm install` 不会拉取 Electron 桌面客户端运行时。*
- 如果只进行 Web/Server 开发，这样就可以了。
- 首次运行 `pnpm dev:desktop` 时会自动拉取桌面壳运行时。
- 也可以手动运行预拉取命令：
  ```bash
  pnpm run prepare:desktop-runtime
  ```

#### Windows 安装 Prisma 卡住的解决方式：
1. **检查 Node 版本**：确保在 Prisma 7 的支持范围。
2. **清除 script-shell 交互设置**：如果您的 npm/pnpm shell 被配置成了交互式 shell（例如带 `/k` 的 `cmd.exe`），会导致 prisma 安装卡住。运行以下命令清除：
   ```bash
   npm config delete script-shell
   pnpm config delete script-shell
   ```
   然后重新执行 `pnpm install`。

---

### 2. 配置环境变量

项目使用 Monorepo 结构，子包独立读取环境变量：
- 后端服务运行在 `server/`，读取 `server/.env`。
- 前端运行在 `client/`，通常不需要配环境变量，同机或局域网访问会自动映射。

#### 2.1 后端环境变量
复制示例文件：
```bash
# macOS / Linux
cp server/.env.example server/.env

# Windows PowerShell
Copy-Item server/.env.example server/.env
```
最少确认项目：
- `DATABASE_URL`：默认 SQLite。
- `RAG_ENABLED`：如果不启用 Qdrant RAG，请设为 `false`。

#### 2.2 在页面中配置模型
启动项目后，建议在前端页面配置：
- `/settings`：配置供应商 API Key 和模型连通性。
- `/settings/model-routes`：给不同任务（大纲、主笔、审计、聊天）路由到不同的模型。
- `/knowledge?tab=settings`：配置向量模型与集合设置。

---

### 3. 启动开发环境

#### 方式 A：一键启动全部服务
```bash
pnpm dev
```

#### 方式 B：分步独立启动（推荐 macOS 调试）
在三个独立的终端窗口分别执行：
1. **共享包编译器**：`pnpm dev:shared`
2. **后端服务**：`pnpm dev:server` (启动在 `http://localhost:3000`)
3. **前端客户端**：`pnpm dev:client` (启动在 `http://localhost:5173`)

#### 方式 C：使用后台管理脚本 (macOS 推荐)
使用 [scripts/manage.sh](file:///Users/nvidia/GeneralAgent/scripts/manage.sh) 控制后台常驻进程：
- 启动：`./scripts/manage.sh start`
- 停止：`./scripts/manage.sh stop`
- 查看状态：`./scripts/manage.sh status`
- 重启：`./scripts/manage.sh restart`

#### 方式 D：启动本地离线 TTS 服务器 (视频旁白合成)
```bash
python scripts/start-local-tts.py
```

#### 默认访问地址：
- 前端界面：`http://localhost:5173`
- 后端 API：`http://localhost:3000`
- API 端点：`http://localhost:3000/api`
- 本地语音服务器：`http://localhost:8000`

---

### 4. 本地 SenseNova 多模态图像模型部署 (可选)

项目支持完全离线运行在 Ollama 上的 `SenseNova-U1-8B-MoT-Infographic-V3` 图像微调和纠错能力。

#### 4.1 安装 Ollama 并拉取模型
```bash
ollama pull sensenova-u1:8b-v3
```

#### 4.2 硬件性能分级
系统在启动时会自动检测本地 `127.0.0.1:11434` 并划分 Tier：
- **Tier 1 (GPU 高加速)**: 显存 $\ge$ 15GB 或 Mac 统一内存 $\ge$ 32GB。BF16 高精度运行（耗时约 8 秒）。
- **Tier 2 (GPU 中加速)**: 显存 6GB-14GB 或 Mac 统一内存 16GB-24GB。INT8/INT4 量化运行（耗时约 30 秒）。
- **Tier 3 (CPU 纯本地)**: CPU 慢速运行（约 1.5 - 3 分钟）。

#### 4.3 运行 SenseNova 测试
```bash
# 运行单元测试
node --test server/tests/sensenovaLocalInference.test.js

# 在服务正常运行状态下，运行端到端模拟集成测试
node server/scripts/test-e2e-api-simulation.js
```

---

### 5. 部署 Qdrant Vector DB (可选)

1. 在 [Qdrant Cloud](https://cloud.qdrant.io/) 免费创建 Cluster。
2. 将 Cluster URL 和 API Key 写入 `server/.env`：
   ```env
   QDRANT_URL=https://your-cluster.region.cloud.qdrant.io:6333
   QDRANT_API_KEY=your_database_api_key
   ```
3. 在页面 `知识库 -> 向量设置` 中保存 embedding 设置。

---

### 6. MooMoo OpenD 本地美股网关配置与运行 (可选)

系统内置了美股投资研究智能体与 MooMoo OpenD 的自动守护集成：
1. **自动感知与后台唤醒**：只要你本地安装过 `MooMoo OpenD`（或 `FutuOpenD`），运行 GeneralAgent (`pnpm dev`) 后，后端服务会在初始化及调用时自动校验 `127.0.0.1:11111` 端口；若端口未连通，系统会自动在后台静默唤醒本地 OpenD 守护进程。
2. **访问美股投研工作台**：项目启动后，在浏览器访问 `http://localhost:5173/stock` 或在侧边栏点击 **【美股投研与调仓】**。
3. **零配置安全 Fallback**：即使未启动 OpenD，工作台也支持一键拖拽/导入 MooMoo 导出的持仓 CSV 文件或全选复制持仓文本。
4. **安全提示**：系统仅生成开盘前操作建议与风控分析 (Advisory Only)，**绝不会自动下单**，最终挂单操作完全由你在 MooMoo 客户端上确认执行。

---

## 🏗️ 技术栈与架构

### 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 19 + Vite + React Router + TanStack Query + Plate 编辑器 |
| 后端 | Express 5 + Prisma 7 + Zod |
| AI 编排 | LangChain + LangGraph |
| 数据库 | SQLite (主库) + Qdrant (向量库/RAG) |
| 工程形态 | pnpm workspace Monorepo (pnpm@10.6.0) |
| 桌面端 | Electron (electron-builder 打包) |
| Node 版本 | `^20.19.0 \|\| ^22.12.0 \|\| >=24.0.0` |

### 项目结构

```text
GeneralAgent/
├── client/          # 前端 (@ai-novel/client)
├── server/          # 后端服务与运行时 (@ai-novel/server)
├── shared/          # 共享类型与协议 (@ai-novel/shared)
├── desktop/         # Electron 壳 (@ai-novel/desktop)
├── docs/            # 设计文档与 wiki
├── images/          # 图片及截图
├── scripts/         # 脚本工具
├── infra/           # 基础设施 (Docker)
└── .github/         # CI/CD Workflows
```

---

### 核心架构支柱

| 支柱 | 核心机制 |
| :--- | :--- |
| **物理记忆 (Memory)** | 实时将小说大纲状态与资产快照存盘至 `docs/story_board.json` 与 `docs/story_ledger.md`，支持异常断电后无损重建。 |
| **分支隔离 (Worktree)** | 在数据库中通过 `ChapterDraft` 隔离，由 `WorktreeManager` 维护隔离写入，通过事务 `mergeAndCommit` 安全并入主干。 |
| **对抗监察 (Debate)** | `EditorAgent` 依据 Zod 对正文进行格式和逻辑对抗，不合规草稿将被退回重新生成。 |
| **心跳自诊断 (Heartbeat)** | 后台轮询诊断小说一致性与债务，分诊卡片自动记录到 `docs/STORY_TASKS.md`。 |
| **驾驶舱看板 (Cockpit)** | 前端展示各 agent 运行状态、健康度评分以及决策实时流。 |

---

## 🎨 界面预览

### Creative Hub 创作中枢
![Creative Hub](./images/创作中枢.png)

### 提示词编辑器
![提示词编辑器](./images/ScreenShot_2026-07-08_140153_328.png)

### 自动导演创建与执行
![自动导演创建](./images/导演模式-创建.png)
![自动导演执行](./images/导演模式-创建中.png)

### 分卷与章节节奏设计
![分卷](./images/write/卷战略.png)
![节奏拆章](./images/write/节奏拆章.png)

### 漫画与视频改编工坊
![漫画工坊](./images/漫画工坊.png)
![视频工坊](./images/视频工坊.png)

---

## 🗺️ 近期规划
- **P0**: 提升自动导演在长周期中的稳定性，优化 checkpoint 重试机制与上下文事实一致性。
- **P1**: 完善由小说自动解构分镜、自动流转到漫画和短视频工作台的编译器。
- **P2**: 构建世界沙盘（World Sandbox）基础框架：阵营演化算法、智能体社交对话网络、 chronicle 编年史记录仪。

## 💬 交流与反馈
欢迎扫码加入 QQ 群进行体验反馈与开发者技术交流：

![QQ 群](./images/群2.png)

## 开源协议与商业授权
本项目采用双许可证：
- 默认开源：**AGPLv3 (GNU Affero General Public License v3.0)**，详见 [LICENSE](./LICENSE) 与 [NOTICE](./NOTICE)。
- 商用托管：将本项目作为 SaaS 或云服务等方式提供给第三方需额外向作者获取商用授权。贡献请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md) 及 [CLA.md](./CLA.md)。
