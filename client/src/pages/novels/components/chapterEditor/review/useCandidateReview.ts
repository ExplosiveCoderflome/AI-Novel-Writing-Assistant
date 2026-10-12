import { useMemo, useState } from "react";
import type { ChapterEditorCandidate } from "@ai-novel/shared/types/novel";
import { applySelectedChapterEditorDiff, groupChapterEditorDiffChanges } from "@ai-novel/shared/types/chapterEditor/document";
import { readCandidateSelection, updateCandidateSelection, type CandidateSelectionState } from "./selectionState";

export function useCandidateReview(sessionId: string, original: string, candidate: ChapterEditorCandidate | null) {
  const [choices, setChoices] = useState<CandidateSelectionState>({ sessionId: "", byCandidate: {} });
  const changes = useMemo(() => groupChapterEditorDiffChanges(candidate?.diffChunks ?? []), [candidate]);
  const selectedChangeIds = useMemo(
    () => readCandidateSelection(choices, sessionId, candidate?.id ?? "", changes),
    [changes, choices, sessionId, candidate?.id],
  );
  const result = useMemo(() => {
    if (!candidate) return { text: original, error: null };
    try {
      return { text: applySelectedChapterEditorDiff(original, candidate.content, candidate.diffChunks, selectedChangeIds), error: null };
    } catch (error) {
      return { text: original, error: error instanceof Error ? error.message : "候选对比无法读取，请重新生成。" };
    }
  }, [candidate, original, selectedChangeIds]);

  return {
    changes, selectedChangeIds, resultText: result.text, error: result.error,
    toggleChange: (id: string) => {
      if (!candidate || !changes.some((change) => change.id === id)) return;
      setChoices((current) => {
        const selected = readCandidateSelection(current, sessionId, candidate.id, changes);
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        return updateCandidateSelection(current, sessionId, candidate.id, selected);
      });
    },
    selectAll: (selected: boolean) => {
      if (!candidate) return;
      setChoices((current) => updateCandidateSelection(current, sessionId, candidate.id,
        new Set(selected ? changes.map((change) => change.id) : [])));
    },
  };
}
