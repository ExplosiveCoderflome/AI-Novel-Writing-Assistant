# PAI 启示三：Hot/Warm/Cold 三层记忆架构详细设计规范 (Three-Tier Memory Architecture)

本文档针对 Daniel Miessler PAI 框架的**启示三（三层记忆架构与信号捕捉闭环：Hot / Warm / Cold Memory）**，结合 **Daydream Engine（白日做梦引擎 / GeneralAgent）** 现有的 Prompt 预算系统（`contextBudget.ts` / `chapterLayeredContext.ts`），提供具象到数据类型、算法、Token 动态再分配与全生命周期信号捕获的生产级架构设计。

---

## 一、 核心痛点与工程目标

### 1.1 痛点：上下文杂乱、设定崩溃与信号遗失
在长篇故事编排与多模态创作中，原有的上下文处理存在以下三个深层次工程痛点：
1. **上下文无层级平铺**：原有的 `GenerationContextPackage` 将大段历史正文、RAG 检索块与提示词无差别平铺，缺乏清晰的优先级与层级边界，导致 LLM 分不清“当下命令”、“近况伏笔”与“全局硬法则”。
2. **设定遗忘与设定冲突**：缺乏高优先级的“冷记忆 (Cold Memory)”隔离区，故事越写到后面，越容易发生角色性格突变或打破世界观底层公理（Axioms）。
3. **反馈信号即用即弃**：创作者在 UI 上的行内批注、否决重写指令、手动修补记录仅在当次 HTTP 请求中生效，无法持久化反哺后续章节生成。

### 1.2 目标：三层装配、动态 Token 再分配与信号闭环
> **原则：将记忆严格划分为 Hot（即时与批注 15%）、Cold（世界观与硬规则 35%）、Warm（近 3-5 章滚动摘要 50%）三层。通过确定性算法按优先级分配与动态再分配 Token 预算，并建立全生命周期的信号捕捉与提升机制。**

---

## 二、 三层记忆架构全量数据模型与分组映射

将 Memory 分层与代码库现有的 `PromptContextBlock`（含 `group`, `priority`, `estimatedTokens`, `freshness`）无缝映射：

```
                                三层记忆架构映射与 Token 预算流向
                                
   +-----------------------------------------------------------------------------------------+
   | 1. Hot Memory (热记忆 / 预算 15% / Priority: 100 - 90)                                  |
   |    - 对应 ContextGroup: hot_session, hot_inline_feedback, hot_user_override            |
   |    - 包含: 会话级即时指令 ("少用形容词，偏向阴郁古风"), 行内编辑器批注, 临时配置覆盖          |
   +-----------------------------------------------------------------------------------------+
                                                │ 未用完预算 (Unused Budget) 自动下沉
                                                ▼
   +-----------------------------------------------------------------------------------------+
   | 2. Cold Memory (冷记忆 / 预算 35% / Priority: 89 - 70)                                  |
   |    - 对应 ContextGroup: cold_world_axioms, cold_character_rules, cold_master_outline   |
   |    - 包含: 世界观不可破规则 (World Axioms), 角色不可违背性格底线, 主线终极目标, RAG 硬知识 |
   +-----------------------------------------------------------------------------------------+
                                                │ 缺失/余量预算 自动下沉
                                                ▼
   +-----------------------------------------------------------------------------------------+
   | 3. Warm Memory (温记忆 / 预算 50% / Priority: 69 - 40)                                  |
   |    - 对应 ContextGroup: warm_rolling_summaries, warm_character_arcs, warm_plot_momentum|
   |    - 包含: 近 3-5 章滑动摘要与伏笔, 近期角色心境演变, 剧情节奏与冲突悬念动向                 |
   +-----------------------------------------------------------------------------------------+
```

### 2.1 数据接口精确定义 (TypeScript Standard)

```typescript
// server/src/services/novel/memory/threeTierMemoryTypes.ts

export type MemoryTier = "hot" | "warm" | "cold";

export interface HotMemoryPackage {
  sessionInstruction?: string;         // 即时会话指示
  inlineFeedback?: string[];            // 创作者行内批注
  activeUserOverrides?: Record<string, unknown>; // 临时覆盖配置
}

export interface WarmMemoryPackage {
  rollingSummaries: Array<{            // 近 3-5 章滑动摘要
    chapterOrder: number;
    chapterTitle: string;
    summary: string;
    keyPlotPoints: string[];
    characterStates: string;
  }>;
  recentCharacterArcMomentum?: string; // 近期角色心境弧线
  plotPacingState?: string;            // 剧情节奏状态
}

export interface ColdMemoryPackage {
  worldAxioms: string[];                // 世界观不可破规则
  characterImmutableRules: string[];    // 角色不可违背性格底线
  masterNovelOutline: string;            // 终极主线大纲
  ragLoreKnowledge?: string;            // 从 Qdrant 检索到的知识
}

export interface ThreeTierMemoryInput {
  hot: HotMemoryPackage;
  cold: ColdMemoryPackage;
  warm: WarmMemoryPackage;
  totalTokenBudget: number;             // 总预算 (例如: 4000 Tokens)
}
```

