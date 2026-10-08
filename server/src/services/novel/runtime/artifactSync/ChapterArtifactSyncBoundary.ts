import { buildChapterArtifactContentHash } from "./ChapterArtifactContentVersion";

/** Checkpoint type that proves current chapter text crossed the artifact boundary. */
export const CHAPTER_ARTIFACT_BOUNDARY_TYPE = "artifact_sync_boundary:v1";

export type ChapterArtifactSyncBoundaryOutcome = "completed" | "degraded";

export interface ChapterArtifactSyncBoundaryCheckpoint {
  contentHash: string;
  metadataJson: string | null;
}

/** Reads only a successful boundary for the exact persisted chapter content. */
export function getCurrentChapterArtifactSyncOutcome(
  content: string | null | undefined,
  checkpoints: readonly ChapterArtifactSyncBoundaryCheckpoint[],
  options: {requireAppliedDelta?: boolean} = {},
): ChapterArtifactSyncBoundaryOutcome | null {
  if (!content?.trim()) return null;
  const current = checkpoints.find((checkpoint) => (
    checkpoint.contentHash === buildChapterArtifactContentHash(content)
  ));
  if (!current?.metadataJson) return null;
  try {
    const metadata: unknown = JSON.parse(current.metadataJson);
    const outcome = metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as { outcome?: unknown }).outcome
      : null;
    if (outcome === "degraded" && options.requireAppliedDelta
      && !(Array.isArray((metadata as {completedArtifacts?: unknown}).completedArtifacts)
        && ((metadata as {completedArtifacts: unknown[]}).completedArtifacts).includes("artifact_delta"))) return null;
    return outcome === "completed" || outcome === "degraded" ? outcome : null;
  } catch {
    return null;
  }
}

export function hasCurrentChapterArtifactSyncBoundary(
  content: string | null | undefined,
  checkpoints: readonly ChapterArtifactSyncBoundaryCheckpoint[],
  options: {requireAppliedDelta?: boolean} = {},
): boolean {
  return getCurrentChapterArtifactSyncOutcome(content, checkpoints, options) !== null;
}
