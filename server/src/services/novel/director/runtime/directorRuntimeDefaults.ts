import type {
  DirectorPolicyMode,
  DirectorRuntimePolicySnapshot,
  DirectorRuntimeSnapshot,
} from "@ai-novel/shared/types/directorRuntime";

export function buildDefaultDirectorPolicy(
  mode: DirectorPolicyMode = "run_until_gate",
): DirectorRuntimePolicySnapshot {
  return {
    mode,
    mayOverwriteUserContent: false,
    maxAutoRepairAttempts: 1,
    allowExpensiveReview: false,
    modelTier: "balanced",
    updatedAt: new Date().toISOString(),
  };
}

export function buildEmptyDirectorRuntimeSnapshot(input: {
  runId: string;
  novelId?: string | null;
  entrypoint?: string | null;
  policyMode?: DirectorPolicyMode;
}): DirectorRuntimeSnapshot {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    runId: input.runId,
    novelId: input.novelId ?? null,
    entrypoint: input.entrypoint ?? null,
    policy: {
      ...buildDefaultDirectorPolicy(input.policyMode),
      updatedAt: now,
    },
    steps: [],
    events: [],
    artifacts: [],
    lastWorkspaceAnalysis: null,
    updatedAt: now,
  };
}
