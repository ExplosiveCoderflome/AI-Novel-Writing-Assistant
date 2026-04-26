import type { DirectorTakeoverEntryStep } from "@ai-novel/shared/types/novelDirector";
import { DIRECTOR_TAKEOVER_ENTRY_STEPS } from "@ai-novel/shared/types/novelDirector";
import type { NovelWorkspaceFlowTab } from "@/pages/novels/novelWorkspaceNavigation";

export type NovelWorkspaceStepReadiness = Record<NovelWorkspaceFlowTab, boolean>;

type DownstreamReset = {
  preserveAssets?: unknown;
  resetStatus?: unknown;
  resetSteps?: unknown;
};

function isDirectorTakeoverEntryStep(value: unknown): value is DirectorTakeoverEntryStep {
  return typeof value === "string"
    && DIRECTOR_TAKEOVER_ENTRY_STEPS.includes(value as DirectorTakeoverEntryStep);
}

export function extractAutoDirectorResetStepsFromMeta(
  meta: Record<string, unknown> | null | undefined,
): Set<NovelWorkspaceFlowTab> {
  const seedPayload = meta && typeof meta === "object"
    ? (meta as { seedPayload?: { takeover?: { downstreamReset?: DownstreamReset } } }).seedPayload
    : null;
  const reset = seedPayload?.takeover?.downstreamReset;
  if (!reset || reset.resetStatus !== "not_started" || !Array.isArray(reset.resetSteps)) {
    return new Set();
  }
  return new Set(
    reset.resetSteps.filter((step): step is NovelWorkspaceFlowTab => isDirectorTakeoverEntryStep(step)),
  );
}

export function applyAutoDirectorResetStepReadiness(
  readiness: NovelWorkspaceStepReadiness,
  resetSteps: ReadonlySet<NovelWorkspaceFlowTab>,
): NovelWorkspaceStepReadiness {
  if (resetSteps.size === 0) {
    return readiness;
  }
  return {
    ...readiness,
    ...Object.fromEntries(
      Array.from(resetSteps).map((step) => [step, false]),
    ),
  } as NovelWorkspaceStepReadiness;
}
