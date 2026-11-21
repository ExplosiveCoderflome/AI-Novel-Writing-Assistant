import { useRef, useState } from "react";
import type { DirectorCandidateBatch } from "@ai-novel/shared/types/novelDirector";
import { candidateAnchor } from "./candidateScope";

export function useCandidateSelection(batches: DirectorCandidateBatch[]) {
  const [selectedKey, setSelectedKey] = useState("");
  const pendingAnchor = useRef("");
  const options = batches.flatMap(batch => batch.candidates.map((candidate, index) => ({
    key: candidateAnchor(batch.id, candidate.id),
    batch,
    candidate,
    number: index + 1,
  })));
  const active = options.find(option => option.key === selectedKey) ?? options[0];
  function select(key: string) {
    pendingAnchor.current = key;
    setSelectedKey(key);
  }
  return { options, active, select, pendingAnchor };
}

export type CandidateSelection = ReturnType<typeof useCandidateSelection>;
