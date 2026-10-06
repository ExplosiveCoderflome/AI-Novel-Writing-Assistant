import { z } from "zod";
import { prisma } from "../../../../db/prisma";
import { chapterAcceptanceAssessmentSchema } from "../../../../prompting/prompts/novel/chapterAcceptance.prompts";
import { hashContent } from "../../runtime/chapterRuntimePackageBuilders";
import { hasCurrentChapterArtifactSyncBoundary } from "../../runtime/artifactSync";
import type { ChapterProductionCompletionCandidate } from "../completion/ChapterProductionCompletionPolicy";
import type { PipelineRuntimeResult } from "../../runtime/chapterRuntimePipeline";

const savedAcceptanceSchema = z.object({
  schemaVersion: z.literal(2), gate: z.literal("acceptance"), contentHash: z.string(),
  result: z.object({
    assessment: chapterAcceptanceAssessmentSchema,
    score: chapterAcceptanceAssessmentSchema.shape.score,
    issues: z.array(z.object({
      severity: z.enum(["low", "medium", "high", "critical"]),
      category: z.enum(["coherence", "repetition", "pacing", "voice", "engagement", "logic"]),
      evidence: z.string(), fixSuggestion: z.string(),
    })),
  }),
});

export class SavedChapterQualityRecoveryError extends Error {
  constructor(message: string, readonly issueCode: "runtime.data_integrity" | "quality.replan_required" = "runtime.data_integrity") {
    super(message);
  }
}

/** Old budget pauses can precede quality bookkeeping. Recover only exact saved facts, never re-audit or rewrite. */
export async function recoverSavedChapterQuality(
  novelId: string,
  chapter: ChapterProductionCompletionCandidate & { id: string },
): Promise<PipelineRuntimeResult> {
  if (!hasCurrentChapterArtifactSyncBoundary(chapter.content, chapter.artifactSyncCheckpoints ?? [])) {
    throw new SavedChapterQualityRecoveryError("本章正文或状态同步记录与保存进度不一致，请核对章节内容后继续。");
  }
  const qualityLoop = JSON.parse(chapter.riskFlags || "{}").qualityLoop;
  if (qualityLoop?.rootCauseCode === "replan_required" || qualityLoop?.recommendedAction === "replan") {
    throw new SavedChapterQualityRecoveryError("本章需要调整后续规划，请保存规划后继续。", "quality.replan_required");
  }
  const contentHash = hashContent(chapter.content!);
  const row = await prisma.chapterArtifactSyncCheckpoint.findFirst({
    where: { novelId, chapterId: chapter.id, contentHash, artifactType: "quality_gate_acceptance", status: "succeeded" },
    select: { contentHash: true, metadataJson: true }, orderBy: { updatedAt: "desc" },
  });
  let payload: unknown;
  try { payload = JSON.parse(row?.metadataJson ?? "null"); } catch { payload = null; }
  const parsed = savedAcceptanceSchema.safeParse(payload);
  if (!parsed.success || row?.contentHash !== contentHash || parsed.data.contentHash !== contentHash) {
    throw new SavedChapterQualityRecoveryError("本章缺少与保存正文对应的检查结果，请核对章节内容后继续。");
  }
  const { assessment, score, issues } = parsed.data.result;
  if (assessment.continuePolicy === "pause" || assessment.status === "needs_manual_review"
    || assessment.repairability === "plan_misalignment") {
    throw new SavedChapterQualityRecoveryError("本章检查要求调整规划或人工处理，请核对检查结果后继续。", "quality.replan_required");
  }
  return {
    reviewExecuted: true,
    pass: assessment.status === "accepted" && assessment.continuePolicy === "continue",
    score, issues, runtimePackage: null, retryCountUsed: 0,
  };
}
