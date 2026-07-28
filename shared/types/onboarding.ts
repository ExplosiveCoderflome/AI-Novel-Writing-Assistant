import type { LLMProvider } from "./llm";
import type { ModelRouteTaskType } from "./novel";
import type { NovelWorkflowCheckpoint } from "./novelWorkflow";
import type { TaskStatus } from "./task";

export interface QuickSetupProviderOption {
  id: LLMProvider;
  kind: "builtin" | "custom";
  name: string;
  requiresApiKey: boolean;
  configured: boolean;
  active: boolean;
  currentModel: string;
  defaultModel: string;
  currentBaseURL: string;
  defaultBaseURL: string;
  models: string[];
}

export interface QuickSetupRouteCoverage {
  configured: number;
  total: number;
  missingTaskTypes: ModelRouteTaskType[];
}

export interface QuickSetupStatus {
  readyForCreation: boolean;
  providers: QuickSetupProviderOption[];
  selectedProvider: LLMProvider | null;
  selectedModel: string | null;
  routeCoverage: QuickSetupRouteCoverage;
  blockingReasons: string[];
  recommendedAction: "configure_provider" | "repair_routes" | "start_creating";
}

export interface CompleteQuickSetupRequest {
  providerKind: "builtin" | "custom";
  provider?: LLMProvider;
  customProviderName?: string;
  apiKey?: string;
  baseURL?: string;
  model: string;
}

export interface CompleteQuickSetupResult {
  status: QuickSetupStatus;
  provider: LLMProvider;
  model: string;
  plainConnectionReady: boolean;
  structuredConnectionReady: boolean;
}

export type FirstNovelMilestoneKey =
  | "environment"
  | "idea_direction"
  | "preparation"
  | "production_choice"
  | "first_chapter";

export interface FirstNovelMilestone {
  key: FirstNovelMilestoneKey;
  title: string;
  description: string;
  status: "pending" | "current" | "completed" | "attention";
  resultSummary?: string | null;
}

export interface FirstNovelOnboardingProjection {
  graduated: boolean;
  currentMilestone: FirstNovelMilestoneKey;
  completedCount: number;
  totalCount: number;
  headline: string;
  description: string;
  reason: string;
  primaryAction: {
    label: string;
    route: string;
    kind: "navigate" | "open_quick_setup" | "resume";
  };
  novel: {
    id: string;
    title: string;
    creationExperience: "simple" | "professional";
  } | null;
  directorTask: {
    id: string;
    status: TaskStatus;
    checkpointType: NovelWorkflowCheckpoint | null;
    currentStage: string | null;
    currentItemLabel: string | null;
    lastError: string | null;
  } | null;
  firstReadableChapter: {
    id: string;
    title: string;
    order: number;
    novelId: string;
  } | null;
  milestones: FirstNovelMilestone[];
  optionalEnhancements: Array<{
    key: "knowledge" | "style" | "image";
    title: string;
    description: string;
    route: string;
  }>;
}
