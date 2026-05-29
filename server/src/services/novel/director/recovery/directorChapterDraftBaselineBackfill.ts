import {
  buildDirectorArtifactId,
  stableDirectorContentHash,
} from "../runtime/DirectorArtifactLedger";

export interface DirectorChapterDraftBaselineChapterRow {
  id: string;
  novelId: string;
  order: number;
  title?: string | null;
  content?: string | null;
  updatedAt?: Date | string | null;
}

export interface DirectorChapterDraftBaselineArtifactRow {
  id: string;
  novelId: string;
  artifactType: string;
  targetType: string;
  targetId?: string | null;
  contentTable: string;
  contentId: string;
  contentHash?: string | null;
}

export interface DirectorChapterDraftBaselineBackfillCandidate {
  id: string;
  novelId: string;
  chapterId: string;
  chapterOrder: number;
  chapterTitle: string | null;
  contentHash: string;
  artifactUpdatedAt: Date | string | null;
}

export interface DirectorChapterDraftBaselineBackfillPlan {
  candidates: DirectorChapterDraftBaselineBackfillCandidate[];
  skipped: {
    emptyDraftChapters: number;
    trackedDraftChapters: number;
  };
}

export const DIRECTOR_CHAPTER_DRAFT_BASELINE_SCHEMA_VERSION = "legacy-wrapper-v1";

export function buildDirectorChapterDraftBaselineBackfillPlan(input: {
  chapters: DirectorChapterDraftBaselineChapterRow[];
  artifacts: DirectorChapterDraftBaselineArtifactRow[];
}): DirectorChapterDraftBaselineBackfillPlan {
  const trackedChapterIds = new Set(
    input.artifacts
      .filter((artifact) => artifact.artifactType === "chapter_draft" && artifact.contentTable === "Chapter")
      .map((artifact) => artifact.contentId),
  );
  const candidates: DirectorChapterDraftBaselineBackfillCandidate[] = [];
  let emptyDraftChapters = 0;
  let trackedDraftChapters = 0;

  for (const chapter of input.chapters) {
    const contentHash = stableDirectorContentHash(chapter.content);
    if (!contentHash) {
      emptyDraftChapters += 1;
      continue;
    }
    if (trackedChapterIds.has(chapter.id)) {
      trackedDraftChapters += 1;
      continue;
    }
    candidates.push({
      id: buildDirectorArtifactId({
        type: "chapter_draft",
        targetType: "chapter",
        targetId: chapter.id,
        table: "Chapter",
        id: chapter.id,
      }),
      novelId: chapter.novelId,
      chapterId: chapter.id,
      chapterOrder: chapter.order,
      chapterTitle: chapter.title ?? null,
      contentHash,
      artifactUpdatedAt: chapter.updatedAt ?? null,
    });
  }

  return {
    candidates,
    skipped: {
      emptyDraftChapters,
      trackedDraftChapters,
    },
  };
}
