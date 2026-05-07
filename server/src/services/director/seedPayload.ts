import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import { buildWorkflowSeedPayload } from "./helpers";

export function buildDirectorSeedPayload(
  input: DirectorConfirmRequest,
  novelId: string | null,
  extra?: Record<string, unknown>,
) {
  const directorSessionPhase = extra?.directorSession
    && typeof extra.directorSession === "object"
    && "phase" in extra.directorSession
    ? (extra.directorSession as { phase?: unknown }).phase
    : null;
  const shouldClearCandidateStage = Boolean(novelId)
    || (
      typeof directorSessionPhase === "string"
      && directorSessionPhase !== "candidate_selection"
    );
  const nextCandidateStage = shouldClearCandidateStage
    ? null
    : (Object.prototype.hasOwnProperty.call(extra ?? {}, "candidateStage")
        ? (extra as { candidateStage?: unknown }).candidateStage
        : undefined);

  return buildWorkflowSeedPayload(input, {
    novelId,
    candidate: input.candidate,
    batch: {
      id: input.batchId,
      round: input.round,
    },
    directorInput: input,
    ...extra,
    candidateStage: nextCandidateStage,
  });
}
