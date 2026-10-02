import { prisma } from "../../db/prisma";
import type { StepContext, BatchJob, BatchOutcome } from "../../modules/director";
import { parsePipelinePayload, PIPELINE_REPLAN_NOTICE_CODE } from "../../services/novel/pipelineJobState";
import { isCurrentChapterProductionCompleted } from "../../services/novel/production/completion";
import { CHAPTER_ARTIFACT_BOUNDARY_TYPE } from "../../services/novel/runtime/artifactSync";
import { DIRECTOR_ISSUE_CATALOG_BY_CODE } from "@ai-novel/shared/types/directorIssue";

export async function readBatchOutcome(job: BatchJob, context: StepContext): Promise<BatchOutcome> {
  const saved = await prisma.generationJob.findUniqueOrThrow({where: {id: job.id}});
  const payload = parsePipelinePayload(saved.payload);
  if (payload.directorNext?.runId !== context.runId || saved.novelId !== context.contract.novelId) {
    return {chapters: [], debts: [], stopSignal: {kind: "data_integrity", reason: "正文作业不属于本次创作运行。"}};
  }
  const chapters = await prisma.chapter.findMany({where: {novelId: saved.novelId, order: {gte: saved.startOrder, lte: saved.endOrder}},
    orderBy: {order: "asc"}, include: {artifactSyncCheckpoints: {where: {artifactType: CHAPTER_ARTIFACT_BOUNDARY_TYPE, status: "succeeded"},
      select: {contentHash: true, metadataJson: true}, orderBy: {updatedAt: "desc"}, take: 6}}});
  const decisions = payload.directorNext.decisions.slice(payload.directorNext.resolvedDecisionCount ?? 0);
  const debts = decisions.filter(decision => decision.chapterOrder && decision.action !== "auto_retry" && DIRECTOR_ISSUE_CATALOG_BY_CODE[decision.issueCode].category === "quality")
    .map(decision => ({chapterOrder: decision.chapterOrder!, code: decision.issueCode, action: decision.action}));
  const outcome: BatchOutcome = {chapters: chapters.map(chapter => ({...chapter, closed: isCurrentChapterProductionCompleted(chapter)})), debts};
  const replan = decisions.find(decision => decision.issueCode === "quality.replan_required");
  if (replan || jobNotice(saved.payload) === PIPELINE_REPLAN_NOTICE_CODE) {
    return {...outcome, stopSignal: {kind: "replan", action: "stop_for_replan", reason: replan?.reason ?? "章节生产明确要求重规划后续路线。"}};
  }
  const terminal = [...decisions].reverse().find(decision => decision.action === "fail_task" || decision.action === "pause_for_manual");
  if (terminal?.action === "fail_task") {
    const category = DIRECTOR_ISSUE_CATALOG_BY_CODE[terminal.issueCode].category;
    return {...outcome, stopSignal: {kind: category === "generation" ? "no_usable_content" : "safety", action: "fail_task", reason: terminal.reason}};
  }
  if (saved.pendingManualRecovery && terminal?.action === "pause_for_manual") {
    const quality = DIRECTOR_ISSUE_CATALOG_BY_CODE[terminal.issueCode].category === "quality";
    if (quality && context.contract.issuePolicy.mode !== "quality_first") throw new Error("完成优先运行出现了不一致的质量暂停策略。");
    return {...outcome, stopSignal: {kind: "manual_recovery", action: "pause_for_manual", source: quality ? "quality" : "runtime", reason: terminal.reason}};
  }
  return outcome;
}

// The marker is produced from a structured global-replan branch, not from matching the error message.
function jobNotice(payload: string | null): string | null {
  return parsePipelinePayload(payload).replanAlertDetails?.length ? PIPELINE_REPLAN_NOTICE_CODE : null;
}
