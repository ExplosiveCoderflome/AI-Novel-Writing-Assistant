# 质量债务根因归因（Phase 0）

## 背景

章节在 `defer_and_continue` 路径结束时（修复一次仍未通过质量门），系统需要知道失败的真正原因，才能有针对性地优化。Phase 0 在此路径埋入结构化归因数据，供聚合工具统计根因分布，为后续四阶段优化方案提供数据驱动的决策依据。

## 根因分类

| 代码 | 名称 | 描述 | 关键证据 |
|------|------|------|----------|
| **A** | 开环修复 | 修复器收到的是压扁文本，未拿到结构化义务信息，重评同一义务再次失败 | `sameObligationRepeated = true`（首次 = 二次 issue codes 完全一致） |
| **B** | patch 锚点失配 | `ChapterPatchRepairService` 要求精确锚定原文片段，锚点失配后升级为 heavy_repair，而预算只有 1 次 | `patchAnchorFailed = true` |
| **D** | 义务不可达 | 预生成 task sheet 中的义务与实际前文矛盾，章节级修复永远无法满足 | `planMisaligned = true`（`failureClassification.code = draft_obligation_unmet / replan_required`） |
| **E** | 签名漂移 | 首次失败是 length 类问题，修复后浮出 content 类问题，issueSignature 相同导致预算被耗尽 | `lengthVsContentDrift = true` |

## 数据模型

```ts
interface QualityDebtAttribution {
  firstFailureIssueCodes: string[];           // 首次验收失败 issue code 列表
  secondFailureIssueCodes: string[];          // 修复后二次失败 issue code 列表
  firstFailureClassificationCode: string | null; // failureClassification.code
  patchAnchorFailed: boolean;                 // patch 升级为 heavy（根因 B）
  sameObligationRepeated: boolean;            // 同义务重复失败（根因 A）
  planMisaligned: boolean;                    // 义务不可达（根因 D）
  lengthVsContentDrift: boolean;              // 签名漂移（根因 E）
  missingObligationKinds: string[];           // 首次失败缺失的义务种类
  budgetActionsConsumed?: string[];           // Director 预算操作（外层写入）
  degradedProposalRouting?: {
    contentProvenance: "debt";
    routedToPendingReview: true;
    proposalTypes: ("character_state_update" | "character_resource_update")[];
    fields: ("currentState" | "currentGoal" | "characterResource")[];
  };
}
```

## 质量债务来源路由规则

章节正文在质量门未通过但仍被保留继续执行时，最终正文的资产同步必须携带 `contentProvenance = "debt"`。该标记不改变章节重试、暂停或继续生成的控制流，只影响后续资产提取出来的状态提案如何入账。

当前规则：

- `contentProvenance = "confirmed"`：正常通过质量门或关闭自动审校的正文，沿用原有自动提交与待审分流规则。
- `contentProvenance = "debt"`：章节内容可继续用于后续自动生成，但从该正文提取出的角色状态、角色资源等提案统一带 `sourceQuality = "debt"` 和 `source_quality:debt` 校验标记。
- 带债务来源的提案不得走自动提交白名单，即使原本是低风险 `character_state_update` 或后台提取出的中风险 `character_resource_update`，也必须进入 `pending_review`。
- malformed 提案仍然拒绝入库，例如缺少 `summary`、缺少角色 ID、角色资源 payload 无效或没有证据时，不因为 debt 来源而进入待审。

这样做的目标是把“自动生成不断链”和“硬事实不喂错”分开：章节可以继续生成，但未确认的状态/资源变化不会直接污染角色硬事实、资源账本和后续章节上下文。

待审角色状态提案会在写作上下文中以软约束方式出现。`currentState`、`currentGoal` 如果来自待确认提案，prompt 会提示“如与最新剧情冲突可按合理逻辑调整”；`currentLocation` 仍保持硬事实处理，除非后续补齐位置字段的待审来源回写机制。

## 写入路径

**触发时机**：`chapterRuntimePipeline.runPipelineChapterWithRuntime` 函数末尾，章节最终未通过时构建归因对象，写入 `PipelineRuntimeResult.qualityDebtAttribution`。

**存储位置**：`chapter.riskFlags` JSON 的 `qualityLoop.qualityDebtAttribution` 节点，与已有的 `qualityLoop` 质量闭环数据合并存储。

**触发链路**：

```
chapterRuntimePipeline.ts
  → runPipelineChapterWithRuntime 收集首次/二次失败信息
  → syncFinalChapterArtifacts 透传 contentProvenance
      ↓
ChapterArtifactBackgroundSyncService.ts
  → ChapterArtifactDeltaService.syncChapterArtifacts
      ↓
StateCommitService / CharacterResourceValidationService
  → debt 来源提案绕开自动提交并进入 pending_review
      ↓
GenerationContextAssembler / chapterLayeredContext
  → 待审 currentState/currentGoal 以软约束进入写作 prompt
```

归因数据写入链路：

```
chapterRuntimePipeline.ts
  → runPipelineChapterWithRuntime 收集首次/二次失败信息
  → buildQualityDebtAttribution 推断根因标签
  → PipelineRuntimeResult.qualityDebtAttribution
      ↓
novelCorePipelineService.ts
  → chapterQualityLoopService.recordAssessment(qualityDebtAttribution)
      ↓
ChapterQualityLoopService.ts
  → serializeRiskFlags → chapter.riskFlags (JSON)
```

## 读取路径

**Agent 工具**：`analyze_quality_debt_attribution`

- 输入：novelId（必填）、startOrder、endOrder（可选）
- 功能：扫描指定章节范围内所有 `terminalAction = defer_and_continue` 的章节，提取 `qualityDebtAttribution` 数据并聚合
- 输出：
  - 根因 A/B/D/E 占比（0~1）
  - Top 5 失败 issue code
  - Top 3 缺失义务种类
  - 每章归因明细
  - 决策建议（哪个阶段优先）

## 决策门（Phase 0 结论）

根据工具输出的根因占比决定后续优化侧重：

| 主导根因 | 建议 |
|----------|------|
| **D 主导** | 阶段一（懒规划）优先，JIT task sheet 直接消解义务不可达 |
| **A/B 主导** | 先做阶段一的修复闭环子项（1.D），再做懒规划主体 |
| **E 主导** | 拆分 length/content issueSignature 分别计预算 |

## 相关文件

- `server/src/services/novel/runtime/chapterRuntimePipeline.ts`（归因采集 + `QualityDebtAttribution` 接口）
- `server/src/services/novel/quality/ChapterQualityLoopService.ts`（归因存储）
- `server/src/services/novel/novelCorePipelineService.ts`（归因透传）
- `server/src/agents/tools/bookAnalysisTools.ts`（`analyze_quality_debt_attribution` 工具实现）
- `server/src/agents/tools/bookAnalysisToolSchemas.ts`（工具 Schema 定义）

## 与四阶段优化方案的关系

Phase 0 是"先做后看"的诊断层，不修改生成逻辑，仅在现有失败路径埋点。其输出数据驱动阶段一（懒规划）的实施优先级，避免在错误根因上投入大改造。

相关方案文档：`.claude/plan/novel-generation-pipeline-optimization.md`
