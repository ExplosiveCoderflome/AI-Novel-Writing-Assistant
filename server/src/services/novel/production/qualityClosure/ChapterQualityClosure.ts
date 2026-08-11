import type { PipelinePayload } from "../../novelCoreShared";
import { logPipelineError, logPipelineWarn } from "../../novelCoreShared";
import { createQualityReport } from "../../novelCoreReviewService";
import { chapterQualityLoopService } from "../../quality/ChapterQualityLoopService";
import type { ChapterRuntimeCoordinator } from "../../runtime/ChapterRuntimeCoordinator";
import type { DirectorIssueTaskContext } from "../../director/issues";
import { reportPipelineIssue } from "../issueGovernance/PipelineIssueGovernance";

type ChapterPipelineResult = Awaited<ReturnType<ChapterRuntimeCoordinator["runPipelineChapter"]>>;

export async function applyChapterQualityClosure(input: {
  governance: DirectorIssueTaskContext | null;
  workflowTaskId?: string;
  novelId: string;
  jobId: string;
  chapter: { id: string; order: number };
  chapterResult: ChapterPipelineResult;
  qualityThreshold: number;
  runtimePayload: PipelinePayload;
  qualityAlertDetails: string[];
  replanAlertDetails: string[];
  recoverableRepairDetails: string[];
}): Promise<{ shouldStopAfterCurrentChapter: boolean }> {
  const { chapter, chapterResult, runtimePayload } = input;
  const final = { score: chapterResult.score, issues: chapterResult.issues };
  const replanRecommendation = chapterResult.runtimePackage?.replanRecommendation;
  const qualityDebtTerminalAction = chapterResult.pass || replanRecommendation?.action === "stop_for_replan"
    ? null
    : "defer_and_continue" as const;

  if (runtimePayload.autoReview && !chapterResult.reviewExecuted) {
    await reportPipelineIssue({
      governance: input.governance,
      workflowTaskId: input.workflowTaskId,
      novelId: input.novelId,
      jobId: input.jobId,
      issueCode: "quality.acceptance_unavailable",
      stage: "chapter_review",
      summary: `第${chapter.order}章接收检查未能执行，正文已保留并等待后续复查。`,
      chapterId: chapter.id,
      chapterOrder: chapter.order,
      hasUsableOutput: true,
      provider: runtimePayload.provider,
      model: runtimePayload.model,
      temperature: runtimePayload.temperature,
    });
  }

  if (chapterResult.recoverableRepairFailure) {
    input.recoverableRepairDetails.push(
      `第${chapter.order}章需要后续修复：${chapterResult.recoverableRepairFailure.message}`,
    );
    logPipelineWarn("章节局部修复未安全应用，已记录并继续后续章节", {
      jobId: input.jobId,
      order: chapter.order,
      reason: chapterResult.recoverableRepairFailure.message,
      failureTypes: chapterResult.recoverableRepairFailure.failureTypes,
    });
    await reportPipelineIssue({
      governance: input.governance,
      workflowTaskId: input.workflowTaskId,
      novelId: input.novelId,
      jobId: input.jobId,
      issueCode: "quality.local_repair_failed",
      stage: "chapter_repair",
      summary: chapterResult.recoverableRepairFailure.message,
      evidence: chapterResult.recoverableRepairFailure.failureTypes.join(", "),
      chapterId: chapter.id,
      chapterOrder: chapter.order,
      hasUsableOutput: true,
      provider: runtimePayload.provider,
      model: runtimePayload.model,
      temperature: runtimePayload.temperature,
    });
  }

  if (chapterResult.reviewExecuted) {
    await createQualityReport(input.novelId, chapter.id, final.score, final.issues);
    await chapterQualityLoopService.recordAssessment({
      novelId: input.novelId,
      chapterId: chapter.id,
      chapterOrder: chapter.order,
      score: final.score,
      issues: final.issues,
      runtimePackage: chapterResult.runtimePackage,
      source: chapterResult.retryCountUsed > 0 ? "repair_recheck" : "pipeline_review",
      terminalAction: qualityDebtTerminalAction,
      taskId: input.workflowTaskId,
      qualityDebtAttribution: chapterResult.qualityDebtAttribution ?? null,
    }).catch((error) => {
      logPipelineError("记录章节质量闭环状态失败", {
        jobId: input.jobId,
        novelId: input.novelId,
        chapterId: chapter.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  if (chapterResult.reviewExecuted && !chapterResult.pass) {
    input.qualityAlertDetails.push(
      `第${chapter.order}章（coherence=${final.score.coherence}, repetition=${final.score.repetition}, engagement=${final.score.engagement}）`,
    );
    logPipelineWarn("章节最终未达标", {
      jobId: input.jobId,
      order: chapter.order,
      score: final.score,
    });
    await reportPipelineIssue({
      governance: input.governance,
      workflowTaskId: input.workflowTaskId,
      novelId: input.novelId,
      jobId: input.jobId,
      issueCode: "quality.chapter_below_threshold",
      stage: "chapter_review",
      summary: `第${chapter.order}章质量分未达到 ${input.qualityThreshold} 分。`,
      chapterId: chapter.id,
      chapterOrder: chapter.order,
      qualityScores: {
        coherence: final.score.coherence,
        repetition: final.score.repetition,
        engagement: final.score.engagement,
      },
      hasUsableOutput: true,
      provider: runtimePayload.provider,
      model: runtimePayload.model,
      temperature: runtimePayload.temperature,
    });
  }

  if (!replanRecommendation?.recommended) {
    return { shouldStopAfterCurrentChapter: false };
  }
  const impactedOrders = replanRecommendation.affectedChapterOrders?.length
    ? `影响章节=${replanRecommendation.affectedChapterOrders.join(",")}`
    : `锚点章节=${replanRecommendation.anchorChapterOrder ?? chapter.order}`;
  const detail = `第${chapter.order}章${replanRecommendation.action === "stop_for_replan" ? "需要重规划" : "建议局部处理"}（${impactedOrders}；原因=${replanRecommendation.triggerReason ?? replanRecommendation.reason}）`;
  if (replanRecommendation.action !== "stop_for_replan") {
    if (!input.qualityAlertDetails.includes(detail)) input.qualityAlertDetails.push(detail);
    return { shouldStopAfterCurrentChapter: false };
  }
  await reportPipelineIssue({
    governance: input.governance,
    workflowTaskId: input.workflowTaskId,
    novelId: input.novelId,
    jobId: input.jobId,
    issueCode: "quality.replan_required",
    stage: "chapter_review",
    summary: detail,
    evidence: replanRecommendation.reason,
    chapterId: chapter.id,
    chapterOrder: chapter.order,
    hasUsableOutput: true,
    provider: runtimePayload.provider,
    model: runtimePayload.model,
    temperature: runtimePayload.temperature,
    applyAction: async () => {
      if (!input.replanAlertDetails.includes(detail)) input.replanAlertDetails.push(detail);
    },
  });
  if (!input.replanAlertDetails.includes(detail)) input.replanAlertDetails.push(detail);
  return { shouldStopAfterCurrentChapter: true };
}
