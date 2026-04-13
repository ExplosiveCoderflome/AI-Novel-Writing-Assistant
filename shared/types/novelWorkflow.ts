export type NovelWorkflowLane = "manual_create" | "auto_director";

export type NovelWorkflowStage =
  | "project_setup"
  | "auto_director"
  | "story_macro"
  | "character_setup"
  | "volume_strategy"
  | "structured_outline"
  | "chapter_execution"
  | "quality_repair";

export type NovelWorkflowCheckpoint =
  | "candidate_selection_required"
  | "book_contract_ready"
  | "character_setup_required"
  | "volume_strategy_ready"
  | "front10_ready"
  | "chapter_batch_ready"
  | "replan_required"
  | "workflow_completed";

export interface NovelWorkflowResumeTarget {
  route: "/novels/create" | "/novels/:id/edit";
  novelId?: string | null;
  taskId?: string | null;
  stage?: "basic" | "story_macro" | "character" | "outline" | "structured" | "chapter" | "pipeline";
  chapterId?: string | null;
  volumeId?: string | null;
  mode?: "director" | null;
}

export interface BookContract {
  id: string;
  novelId: string;
  readingPromise: string;
  protagonistFantasy: string;
  coreSellingPoint: string;
  chapter3Payoff: string;
  chapter10Payoff: string;
  chapter30Payoff: string;
  escalationLadder: string;
  relationshipMainline: string;
  absoluteRedLines: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BookContractDraft {
  readingPromise: string;
  protagonistFantasy: string;
  coreSellingPoint: string;
  chapter3Payoff: string;
  chapter10Payoff: string;
  chapter30Payoff: string;
  escalationLadder: string;
  relationshipMainline: string;
  absoluteRedLines: string[];
}
