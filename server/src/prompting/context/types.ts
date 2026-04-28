import type {
  PromptContextBlock,
  PromptContextFreshnessMode,
  PromptContextRequirement,
} from "../core/promptTypes";

export interface PromptContextMessage {
  role: string;
  content: string;
  createdAt?: string;
}

export interface PromptExecutionContext {
  entrypoint: string;
  graphNode?: string;
  workflowRunId?: string;
  stepRunId?: string;
  runId?: string;
  threadId?: string;
  checkpointId?: string;
  novelId?: string;
  chapterId?: string;
  worldId?: string;
  taskId?: string;
  styleProfileId?: string;
  userGoal?: string;
  resourceBindings?: Record<string, unknown>;
  recentMessages?: PromptContextMessage[];
  metadata?: Record<string, unknown>;
}

export interface PromptContextResolverInput {
  executionContext: PromptExecutionContext;
  requirement: PromptContextRequirement;
  mode: PromptContextFreshnessMode;
}

export type PromptContextResolverResult =
  | PromptContextBlock
  | PromptContextBlock[]
  | null
  | undefined;

export interface PromptContextResolver {
  group: string;
  description?: string;
  resolve: (input: PromptContextResolverInput) => Promise<PromptContextResolverResult> | PromptContextResolverResult;
}

export interface ContextBrokerResolveInput {
  executionContext: PromptExecutionContext;
  requirements?: PromptContextRequirement[];
  mode?: PromptContextFreshnessMode;
  maxTokensBudget?: number;
}

export interface ContextBrokerResolution {
  blocks: PromptContextBlock[];
  selectedBlockIds: string[];
  droppedBlockIds: string[];
  summarizedBlockIds: string[];
  estimatedInputTokens: number;
  missingRequiredGroups: string[];
  resolverErrors: Array<{
    group: string;
    message: string;
  }>;
}

export interface ContextResolverSummary {
  group: string;
  description?: string;
}
