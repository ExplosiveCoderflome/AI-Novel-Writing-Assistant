# 计划06 · 短篇 V2 接线盘点（2026-11-03）

状态：**只读盘点，不写接线生产代码**。短篇修订恢复已合入 `beta`（证据：`52f478f1`、`41b4130f`），但 V2 短篇计划注册与 ProductionUnitRun 挂接仍未做。本文件为后续独立 brief 的代码级入口，不是已完成事实。

## 1. 现有资产盘点

### 修订与候选（`modules/novel/short-story/`）

| 文件 | 责任 |
| --- | --- |
| `application/ShortStoryRevisionPreviewService.ts` | 解释自然语言修改要求，产出 `RevisionPreviewData`（含 `candidatePlan`）并存为 `NovelIntentVersion.status=proposed`。 |
| `application/ShortStoryRevisionService.ts` | 确认、租约、逐段候选、复验后原子发布、失败/冲突、重试；持久化 `ShortStoryRevisionJob` 与 `ShortStoryRevisionCandidate`。 |
| `application/ShortStoryContext.ts` | 基础版本捕获（`captureBaseline`）与 `assertBaseline`、`loadRevisionContext`，含参考合同与创作底座。 |
| `domain/revisionState.ts` | `RevisionBaseline`、`affectedSegmentIds`、快照追加、`isLegacyRevision`。 |
| `application/ShortStoryProductionService.ts` | 首次生产：计划 → 逐段写作 → 全篇审校 → 一次修整；`recoverPending` 按持久片段游标恢复。 |
| `application/ShortStoryStudioService.ts` | 投影、片段人工保存、重试、预览、确认入口。 |
| `application/shortStoryAuditPolicy.ts` | 开关、窗口读取、全篇预算评估、一次修复语义、质量债。 |
| `http/shortStoryRoutes.ts` | 现有 JSON 路由（projection、segment PUT、revision/replan preview、retry、apply、derive-long-form）。 |

持久化：`ShortStoryPlan`、`ShortStorySegment`、`ShortStoryRevisionJob`、`ShortStoryRevisionCandidate`、`NovelIntentVersion`；两套迁移已在基线（`20261021090000_short_story_revision_recovery`、`20261021130000_short_story_reference_diagnostics`）。

### 诊断

`platform/llm/diagnostics/`（`StructuredDiagnosticStore`、`structuredEvidence`、README）。`ShortStoryRevisionPreviewService` 与 `ShortStoryStudioService` 通过 `canRetryStructuredTask` / `latestStructuredDiagnostic` 使用；只投影原因和标识，不解除人工暂停，不改质量债政策。

### 参考合同

`modules/novel/creation-studio/reference/`（`shortStoryReferenceService`、`referenceContract`、`parseShortStoryReference`）。确认时快照写入 `Novel.shortStoryReferenceJson`；计划、正文、审校、修复、改写、重规划和恢复统一从该快照取合同，恢复时不重新抽取。

## 2. `SHORT_STORY_ON_V2` 现有行为 vs 计划06验收

当前开关**只影响审校调用**，不是 V2 接线：

- 打开时：全篇审校不强制 `maxTokens: 5000`，改用任务路由有效额度；每次实际请求（初审、复验、备用、纠正）经 `withShortStoryAuditBudget` 检查完整消息、结构化选项、模型附加输入、实际输出额度与准确窗口，超限记录 `step_review_required` 检查点。
- 关闭时：保留原有固定 5000 与无预算钩子路径。
- 仍走 V1 `novelWorkflowTask`：计划、逐段写作、审校、修复都由 `ShortStoryProductionService` / `ShortStoryRevisionService` 编排，没有 V2 运行、控制、产物台账或命令。

因此计划06验收缺口：

