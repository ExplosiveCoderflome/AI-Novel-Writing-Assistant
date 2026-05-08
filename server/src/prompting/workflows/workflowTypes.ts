import type { AgentPlan } from "@ai-novel/shared/types/agent";
import type { AgentName, PlannerInput, StructuredIntent } from "../../agents/types";

export interface WorkflowActionDefinition {
  agent: AgentName;
  tool: AgentPlan["actions"][number]["tool"];
  reason: string;
  input: Record<string, unknown>;
  keyPrefix: string;
}

export interface WorkflowDefinition {
  id: string;
  intent: StructuredIntent["intent"];
  kind: "single" | "workflow";
  requiresNovelContext?: boolean;
  resolve: (input: { intent: StructuredIntent; plannerInput: PlannerInput }) => WorkflowActionDefinition[];
}

export interface WorkflowResolution {
  definition: WorkflowDefinition;
  actions: WorkflowActionDefinition[];
  holdForCollaboration: boolean;
}

export function resolveChapterOrder(intent: StructuredIntent): number | null {
  const directOrder = intent.chapterSelectors.orders?.[0];
  if (typeof directOrder === "number") {
    return directOrder;
  }
  if (intent.chapterSelectors.range) {
    return intent.chapterSelectors.range.startOrder;
  }
  return null;
}
