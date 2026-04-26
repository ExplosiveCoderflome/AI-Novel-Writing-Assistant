import type {
  AutoDirectorMutationActionCode,
} from "./autoDirectorFollowUp";
import type {
  DirectorTakeoverEntryStep,
  DirectorTakeoverRequest,
} from "./novelDirector";
import type { NovelWorkflowCheckpoint } from "./novelWorkflow";
import type { TaskStatus } from "./task";

export type AutoDirectorValidationSource =
  | "takeover"
  | "continue"
  | "retry"
  | "follow_up_action"
  | "batch_action"
  | "channel_callback"
  | "web"
  | "dingtalk"
  | "wecom";

export type AutoDirectorAffectedScope =
  | {
      type: "book";
      label: string;
    }
  | {
      type: "chapter_range";
      label: string;
      startOrder: number;
      endOrder: number;
    }
  | {
      type: "volume";
      label: string;
      volumeOrder: number;
    };

export type AutoDirectorValidationRequiredActionCode =
  | "clear_checkpoint"
  | "clear_failure"
  | "create_rewrite_snapshot"
  | "cancel_replaced_tasks"
  | "reset_downstream_state"
  | "revalidate_assets";

export interface AutoDirectorValidationRequiredAction {
  code: AutoDirectorValidationRequiredActionCode;
  label: string;
  riskLevel: "low" | "medium" | "high";
  safeToAutoFix: boolean;
}

export interface AutoDirectorValidationResult {
  allowed: boolean;
  blockingReasons: string[];
  warnings: string[];
  requiredActions: AutoDirectorValidationRequiredAction[];
  affectedScope: AutoDirectorAffectedScope;
  nextCheckpoint?: NovelWorkflowCheckpoint | null;
  nextAction?: string | null;
}

export interface AutoDirectorValidationAssetSnapshot {
  hasProjectSetup?: boolean;
  hasStoryMacroPlan?: boolean;
  hasBookContract?: boolean;
  characterCount?: number;
  volumeCount?: number;
  hasVolumeStrategyPlan?: boolean;
  hasStructuredOutline?: boolean;
  totalChapterCount?: number | null;
  volumeChapterRanges?: Array<{
    volumeOrder: number;
    startOrder: number;
    endOrder: number;
  }>;
  structuredOutlineChapterOrders?: number[];
}

export interface AutoDirectorTakeoverValidationInput {
  source: AutoDirectorValidationSource;
  request: Pick<DirectorTakeoverRequest, "novelId" | "entryStep" | "strategy" | "autoExecutionPlan">;
  assets: AutoDirectorValidationAssetSnapshot;
}

export interface AutoDirectorActionValidationTaskSnapshot {
  id: string;
  lane?: string | null;
  status: TaskStatus | string;
  checkpointType?: NovelWorkflowCheckpoint | string | null;
  pendingManualRecovery?: boolean | null;
  novelId?: string | null;
  seedPayload?: {
    autoExecution?: {
      enabled?: boolean;
      scopeLabel?: string | null;
      startOrder?: number;
      endOrder?: number;
      volumeOrder?: number;
      volumeTitle?: string | null;
    } | null;
  } | null;
}

export interface AutoDirectorActionValidationInput {
  source: AutoDirectorValidationSource;
  actionCode: AutoDirectorMutationActionCode;
  task: AutoDirectorActionValidationTaskSnapshot;
}

export const AUTO_DIRECTOR_FOLLOW_UP_SECTIONS = [
  "needs_validation",
  "exception",
  "pending",
  "auto_progress",
  "replaced",
] as const;

export type AutoDirectorFollowUpSection = (typeof AUTO_DIRECTOR_FOLLOW_UP_SECTIONS)[number];

export interface AutoDirectorFollowUpSectionInput {
  status: TaskStatus | string;
  checkpointType?: NovelWorkflowCheckpoint | string | null;
  pendingManualRecovery?: boolean | null;
  replacementTaskId?: string | null;
  validationResult?: AutoDirectorValidationResult | null;
}

export const AUTO_DIRECTOR_TAKEOVER_ENTRY_ORDER: Record<DirectorTakeoverEntryStep, number> = {
  basic: 1,
  story_macro: 2,
  character: 3,
  outline: 4,
  structured: 5,
  chapter: 6,
  pipeline: 7,
};
