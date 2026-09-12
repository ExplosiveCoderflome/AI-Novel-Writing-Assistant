import {
  hasCurrentChapterArtifactSyncBoundary,
  type ChapterArtifactSyncBoundaryCheckpoint,
} from "../../runtime/artifactSync";

const TERMINAL_CONTINUE_QUALITY_LOOP_RISK_FLAG_FRAGMENT = '"terminalAction":"defer_and_continue"';
const REPLAN_REQUIRED_QUALITY_LOOP_RISK_FLAG_FRAGMENT = '"rootCauseCode":"replan_required"';
const REPLAN_ACTION_QUALITY_LOOP_RISK_FLAG_FRAGMENT = '"recommendedAction":"replan"';

export interface ChapterProductionCompletionCandidate {
  content: string | null;
  generationState: string | null;
  chapterStatus: string | null;
  riskFlags: string | null;
  artifactSyncCheckpoints?: readonly ChapterArtifactSyncBoundaryCheckpoint[];
}

/**
 * Terminal statuses are skippable only after the current text crossed the
 * shared artifact boundary. Legacy records remain recoverable without
 * generating a replacement draft.
 */
export function isCurrentChapterProductionCompleted(
  chapter: ChapterProductionCompletionCandidate,
): boolean {
  if (!hasCurrentChapterArtifactSyncBoundary(chapter.content, chapter.artifactSyncCheckpoints ?? [])) {
    return false;
  }
  if (chapter.generationState === "approved" || chapter.generationState === "published") return true;
  if (chapter.chapterStatus === "completed") return true;
  const riskFlags = chapter.riskFlags ?? "";
  return riskFlags.includes(TERMINAL_CONTINUE_QUALITY_LOOP_RISK_FLAG_FRAGMENT)
    && !riskFlags.includes(REPLAN_REQUIRED_QUALITY_LOOP_RISK_FLAG_FRAGMENT)
    && !riskFlags.includes(REPLAN_ACTION_QUALITY_LOOP_RISK_FLAG_FRAGMENT);
}
