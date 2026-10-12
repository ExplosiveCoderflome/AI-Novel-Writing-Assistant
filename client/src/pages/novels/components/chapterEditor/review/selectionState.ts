import type { ChapterEditorDiffChange } from "@ai-novel/shared/types/chapterEditor/document";

export interface CandidateSelectionState {
  sessionId: string;
  byCandidate: Record<string, string[]>;
}

export function readCandidateSelection(
  state: CandidateSelectionState, sessionId: string, candidateId: string, changes: readonly ChapterEditorDiffChange[],
): Set<string> {
  const stored = state.sessionId === sessionId ? state.byCandidate[candidateId] : undefined;
  return new Set(changes.filter((change) => stored === undefined || stored.includes(change.id)).map((change) => change.id));
}

export function updateCandidateSelection(
  state: CandidateSelectionState, sessionId: string, candidateId: string, selected: ReadonlySet<string>,
): CandidateSelectionState {
  return { sessionId, byCandidate: { ...(state.sessionId === sessionId ? state.byCandidate : {}), [candidateId]: [...selected] } };
}