1. 未注册 V2 短篇计划，未使用 `RunContract`/`DirectorNextRunControl`/`DirectorNextArtifact`。
2. 未产生 `ProductionUnitRun`，跨进程恢复仍靠短篇自身的片段游标与修订作业租约，不是 V2 单元状态机。
3. 预算暂停的 V2 恢复、人工编辑冲突、`replan_required` 显式重规划还没有回到统一来源页/命令。
4. 运行记录仍是 V1 任务投影，不是 V2 只读运行记录。

## 3. 需要注册的 director 计划步骤（建议）

在 `productionComposition` 的 `additionalPlans` 增加 `production-kernel-short-story@1`，`externalArtifacts: ["novel_seed"]`，步骤建议：

| stepId | 建议 produces | 说明 |
| --- | --- | --- |
| `short_story_plan` | `short_story_plan` | 调用短篇计划能力；半自动模式可设 `gateable: true`。 |
| `short_story_segments` | `short_story_draft` | 逐段写作，复用片段游标恢复；不改写人工编辑片段。 |
| `short_story_audit` | `short_story_audit` | 全篇审校 + 上下文预算门；`replan_required` 映射显式停止。 |
| `short_story_repair` | `short_story_repaired` | 最多一次修整 + 修后复验；未通过保留原稿与质量债。 |

每一步由步骤适配器调用短篇模块 application 能力，不改写其生产所有权。计划版本、`stepIdsInScope`、`chapterRange` 需要适配短篇语义（短篇没有章节范围，可能需要独立 scope 约定，接线前先定契约）。

## 4. 不可导入长篇内核的边界

- **禁止**把短篇变成长篇章节 Unit，或让短篇走 `chapter_batch` / `ProductionUnitRun` 的长篇章状态机。
- **禁止**在 V2 领域内核增加“如果是短篇”的分支；遇到必须分支时按停止条件 G6 停下，补成通用能力。
- 短篇只能依赖 V2 稳定内核（运行记录、控制状态、产物台账、守卫、命令），不复用长篇步骤。
- `productionKernel/execution/ownership.ts` 与 `recovery/commands.ts` 现在用 `narrativeForm: {not: "short_story"}` 排除短篇；接线时这些排除必须保留，短篇用自己的一致性边界，不能放宽。
- 短篇质量债、编辑保护、补丁应用应改走 `modules/production/common/`，但生产编排仍留在短篇模块。
- 前端重定向等参照 `manual/entry.ts` 的来源页分流方式，但短篇来源页是创作页/短篇页，不是 `/lab/director/...`。

## 5. 建议测试清单

开关关闭回归：

1. `shortStoryReviewSqlite.test.js`、`shortStoryWorkflowContracts.test.js`、`shortStoryRevisionRecovery.test.js`、`shortStoryStructuredDiagnostics.test.js` 全部保持通过。
2. `node tests/production/application/shortStoryAuditPolicy.test.js`：开关默认关闭、预算评估、一次修复语义不变。

开关打开 + 临时 SQLite（新增短篇 V2 集成测试）：

3. 新短篇生成：计划 → 逐段 → 全篇审校 → 交付，V2 运行进入 `completed`。
4. 崩溃恢复：片段与修订作业中断后从持久游标继续，且不重复付费调用。
5. 人工编辑：编辑后的片段不被后台生成/修整覆盖，`expectedVersion` 冲突拒绝。
6. 一次修复 + 修后复验：通过才保存，未通过保留原稿与质量债；第二次不再修。
7. 预算暂停：全篇审校超窗口时暂停，来源页可换模型/扩额度后继续，不硬审。
8. `replan_required`：普通重试被拒，需显式预览确认。
9. 用 `rg` 确认 V2 内核没有短篇专属分支。

## 相关文档

- [计划06接入准备](2026-10-28-production-kernel-06-readiness.md)
- [计划06任务级验收](2026-10-22-production-kernel-03-08-task-level.md)
- [短篇模块边界](../../../server/src/modules/novel/short-story/README.md)
- [短篇工作流 Wiki](../../wiki/workflows/creation-studio-short-story.md)
- [短篇结构化失败诊断](../../wiki/debugging/short-story-structured-failures.md)
