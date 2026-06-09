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
}
```

## 写入路径

**触发时机**：`chapterRuntimePipeline.runPipelineChapterWithRuntime` 函数末尾，章节最终未通过时构建归因对象，写入 `PipelineRuntimeResult.qualityDebtAttribution`。

**存储位置**：`chapter.riskFlags` JSON 的 `qualityLoop.qualityDebtAttribution` 节点，与已有的 `qualityLoop` 质量闭环数据合并存储。

**触发链路**：

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
