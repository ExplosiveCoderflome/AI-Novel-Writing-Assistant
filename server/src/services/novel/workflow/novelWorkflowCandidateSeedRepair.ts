import { randomUUID } from "node:crypto";
import type { DirectorWorkflowSeedPayload } from "../director/novelDirectorHelpers";
import { parseSeedPayload } from "./novelWorkflow.shared";

interface AutoDirectorCandidateSeedRepairResult {
  seedPayloadJson: string;
  staleTargetedCandidate: boolean;
}

function normalizeId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function batchHasCandidateTarget(batch: unknown, batchId: string, candidateId: string): boolean {
  if (!batch || typeof batch !== "object" || Array.isArray(batch)) {
    return false;
  }
  const typedBatch = batch as { id?: unknown; candidates?: unknown };
  if (normalizeId(typedBatch.id) !== batchId || !Array.isArray(typedBatch.candidates)) {
    return false;
  }
  return typedBatch.candidates.some((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return false;
    }
    return normalizeId((candidate as { id?: unknown }).id) === candidateId;
  });
}

export function repairAutoDirectorCandidateSeedPayload(
  seedPayloadJson: string | null | undefined,
): AutoDirectorCandidateSeedRepairResult | null {
  const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(seedPayloadJson);
  if (!seedPayload || !Array.isArray(seedPayload.batches) || seedPayload.batches.length === 0) {
    return null;
  }

  let changed = false;
  const repairedBatches = seedPayload.batches.map((batch) => {
    if (!batch || typeof batch !== "object" || Array.isArray(batch)) {
      return batch;
    }
    const typedBatch = batch as { candidates?: unknown };
    if (!Array.isArray(typedBatch.candidates)) {
      return batch;
    }

    let batchChanged = false;
    const repairedCandidates = typedBatch.candidates.map((candidate) => {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        return candidate;
      }

      const typedCandidate = candidate as Record<string, unknown> & { id?: unknown };
      const currentId = normalizeId(typedCandidate.id);
      if (currentId) {
        if (typedCandidate.id === currentId) {
          return candidate;
        }
        batchChanged = true;
        changed = true;
        return {
          ...typedCandidate,
          id: currentId,
        };
      }

      batchChanged = true;
      changed = true;
      return {
        ...typedCandidate,
        id: randomUUID(),
      };
    });

    if (!batchChanged) {
      return batch;
    }

    return {
      ...batch,
      candidates: repairedCandidates,
    };
  });

  const candidateStage = seedPayload.candidateStage;
  const stageBatchId = normalizeId(candidateStage?.batchId);
  const stageCandidateId = normalizeId(candidateStage?.candidateId);
  const staleTargetedCandidate = Boolean(
    stageBatchId
    && stageCandidateId
    && !repairedBatches.some((batch) => batchHasCandidateTarget(batch, stageBatchId, stageCandidateId)),
  );

  const nextSeedPayload = {
    ...seedPayload,
    batches: repairedBatches,
    candidateStage: staleTargetedCandidate ? null : candidateStage,
  };
  if (!changed && !staleTargetedCandidate) {
    return null;
  }

  return {
    seedPayloadJson: JSON.stringify(nextSeedPayload),
    staleTargetedCandidate,
  };
}
