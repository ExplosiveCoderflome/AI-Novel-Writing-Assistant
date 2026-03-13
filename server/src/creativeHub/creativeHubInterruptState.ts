import { Annotation } from "@langchain/langgraph";
import type { AgentRuntimeResult } from "../agents/types";
import type { CreativeHubCheckpointRef, CreativeHubInterrupt, CreativeHubMessage, CreativeHubResourceBinding, CreativeHubThread } from "@ai-novel/shared/types/creativeHub";
import type { FailureDiagnostic } from "@ai-novel/shared/types/agent";

export const CreativeHubInterruptGraphState = Annotation.Root({
  invocationId: Annotation<string>(),
  threadId: Annotation<string>(),
  interruptId: Annotation<string>(),
  action: Annotation<"approve" | "reject">(),
  note: Annotation<string | undefined>(),
  runId: Annotation<string | null>(),
  parentCheckpointId: Annotation<string | null>(),
  messages: Annotation<CreativeHubMessage[]>(),
  resourceBindings: Annotation<CreativeHubResourceBinding>(),
  executionResult: Annotation<AgentRuntimeResult | null>(),
  interrupts: Annotation<CreativeHubInterrupt[]>(),
  finalMessages: Annotation<CreativeHubMessage[]>(),
  nextBindings: Annotation<CreativeHubResourceBinding>(),
  checkpoint: Annotation<CreativeHubCheckpointRef | null>(),
  threadStatus: Annotation<CreativeHubThread["status"]>(),
  latestError: Annotation<string | null>(),
  diagnostics: Annotation<FailureDiagnostic | undefined>(),
});

export type CreativeHubInterruptGraphStateValue = typeof CreativeHubInterruptGraphState.State;
