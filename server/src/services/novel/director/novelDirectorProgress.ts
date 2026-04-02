export const DIRECTOR_PROGRESS = {
  candidateSeedAlignment: 0.03,
  candidateProjectFraming: 0.06,
  candidateDirectionBatch: 0.1,
  candidateTitlePack: 0.14,
  novelCreate: 0.08,
  bookContract: 0.14,
  storyMacro: 0.22,
  constraintEngine: 0.30,
  characterSetup: 0.36,
  characterSetupReady: 0.42,
  volumeStrategy: 0.48,
  volumeSkeleton: 0.58,
  volumeStrategyReady: 0.66,
  beatSheet: 0.72,
  chapterList: 0.78,
  chapterSync: 0.82,
  chapterDetailStart: 0.82,
  chapterDetailDone: 0.92,
  front10Ready: 0.92,
} as const;

export const DIRECTOR_CHAPTER_DETAIL_MODES = ["purpose", "boundary", "task_sheet"] as const;

export type DirectorProgressItemKey =
  | "candidate_seed_alignment"
  | "candidate_project_framing"
  | "candidate_direction_batch"
  | "candidate_title_pack"
  | "novel_create"
  | "book_contract"
  | "story_macro"
  | "constraint_engine"
  | "character_setup"
  | "character_cast_apply"
  | "volume_strategy"
  | "volume_skeleton"
  | "beat_sheet"
  | "chapter_list"
  | "chapter_sync"
  | "chapter_detail_bundle";

export function buildChapterDetailBundleProgress(completedSteps: number, totalSteps: number): number {
  if (totalSteps <= 0) {
    return DIRECTOR_PROGRESS.chapterDetailDone;
  }
  const normalizedCompletedSteps = Math.max(0, Math.min(completedSteps, totalSteps));
  const ratio = normalizedCompletedSteps / totalSteps;
  return DIRECTOR_PROGRESS.chapterDetailStart
    + ((DIRECTOR_PROGRESS.chapterDetailDone - DIRECTOR_PROGRESS.chapterDetailStart) * ratio);
}

export function buildChapterDetailBundleLabel(
  chapterIndex: number,
  totalChapters: number,
  detailMode: (typeof DIRECTOR_CHAPTER_DETAIL_MODES)[number],
): string {
  return `正在细化第 ${chapterIndex}/${totalChapters} 章 · ${detailMode}`;
}
