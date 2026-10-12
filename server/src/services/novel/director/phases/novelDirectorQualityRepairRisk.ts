import type { DirectorQualityRepairRisk } from "@ai-novel/shared/types/novelDirector";
import {
  PIPELINE_QUALITY_NOTICE_CODE,
  PIPELINE_REPLAN_NOTICE_CODE,
  parsePipelinePayload,
} from "../../pipelineJobState";

type PipelineRepairMode = NonNullable<ReturnType<typeof parsePipelinePayload>["repairMode"]>;

export interface DirectorQualityRepairRiskInput {
  noticeCode?: string | null;
  payload?: string | null;
  remainingChapterCount: number;
}

function normalizeCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function buildDeferredQualityDebtReason(input: {
  affectedChapterCount: number;
  remainingChapterCount: number;
}): string {
  const affectedSummary = input.affectedChapterCount > 0
    ? `本次已记录 ${input.affectedChapterCount} 章质量债务`
    : "本次已记录质量债务";
  const remainingSummary = input.remainingChapterCount > 0
    ? `，仍有 ${input.remainingChapterCount} 章可继续推进`
    : "";
  return `${affectedSummary}${remainingSummary}。`;
}

export function buildDirectorQualityRepairRisk(
  input: DirectorQualityRepairRiskInput,
): DirectorQualityRepairRisk {
  const payload = parsePipelinePayload(input.payload);
  const noticeCode = input.noticeCode?.trim() || null;
  const repairMode = payload.repairMode ?? null;
  const replanCount = normalizeCount(payload.replanAlertDetails?.length);
  const qualityCount = normalizeCount(payload.qualityAlertDetails?.length);
  const recoverableRepairCount = normalizeCount(payload.recoverableRepairDetails?.length);
  const affectedChapterCount = noticeCode === PIPELINE_REPLAN_NOTICE_CODE
    ? replanCount
    : Math.max(qualityCount, recoverableRepairCount);
  const remainingChapterCount = normalizeCount(input.remainingChapterCount);

  if (noticeCode === PIPELINE_REPLAN_NOTICE_CODE || replanCount > 0) {
    return {
      riskLevel: "replan",
      autoContinuable: false,
      reason: "质量检查明确要求先处理重规划，后续章节需要确认计划后再继续。",
      noticeCode: PIPELINE_REPLAN_NOTICE_CODE,
      repairMode,
      affectedChapterCount: replanCount,
      remainingChapterCount,
    };
  }

  return {
    riskLevel: "low",
    autoContinuable: true,
    reason: buildDeferredQualityDebtReason({
      affectedChapterCount,
      remainingChapterCount,
    }),
    noticeCode: noticeCode ?? PIPELINE_QUALITY_NOTICE_CODE,
    repairMode,
    affectedChapterCount,
    remainingChapterCount,
  };
}
