import type { DirectorAutoExecutionPlan } from "@ai-novel/shared/types/novelDirector";
import type { DirectorWorkflowSeedPayload } from "../novel/director/runtime/novelDirectorHelpers";
import { parseSeedPayload } from "../novel/workflow/novelWorkflow.shared";

function positiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.round(value);
  return normalized > 0 ? normalized : null;
}

function labelFromPlan(plan: DirectorAutoExecutionPlan | null | undefined): string | null {
  if (!plan || typeof plan !== "object") {
    return null;
  }
  if (plan.mode === "book") {
    return "全书";
  }
  if (plan.mode === "volume") {
    return `第 ${positiveInteger(plan.volumeOrder) ?? 1} 卷`;
  }
  if (plan.mode === "chapter_range") {
    const startOrder = positiveInteger(plan.startOrder);
    const endOrder = positiveInteger(plan.endOrder) ?? startOrder;
    if (!startOrder || !endOrder) {
      return null;
    }
    return startOrder === endOrder
      ? `第 ${startOrder} 章`
      : `第 ${startOrder}-${endOrder} 章`;
  }
  return null;
}

export function resolveAutoExecutionScopeLabel(seedPayload: DirectorWorkflowSeedPayload | null | undefined): string | null {
  const explicit = seedPayload?.autoExecution?.scopeLabel;
  if (typeof explicit === "string" && explicit.trim()) {
    return explicit.trim();
  }
  return labelFromPlan(
    seedPayload?.autoExecutionPlan
    ?? seedPayload?.directorInput?.autoExecutionPlan
    ?? seedPayload?.autoExecution
    ?? null,
  );
}

export function parseAutoExecutionScopeLabel(seedPayloadJson: string | null | undefined): string | null {
  return resolveAutoExecutionScopeLabel(parseSeedPayload<DirectorWorkflowSeedPayload>(seedPayloadJson));
}
