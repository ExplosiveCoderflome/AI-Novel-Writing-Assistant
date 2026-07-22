# 世界沙盒模拟设计规范

## 1. 概述
**世界沙盒模拟 (World Sandbox Simulation)** 是一个自主状态模拟框架，用于对小说世界中的物理、生态以及角色行为状态的变化进行建模。该系统作为一个时序同步锁步（lock-step）的轮转模拟器运行，能产出一致的时空观察反馈（observation feeds），从而在自动化小说草稿生成过程中保障叙事连续性，并提供写实的世界规则约束。

---

## 2. 架构与核心模拟器

模拟空间由通过邻接表（adjacency maps）连接的地点（Locations）组成，其中填充有角色（Agents/Characters），并按 Tick 推进。

```
+--------------------------------------------------------------+
|                     ChronologyBranchEngine                   |
|       (零拷贝快照继承，当历史重写时对未来状态进行修剪)       |
+--------------------------------------------------------------+
                               │
                               ▼
+--------------------------------------------------------------+
|                        锁步轮转控制器                        |
+--------------------------------------------------------------+
         │                     │                     │
         ▼                     ▼                     ▼
+------------------+  +------------------+  +------------------+
|   地球物理与生态   |  |   角色 Agent     |  |    张力与冲突    |
|    模拟器        |  |    模拟器        |  |     引擎         |
| (天气、温度、生态) |  | (艾宾浩斯、行为树)|  |   (局部 / 全局)  |
+------------------+  +------------------+  +------------------+
         │                     │                     │
         +---------------------+---------------------+
                               │
                               ▼
+--------------------------------------------------------------+
|                      虚拟相机叙事引擎                        |
|       (观察反馈渲染与正文时空逻辑/规则悖论检测)              |
+--------------------------------------------------------------+
```

---

## 3. 核心组件说明

### 3.1 地球物理与生态模拟器 (`EarthPhysicsSimulator`)
对地点的自然与生物状况进行确定性建模：
- **温度与太阳高度角**：结合纬度、随一年中天数变化的季节振幅（正弦近似模型）以及每日的小时角计算基础温度。运用气温垂直递减率模型，海拔每升高 $1000\text{m}$ 气温下降 $6.5^\circ\text{C}$。
- **生态平衡**：根据降雨、河流灌溉、植物吸水以及蒸腾作用对土壤湿度进行建模。
- **捕食者-猎物动力学**：采用 Lotka-Volterra 经典方程，并结合群落生境（Biome）的植被承载上限，模拟食草动物（Prey）与捕食者（Predator）的数量演变。

### 3.2 角色 Agent 模拟器 (`CharacterAgentSimulator`)
模拟角色的记忆、行为精细度以及社交动态：
- **艾宾浩斯记忆衰减**：认知记忆的显著度（salience）随着时间推移使用公式 $S(t) = S(t-1) \cdot e^{-\lambda \cdot dt}$ 进行指数衰减。显著度低于 $0.15$ 的记忆将被清理。
- **传言扩散**：将传言在空间上扩散至相邻地点，并在传播过程中应用变异/夸大扭曲率。
- **精细度 (LOD) 决策**：
  - **LOD 1 (主角/重要角色)**：调用 `SandboxLlmScheduler` 进行基于 LLM 调度的复杂决策。
  - **LOD 2 (背景角色)**：运行确定性的行为树（Behavior Trees），追踪饥饿值、精力值和理智值（Sanity）。

### 3.3 张力与冲突引擎 (`TensionAndConflictEngine`)
管理局部和全局的剧情节奏：
- **局部节点张力**：基于环境危险指数、安全系数修饰符以及当前在场 Agent 之间的关系摩擦力计算得出。
- **全局张力**：聚合张力最高的前 3 个地点的平均值，用以代表当前的叙事冲突强度。
- **相遇检测与先攻权**：对角色进行空间归类，检测相遇事件，并基于轮转先攻权阶梯（initiative chain）仲裁冲突行为。

### 3.4 虚拟相机叙事引擎 (`VirtualCameraNarrativeEngine`)
渲染上下文观察反馈并审计正文初稿：
- **观察反馈渲染**：将地点的物理指标、在场角色、直接观察事件以及相邻高强度事件的渗漏（leakages）编译为 Markdown 观察流（Observation Feed）。
- **时空一致性审计**：扫描生成正文中是否存在逻辑悖论，包括已死亡角色活动、地理瞬间位移（闪现）以及超出超常规则代价的逻辑矛盾。

### 3.5 历史分支引擎 (`ChronologyBranchEngine`)
保证数据库性能并支持历史重写：
- **零拷贝分支**：创建新沙盒分支 (`SandboxBranch`) 时，通过父分支分叉点 Tick 的快照继承机制，避免在数据库中冗余复制历史 Tick 快照。
- **未来修剪 (Future Pruning)**：当小说章节被人工重写或回滚时，自动物理删除该沙盒分支中等于或晚于分叉 Tick 的所有快照与历史，并将受影响章节标记为“待修复”。

---

## 4. 文件路径与测试用例

- **源代码路径**：[server/src/services/world/](file:///c:/Users/lilin/GeneralAgent/server/src/services/world)
- **单元测试用例**：
  - [earthPhysicsSimulator.test.js](file:///c:/Users/lilin/GeneralAgent/server/tests/earthPhysicsSimulator.test.js)
  - [characterAgentSimulator.test.js](file:///c:/Users/lilin/GeneralAgent/server/tests/characterAgentSimulator.test.js)
  - [tensionAndConflictEngine.test.js](file:///c:/Users/lilin/GeneralAgent/server/tests/tensionAndConflictEngine.test.js)
  - [turnBasedSimulation.test.js](file:///c:/Users/lilin/GeneralAgent/server/tests/turnBasedSimulation.test.js)
  - [virtualCameraNarrativeEngine.test.js](file:///c:/Users/lilin/GeneralAgent/server/tests/virtualCameraNarrativeEngine.test.js)
  - [chronologyBranchEngine.test.js](file:///c:/Users/lilin/GeneralAgent/server/tests/chronologyBranchEngine.test.js)
