export type NovelWorkflowLane = "manual_create" | "auto_director" | "creation_studio";

export type NovelWorkflowStage =
  | "project_setup"
  | "creation_intent"
  | "short_story_plan"
  | "short_story_draft"
  | "short_story_review"
  | "auto_director"
  | "story_macro"
  | "world_setup"
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
  | "production_experience_required"
  | "chapter_batch_ready"
  | "step_review_required"
  | "replan_required"
  | "workflow_completed";

export type NovelWorkflowMilestoneType =
  | NovelWorkflowCheckpoint
  | "rewrite_snapshot_created";

export interface NovelWorkflowMilestone {
  checkpointType: NovelWorkflowMilestoneType;
  summary: string;
  createdAt: string;
}

export interface NovelWorkflowResumeTarget {
  route: "/create" | "/novels/create" | "/novels/:id/edit" | "/novels/:id/simple" | "/novels/:id/story";
  novelId?: string | null;
  taskId?: string | null;
  lane?: NovelWorkflowLane | null;
  stage?: "basic" | "story_macro" | "world" | "character" | "outline" | "structured" | "chapter" | "pipeline";
  chapterId?: string | null;
  volumeId?: string | null;
  mode?: "director" | null;
}

export interface NovelWorkflowLaneDescriptor {
  lane: NovelWorkflowLane;
  defaultTitle: string;
  initialStage: NovelWorkflowStage;
  initialItemKey: string;
  initialItemLabel: string;
  taskQueryKey: "workspaceTaskId" | "directorTaskId" | "taskId";
}

export const NOVEL_WORKFLOW_LANE_DESCRIPTORS: Record<NovelWorkflowLane, NovelWorkflowLaneDescriptor> = {
  manual_create: {
    lane: "manual_create",
    defaultTitle: "小说流程任务",
    initialStage: "project_setup",
    initialItemKey: "project_setup",
    initialItemLabel: "等待创建项目",
    taskQueryKey: "workspaceTaskId",
  },
  auto_director: {
    lane: "auto_director",
    defaultTitle: "AI 自动导演小说",
    initialStage: "auto_director",
    initialItemKey: "auto_director",
    initialItemLabel: "等待生成候选方向",
    taskQueryKey: "directorTaskId",
  },
  creation_studio: {
    lane: "creation_studio",
    defaultTitle: "把想法写成作品",
    initialStage: "creation_intent",
    initialItemKey: "creation_intent",
    initialItemLabel: "正在理解你的想法",
    taskQueryKey: "taskId",
  },
};

export function getNovelWorkflowLaneDescriptor(lane: NovelWorkflowLane): NovelWorkflowLaneDescriptor {
  return NOVEL_WORKFLOW_LANE_DESCRIPTORS[lane];
}

export type NovelProductionExperience = "simple" | "professional";

export interface NovelProductionExperienceSelectionResponse {
  experience: NovelProductionExperience;
  workflowTaskId: string;
  novelId: string;
  targetRoute: `/novels/${string}/simple` | `/novels/${string}/edit`;
  backgroundStarted: boolean;
  commandId?: string | null;
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
