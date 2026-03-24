import { Annotation } from "@langchain/langgraph";
import type { PlannerResult, AgentRuntimeResult } from "../agents/types";
import type {
  CreativeHubCheckpointRef,
  CreativeHubInterrupt,
  CreativeHubMessage,
  CreativeHubResourceBinding,
  CreativeHubThread,
  CreativeHubTurnSummary,
} from "@ai-novel/shared/types/creativeHub";
import type { FailureDiagnostic } from "@ai-novel/shared/types/agent";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

export interface CreativeHubRunSettings {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface CreativeHubGraphResult {
  runId: string | null;
  assistantOutput: string;
  checkpoint: CreativeHubCheckpointRef | null;
  interrupts: CreativeHubInterrupt[];
  status: CreativeHubThread["status"];
  latestError: string | null;
  messages: CreativeHubMessage[];
  resourceBindings: CreativeHubResourceBinding;
  diagnostics?: FailureDiagnostic;
  turnSummary: CreativeHubTurnSummary | null;
}

export const CreativeHubGraphState = Annotation.Root({
  invocationId: Annotation<string>(),
  threadId: Annotation<string>(),
  sessionId: Annotation<string>(),
  messages: Annotation<CreativeHubMessage[]>(),
  runtimeMessages: Annotation<Array<{ role: "user" | "assistant" | "system"; content: string }>>(),
  goal: Annotation<string>(),
  resourceBindings: Annotation<CreativeHubResourceBinding>(),
  runSettings: Annotation<CreativeHubRunSettings>(),
  parentCheckpointId: Annotation<string | null>(),
  runId: Annotation<string | null>(),
  plannerResult: Annotation<PlannerResult | null>(),
  executionResult: Annotation<AgentRuntimeResult | null>(),
  interrupts: Annotation<CreativeHubInterrupt[]>(),
  finalMessages: Annotation<CreativeHubMessage[]>(),
  nextBindings: Annotation<CreativeHubResourceBinding>(),
  checkpoint: Annotation<CreativeHubCheckpointRef | null>(),
  threadStatus: Annotation<CreativeHubThread["status"]>(),
  latestError: Annotation<string | null>(),
  diagnostics: Annotation<FailureDiagnostic | undefined>(),
  turnSummary: Annotation<CreativeHubTurnSummary | null>(),
});

export type CreativeHubGraphStateValue = typeof CreativeHubGraphState.State;