---

## 三、 确定性 Token 预算分配与动态再分配算法 (Dynamic Budget Allocation Algorithm)

为防止静态百分比在某种记忆缺失时造成 Token 浪费，设计**动态降级与剩余预算转移算法 (Budget Reallocation Algorithm)**：

```typescript
// 算法逻辑示意：
export function calculateMemoryBudgets(totalBudget: number, hasWarmData: boolean) {
  let hotMax = Math.floor(totalBudget * 0.15);  // 15%
  let coldMax = Math.floor(totalBudget * 0.35); // 35%
  let warmMax = Math.floor(totalBudget * 0.50); // 50%

  // 场景：第一章编写（无历史 Warm 摘要）
  if (!hasWarmData) {
    // Warm 预算平滑再分配：70% 划归 Cold (增强 RAG 知识)，30% 划归 Hot
    coldMax += Math.floor(warmMax * 0.70);
    hotMax += Math.floor(warmMax * 0.30);
    warmMax = 0;
  }

  return { hotMax, coldMax, warmMax };
}
```

### 3.1 内存分块组装规范 (Block Rendering)
组装生成的上下文块采用严格的分块标记（Block Fences），便于 LLM 的 Attention 机制精准识别：

```text
=== [HOT MEMORY - Immediate Session & Feedback] ===
- 会话指示：请增加悬疑气氛，语言偏向阴郁古风。
- 批注修改：避免在对话框中使用现代网络词汇。

=== [COLD MEMORY - Immutable World Axioms & Character Non-Negotiables] ===
- 世界观法则：贾史王薛四大家族同气连枝，太虚幻境决定红尘命运。
- 角色底线：林黛玉性格敏感体贴、才情敏捷，绝不可举止粗俗。

=== [WARM MEMORY - Recent 3-5 Chapter Summaries & Story Arc] ===
- 第 1 章摘要：宝玉在太虚幻境梦演红楼梦曲，醒后对黛玉心生怜惜。
- 近期伏笔：金玉良缘之说在贾府暗流涌动。
```

---

## 四、 零副作用保障与核心工程价值 (Zero-Side-Effects & Core Benefits)

### 4.1 零副作用保障 (Zero Side Effects)
1. **接口 Shape 100% 兼容**：`ThreeTierMemoryService` 转换输出标准的 `PromptContextBlock[]` 数组，与现有 `chapterWritingGraph.ts` 与 `chapterLayeredContext.ts` 的接口类型完全一致，不影响原有调用链。
2. **0 数据库修改**：完全基于已有的 SQLite 表（`ChapterSummary`, `WorldAxiom`, `Character`）读取数据，不改动数据库 Schema。
3. **安全优雅降级**：若新项目没有任何 Hot/Warm 数据，系统自动平滑降级，将 Token 预算分配给基础上下文，保证 0 崩溃风险。

### 4.2 核心工程好处 (Core Benefits)
* **好处 ①：彻底解决长篇“设定崩溃”**：硬规则（Cold Memory）被锁定在最高优先级与 35% 独立预算区，写到 50 章也不会被历史正文挤掉。
* **好处 ②：Token 利用率提升至 100%**：写第一章（无 Warm 摘要）时，自动将 Warm 预算转赠给 Cold（70%）与 Hot（30%），零 Token 浪费。
* **好处 ③：用户批注“越用越懂你”**：创作者对第 5 章的行内修改批注自动沉淀入 Hot/Warm 记忆，生成第 6 章时自动遵循，无需重复输入。

---

* **文档位置**：[docs/wiki/architecture/pai-insight-3-three-tier-memory-design.md](file:///Users/nvidia/GeneralAgent/docs/wiki/architecture/pai-insight-3-three-tier-memory-design.md)
* **状态**：启示三三层记忆精细架构与副作用/价值分析已归档 Wiki
