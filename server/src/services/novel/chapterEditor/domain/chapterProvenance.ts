import type { ChapterAuthorProvenance } from "@ai-novel/shared/types/novel";
import { buildChapterArtifactContentHash } from "../../runtime/artifactSync/ChapterArtifactContentVersion";
import { MANUAL_CHAPTER_SYNC_TYPE } from "../synchronization/ManualChapterSyncStore";

export interface ChapterProvenanceSource {
  authorProvenance?: string | null;
  humanEditedAt?: Date | string | null;
  content?: string | null;
  artifactSyncCheckpoints?: Array<{
    artifactType: string;
    contentHash: string;
  }>;
}

/**
 * Resolves the durable human-vs-AI chapter provenance label, honoring explicit locks first
 * and preserving compatibility with historical manual sync checkpoints.
 */
export function resolveChapterAuthorProvenance(chapter: ChapterProvenanceSource): ChapterAuthorProvenance {
  if (chapter.authorProvenance === "human_locked") {
    return "human_locked";
  }
  if (chapter.authorProvenance === "human_edited" || Boolean(chapter.humanEditedAt)) {
    return "human_edited";
  }
  const contentHash = buildChapterArtifactContentHash(chapter.content ?? "");
  if (chapter.artifactSyncCheckpoints?.some(
    (row) => row.artifactType === MANUAL_CHAPTER_SYNC_TYPE && row.contentHash === contentHash,
  )) {
    return "human_edited";
  }
  return "ai_generated";
}

export function isProtectedHumanChapter(chapter: ChapterProvenanceSource): boolean {
  return resolveChapterAuthorProvenance(chapter) !== "ai_generated";
}

export function nextProvenanceAfterUnlock(chapter: ChapterProvenanceSource): ChapterAuthorProvenance {
  if (chapter.humanEditedAt) {
    return "human_edited";
  }
  const contentHash = buildChapterArtifactContentHash(chapter.content ?? "");
  if (chapter.artifactSyncCheckpoints?.some(
    (row) => row.artifactType === MANUAL_CHAPTER_SYNC_TYPE && row.contentHash === contentHash,
  )) {
    return "human_edited";
  }
  return "ai_generated";
}
