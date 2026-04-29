import type { DirectorQualityRepairRisk } from "@ai-novel/shared/types/novelDirector";
import {
  PIPELINE_QUALITY_NOTICE_CODE,
  PIPELINE_REPLAN_NOTICE_CODE,
  parsePipelinePayload,
} from "../pipelineJobState";

type PipelineRepairMode = NonNullable<ReturnType<typeof parsePipelinePayload>["repairMode"]>;

export interface DirectorQualityRepairRiskInput {
  noticeCode?: string | null;
  noticeSummary?: string | null;
  payload?: string | null;
  remainingChapterCount: number;
  totalChapterCount: number;
}

function normalizeCount(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function buildReason(input: {
  noticeCode?: string | null;
  repairMode?: PipelineRepairMode | null;
  affectedChapterCount: number;
  remainingChapterCount: number;
}): string {
  if (input.repairMode === "heavy_repair") {
    return "本次修复属于大范围返工，建议人工确认修复结果后再继续章节执行。";
  }
  if (input.affectedChapterCount > 0) {
    return `本次质量修复影响 ${input.affectedChapterCount} 章，仍有 ${input.remainingChapterCount} 章待继续。`;
  }
  return `本次质量修复未标记大范围返工，仍有 ${input.remainingChapterCount} 章待继续。`;
}

export function buildDirectorQualityRepairRisk(
  input: DirectorQualityRepairRiskInput,
): DirectorQualityRepairRisk {
  const payload = parsePipelinePayload(input.payload);
  const rawNoticeCode = input.noticeCode?.trim() || null;
  const isLegacyReplanNotice = rawNoticeCode === PIPELINE_REPLAN_NOTICE_CODE;
  const noticeCode = isLegacyReplanNotice ? PIPELINE_QUALITY_NOTICE_CODE : rawNoticeCode;
  const repairMode = isLegacyReplanNotice ? null : payload.repairMode ?? null;
  const qualityCount = normalizeCount(payload.qualityAlertDetails?.length);
  const affectedChapterCount = qualityCount;
  const remainingChapterCount = normalizeCount(input.remainingChapterCount);
  const totalChapterCount = Math.max(1, normalizeCount(input.totalChapterCount) || remainingChapterCount || 1);
  const largeScopeThreshold = Math.max(3, Math.ceil(totalChapterCount * 0.25));

  const isLargeScope = repairMode === "heavy_repair" || affectedChapterCount >= largeScopeThreshold;
  if (isLargeScope) {
    return {
      riskLevel: "large_scope",
      autoContinuable: false,
      reason: buildReason({
        noticeCode: noticeCode ?? PIPELINE_QUALITY_NOTICE_CODE,
        repairMode,
        affectedChapterCount,
        remainingChapterCount,
      }),
      noticeCode: noticeCode ?? PIPELINE_QUALITY_NOTICE_CODE,
      repairMode,
      affectedChapterCount,
      remainingChapterCount,
    };
  }

  return {
    riskLevel: "low",
    autoContinuable: true,
    reason: buildReason({
      noticeCode: noticeCode ?? PIPELINE_QUALITY_NOTICE_CODE,
      repairMode,
      affectedChapterCount,
      remainingChapterCount,
    }),
    noticeCode: noticeCode ?? PIPELINE_QUALITY_NOTICE_CODE,
    repairMode,
    affectedChapterCount,
    remainingChapterCount,
  };
}
