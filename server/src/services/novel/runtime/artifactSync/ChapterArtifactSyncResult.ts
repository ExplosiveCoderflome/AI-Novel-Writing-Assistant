export type ChapterArtifactSyncStatus = "completed" | "pending" | "degraded" | "failed";

export interface ChapterArtifactSyncResult {
  status: ChapterArtifactSyncStatus;
  contentHash: string;
  completedArtifacts: string[];
  reason?: string;
  characterReviewId?: string;
}

export function mergeChapterArtifactSyncResults(
  contentHash: string,
  ...results: ChapterArtifactSyncResult[]
): ChapterArtifactSyncResult {
  const status = results.some((result) => result.status === "failed")
    ? "failed"
    : results.some((result) => result.status === "pending")
      ? "pending"
      : results.some((result) => result.status === "degraded")
        ? "degraded"
        : "completed";
  return {
    status,
    contentHash,
    completedArtifacts: [...new Set(results.flatMap((result) => result.completedArtifacts))],
    reason: results.find((result) => result.status === status)?.reason,
    characterReviewId: results.find(result => result.characterReviewId)?.characterReviewId,
  };
}

export class CharacterCandidateReviewRequiredError extends Error {
  constructor(readonly reviewId: string) {
    super("本章正文已保存，请确认本章人物后继续；可选择新增、关联已有角色或忽略。");
    this.name = "CharacterCandidateReviewRequiredError";
  }
}

export class ChapterArtifactSyncBoundaryError extends Error {
  constructor(readonly result: ChapterArtifactSyncResult) {
    super(result.reason || `章节资产同步未完成（${result.status}）。`);
    this.name = "ChapterArtifactSyncBoundaryError";
  }
}

/** A saved chapter changed while a background artifact run was still active. */
export class ChapterArtifactContentVersionError extends Error {
  constructor(message = "章节正文版本已变化，已拒绝过期资产结果。") {
    super(message);
    this.name = "ChapterArtifactContentVersionError";
  }
}
