import type { PipelinePayload } from "../../novelCoreShared";
import { logPipelineError, logPipelineWarn } from "../../novelCoreShared";
import { createQualityReport } from "../../novelCoreReviewService";
import { chapterQualityLoopService } from "../../quality/ChapterQualityLoopService";
import type { ChapterRuntimeCoordinator } from "../../runtime/ChapterRuntimeCoordinator";
import type { DirectorIssueTaskContext } from "../../director/issues";
import { reportPipelineIssue } from "../issueGovernance/PipelineIssueGovernance";
import type { ReplanResult } from "@ai-novel/shared/types/novel";
import type { DirectorIssueDecision } from "@ai-novel/shared/types/directorIssue";

type ChapterPipelineResult = Awaited<ReturnType<ChapterRuntimeCoordinator["runPipelineChapter"]>>;
type ChapterQualityStopAction = Extract<DirectorIssueDecision["action"], "pause_for_manual" | "fail_task">;

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
  runLocalReplan: (input: {
    chapterId: string;
    triggerType: string;
    sourceIssueIds: string[];
    windowSize: number;
    reason: string;
  }) => Promise<ReplanResult>;
}): Promise<{
  shouldStopAfterCurrentChapter: boolean;
  stopAction: ChapterQualityStopAction | null;
}> {
  const { chapter, chapterResult, runtimePayload } = input;
  const final = { score: chapterResult.score, issues: chapterResult.issues };
  const replanRecommendation = chapterResult.runtimePackage?.replanRecommendation;
  const qualityDebtTerminalAction = chapterResult.pass || replanRecommendation?.scope === "global_book"
    ? null
    : "defer_and_continue" as const;
  const exhaustedAttempt = input.governance?.policy.maxAutomaticRetries ?? 0;
  let shouldStopAfterCurrentChapter = false;
  let stopAction: ChapterQualityStopAction | null = null;
  const applyDecision = async (decision: DirectorIssueDecision) => {
    if (decision.action === "auto_retry") {
      throw new Error("章节质量闭环已耗尽本章自动处理预算，不能登记未执行的自动重试。");
    }
    if (decision.action === "pause_for_manual" || decision.action === "fail_task") {
      shouldStopAfterCurrentChapter = true;
      stopAction = decision.action;
    }
  };

  if (runtimePayload.autoReview && !chapterResult.reviewExecuted) {
    const detail = `第${chapter.order}章接收检查未能执行，正文已保留并等待后续复查。`;
    if (!input.qualityAlertDetails.includes(detail)) input.qualityAlertDetails.push(detail);
    await reportPipelineIssue({
      governance: input.governance,
      workflowTaskId: input.workflowTaskId,
      novelId: input.novelId,
      jobId: input.jobId,
      issueCode: "quality.acceptance_unavailable",
      stage: "chapter_review",
      summary: detail,
      chapterId: chapter.id,
      chapterOrder: chapter.order,
      attempt: exhaustedAttempt,
      hasUsableOutput: true,
      provider: runtimePayload.provider,
      model: runtimePayload.model,
      temperature: runtimePayload.temperature,
      applyAction: applyDecision,
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
      attempt: exhaustedAttempt,
      hasUsableOutput: true,
      provider: runtimePayload.provider,
      model: runtimePayload.model,
      temperature: runtimePayload.temperature,
      applyAction: applyDecision,
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
      attempt: exhaustedAttempt,
      qualityScores: {
        coherence: final.score.coherence,
        repetition: final.score.repetition,
        engagement: final.score.engagement,
      },
      hasUsableOutput: true,
      provider: runtimePayload.provider,
      model: runtimePayload.model,
      temperature: runtimePayload.temperature,
      applyAction: applyDecision,
    });
  }

  if (shouldStopAfterCurrentChapter) {
    return { shouldStopAfterCurrentChapter: true, stopAction };
  }

  if (!replanRecommendation?.recommended) {
    return { shouldStopAfterCurrentChapter: false, stopAction: null };
  }
  const impactedOrders = replanRecommendation.affectedChapterOrders?.length
    ? `影响章节=${replanRecommendation.affectedChapterOrders.join(",")}`
    : `锚点章节=${replanRecommendation.anchorChapterOrder ?? chapter.order}`;
  const detail = `第${chapter.order}章${replanRecommendation.scope === "global_book" ? "需要书级重规划" : "正在调整后续章节安排"}（${impactedOrders}；原因=${replanRecommendation.triggerReason ?? replanRecommendation.reason}）`;
  if (replanRecommendation.scope !== "global_book") {
    try {
      const result = await input.runLocalReplan({
        chapterId: chapter.id,
        triggerType: "chapter_quality_local_replan",
        sourceIssueIds: replanRecommendation.blockingIssueIds,
        windowSize: Math.max(1, replanRecommendation.affectedChapterOrders?.length ?? 3),
        reason: replanRecommendation.triggerReason ?? replanRecommendation.reason,
      });
      const plannedOrders = result.affectedChapterOrders.join(",") || "后续未完成章节";
      const completedDetail = `第${chapter.order}章已调整后续章节安排（已刷新=${plannedOrders}）。`;
      if (!input.qualityAlertDetails.includes(completedDetail)) input.qualityAlertDetails.push(completedDetail);
      return { shouldStopAfterCurrentChapter: false, stopAction: null };
    } catch (error) {
      const failureDetail = `第${chapter.order}章后续章节调整失败，已保留正文并继续：${error instanceof Error ? error.message : String(error)}`;
      if (!input.recoverableRepairDetails.includes(failureDetail)) input.recoverableRepairDetails.push(failureDetail);
      await reportPipelineIssue({
        governance: input.governance,
        workflowTaskId: input.workflowTaskId,
        novelId: input.novelId,
        jobId: input.jobId,
        issueCode: "quality.local_replan_failed",
        stage: "chapter_review",
        summary: failureDetail,
        evidence: replanRecommendation.reason,
        chapterId: chapter.id,
        chapterOrder: chapter.order,
        attempt: exhaustedAttempt,
        hasUsableOutput: true,
        provider: runtimePayload.provider,
        model: runtimePayload.model,
        temperature: runtimePayload.temperature,
        applyAction: applyDecision,
      });
      return { shouldStopAfterCurrentChapter, stopAction };
    }
  }
  if (replanRecommendation.action !== "stop_for_replan") {
    if (!input.qualityAlertDetails.includes(detail)) input.qualityAlertDetails.push(detail);
    return { shouldStopAfterCurrentChapter: false, stopAction: null };
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
    attempt: exhaustedAttempt,
    hasUsableOutput: true,
    provider: runtimePayload.provider,
    model: runtimePayload.model,
    temperature: runtimePayload.temperature,
    applyAction: async () => {
      if (!input.replanAlertDetails.includes(detail)) input.replanAlertDetails.push(detail);
    },
  });
  if (!input.replanAlertDetails.includes(detail)) input.replanAlertDetails.push(detail);
  return { shouldStopAfterCurrentChapter: true, stopAction: "pause_for_manual" };
}
