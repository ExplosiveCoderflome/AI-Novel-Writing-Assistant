# 正文产出链路瘦身与资产回灌优化计划

更新日期：2026-05-13

## 1. 背景与目标

当前正文产出链路曾一度扩展为：

```text
章节合同生成 -> 正文生成 -> AI 检测 -> 修文 -> 章节轻校验 -> 角色动态信息提取 -> 状态快照提取 -> 角色资源账本提取 -> 伏笔账本同步
```

这条链路的问题不是单个能力无价值，而是过多能力被串入同一条热路径，导致一章正文需要多次读取同一正文、多次调用 LLM、多次写入状态，用户等待时间变长，自动成书吞吐降低，也更容易出现修复循环、账本重复同步和章节合同重新污染正文生成的问题。

本计划的目标是把正文生产改为“双通道”：

```text
轻量预检 -> 整章正文生成 -> 统一接收闸门 -> 可选局部修文
                                      |
                                      v
                              异步资产回灌通道
```

正文热路径只负责尽快产出可读、可保存、可继续推进的章节；状态快照、角色资源、角色动态与伏笔账本走异步、幂等、可批处理的资产通道。

## 2. 核心原则

- 正文 writer 继续整章一次性生成，不重新接入章节合同、sceneCards、分场景多轮写作或按场景硬截断。
- 章节合同、sceneCards 与边界信息只作为规划、审校、诊断和局部修复辅助资产，不驱动正文热路径。
- AI-based structured understanding 是质量判断、同步计划和风险识别的主实现；确定性代码只做输入校验、幂等判断、结构化输出落库和安全边界。
- 同一章正文内容未变化时，不重复跑状态快照、角色资源、伏笔账本和角色动态同步。
- 默认体验优先帮助新手用户完成整本小说：正文先可读、风险可解释、后台继续回灌，严格一致性作为可选模式。

## 3. 分阶段实施

### Phase 0：文档与基线

- 新增本计划文档，作为后续执行蓝图。
- 记录当前热路径基线：writer、style detection、light audit、repair、background state、character dynamics、character resource、payoff ledger。
- 不改变业务行为。

### Phase 1：热路径瘦身

- 新增 `ChapterRuntimeReadiness`，只检查正文生成最低条件：章节存在、人物可用、上下文包可组装、任务目标可解释。
- `ChapterRuntimeCoordinator` 默认不再强制调用 `ensureChapterExecutionContract`。
- 无 `sceneCards` 时允许生成正文；缺少关键任务目标时给出清晰阻断原因。
- 新增结构化接收闸门 `novel.chapter.acceptance_assessment`，替代默认热路径中的独立 AI 味检测与轻审校双调用。

### Phase 2：修文闭环收敛

- 接收闸门输出 `repairDirectives`，驱动现有局部 patch repair。
- 默认最多自动修一次；失败时记录待修复状态与 repair ticket，不进入无限重试。
- `autoReview=false` 时仍直接保存正文并可进入异步资产回灌。
- full audit 保留为严格模式、手动审校或高风险升级能力，不作为默认每章热路径。

### Phase 3：统一资产 delta

- 新增结构化提取 prompt `novel.chapter.artifact_delta.extract`。
- 一次输出状态变化、角色动态、角色资源变化、伏笔/payoff 变化与同步计划。
- 背景同步由“一章多 prompt 分别抽取”改为“一次 AI 提取、多表确定性落库”。
- 保留旧的 rebuild / manual backfill 服务，用于历史数据修复和兼容。

### Phase 4：幂等与调度

- 新增 additive checkpoint：`novelId + chapterId + contentHash + artifactType + syncMode`。
- 支持 `artifactSyncMode`：
  - `adaptive`：默认模式，关键资产异步立即同步，伏笔全量校准按周期或高风险触发。
  - `deferred`：快速产文，资产同步可延后批处理。
  - `strict`：等待资产同步与必要账本校准完成后再继续下一章。
- 伏笔账本每章写 delta；全量同步只在每 3 章、卷尾、高风险 payoff signal 或 strict 模式触发。

### Phase 5：进度、文案与发布记录

- pipeline 状态区分“正文已可读”“质量待修”“资产回灌中”“账本校准中”。
- 更新恢复提示，明确后台资产同步不等于正文失败。
- 实现产生用户可见变化后，按仓库 release workflow 更新 `docs/releases/release-notes.md` 与 `README.md` 最新更新。

## 4. 接口与结构化输出

### 4.1 Pipeline 选项

新增可选字段：

```ts
artifactSyncMode?: "adaptive" | "deferred" | "strict";
```

默认值为 `adaptive`。现有 `autoReview`、`autoRepair`、`repairMode` 保持兼容。

### 4.2 接收闸门输出

```ts
{
  status: "accepted" | "repairable" | "needs_manual_review" | "continue_with_risk";
  score: {
    coherence: number;
    pacing: number;
    repetition: number;
    engagement: number;
    voice: number;
    overall: number;
  };
  blockingIssues: Array<{
    severity: "low" | "medium" | "high" | "critical";
    category: "continuity" | "character" | "plot" | "mode_fit" | "voice";
    code: string;
    evidence: string;
    fixSuggestion: string;
  }>;
  repairDirectives: Array<{
    mode: "patch" | "rewrite" | "manual";
    target: "continuity" | "character" | "plot" | "ending" | "voice";
    instruction: string;
  }>;
  riskTags: string[];
  assetSyncRecommendation: {
    priority: "normal" | "high";
    reason: string;
    requiresFullPayoffReconcile: boolean;
  };
  continuePolicy: "continue" | "repair_once" | "pause";
}
```

### 4.3 资产 delta 输出

```ts
{
  stateDeltas: unknown[];
  characterResourceDeltas: unknown[];
  payoffDeltas: unknown[];
  relationDynamics: unknown[];
  syncPlan: {
    stateSnapshot: "skip" | "write";
    characterResources: "skip" | "write";
    payoffLedger: "skip" | "delta" | "full_reconcile";
    characterDynamics: "skip" | "write";
  };
  confidence: number;
  requiresFullReconcile: boolean;
}
```

具体落库 mapper 可以逐阶段收紧类型，但新增 prompt 和服务必须先输出结构化字段，不允许用关键词分支替代 AI 识别。

## 5. 验证清单

- 无 `sceneCards` 时可以进入正文生成。
- 已有任务单时不触发章节合同 prompt。
- 缺关键任务目标时，返回明确阻断原因。
- 默认每章正文热路径只进行 writer + acceptance gate；full audit 不默认触发。
- 自动修文最多一次，失败后进入可恢复待修状态。
- 同一正文 content hash 下，资产同步不会重复调用。
- `adaptive` 第 3 章或高风险 payoff signal 会触发全量伏笔校准。
- `deferred` 可以快速推进正文，后台稍后补资产。
- `strict` 会等待必要资产同步后再继续。
- 自动导演与手动批量生成复用同一套默认行为。

## 6. 防遗漏清单

- shared 类型、route schema、pipeline payload、generation job 持久化字段需要同步。
- SQLite 与 PostgreSQL Prisma schema 必须保持一致。
- 新 product prompt 必须放在 `server/src/prompting/` 并注册到 registry。
- UI copy 不写实现迁移叙述，面向用户说明“当前能做什么”和“下一步是什么”。
- README 和 release notes 只在实现产生用户可见变化后更新。
- 每个阶段完成后做一次明确提交；合入 `beta` 前完成服务端 build、客户端 typecheck 和关键测试。
