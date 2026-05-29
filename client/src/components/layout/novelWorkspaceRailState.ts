import type { DirectorTakeoverEntryStep } from "@ai-novel/shared/types/novelDirector";
import { DIRECTOR_TAKEOVER_ENTRY_STEPS } from "@ai-novel/shared/types/novelDirector";
import type { NovelWorkspaceFlowTab } from "@/pages/novels/novelWorkspaceNavigation";

export type NovelWorkspaceStepReadiness = Record<NovelWorkspaceFlowTab, boolean>;

const WORKSPACE_FLOW_ORDER: NovelWorkspaceFlowTab[] = [
  "basic",
  "story_macro",
  "character",
  "outline",
  "structured",
  "chapter",
  "pipeline",
];

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

export function resolveAutoDirectorResetStepsForWorkflowProgress(
  resetSteps: ReadonlySet<NovelWorkspaceFlowTab>,
  workflowCurrentTab: NovelWorkspaceFlowTab | null | undefined,
): Set<NovelWorkspaceFlowTab> {
  if (resetSteps.size === 0 || !workflowCurrentTab) {
    return new Set(resetSteps);
  }
  const currentIndex = WORKSPACE_FLOW_ORDER.indexOf(workflowCurrentTab);
  if (currentIndex < 0) {
    return new Set(resetSteps);
  }
  return new Set(
    Array.from(resetSteps).filter((step) => {
      const stepIndex = WORKSPACE_FLOW_ORDER.indexOf(step);
      return stepIndex < 0 || stepIndex >= currentIndex;
    }),
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
