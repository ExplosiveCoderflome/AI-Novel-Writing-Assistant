import type {
  NovelWorkflowCheckpoint,
  NovelWorkflowStage,
} from "@ai-novel/shared/types/novelWorkflow";
import type { TaskStatus, UnifiedTaskStep } from "@ai-novel/shared/types/task";
import { NOVEL_WORKFLOW_STAGE_STEPS, buildSteps } from "./taskCenter.shared";

const WORKFLOW_ITEM_STAGE_MAP: Partial<Record<string, NovelWorkflowStage>> = {
  project_setup: "project_setup",
  auto_director: "auto_director",
  candidate_seed_alignment: "auto_director",
  candidate_project_framing: "auto_director",
  candidate_direction_batch: "auto_director",
  candidate_title_pack: "auto_director",
  novel_create: "project_setup",
  book_contract: "story_macro",
  story_macro: "story_macro",
  constraint_engine: "story_macro",
  character_setup: "character_setup",
  character_cast_apply: "character_setup",
  volume_strategy: "volume_strategy",
  volume_skeleton: "volume_strategy",
  beat_sheet: "structured_outline",
  chapter_list: "structured_outline",
  chapter_sync: "structured_outline",
  chapter_detail_bundle: "structured_outline",
  structured_outline: "structured_outline",
  chapter_execution: "chapter_execution",
  quality_repair: "quality_repair",
};

const CHECKPOINT_STAGE_MAP: Record<NovelWorkflowCheckpoint, NovelWorkflowStage> = {
  candidate_selection_required: "auto_director",
  book_contract_ready: "story_macro",
  character_setup_required: "character_setup",
  volume_strategy_ready: "volume_strategy",
  front10_ready: "chapter_execution",
  chapter_batch_ready: "chapter_execution",
  replan_required: "quality_repair",
  workflow_completed: "quality_repair",
};

function resolveDirectorPhaseStage(phase: unknown): NovelWorkflowStage | null {
  if (phase === "candidate_selection") return "auto_director";
  if (phase === "story_macro") return "story_macro";
  if (phase === "character_setup") return "character_setup";
  if (phase === "volume_strategy") return "volume_strategy";
  if (phase === "structured_outline") return "structured_outline";
  if (phase === "front10_ready") return "chapter_execution";
  return null;
}

function resetStep(step: UnifiedTaskStep): UnifiedTaskStep {
  return {
    ...step,
    status: "idle",
    startedAt: null,
    updatedAt: null,
  };
}

function resolveWorkflowDisplayStage(input: {
  lane: string;
  novelId: string | null;
  currentItemKey: string | null;
  checkpointType: NovelWorkflowCheckpoint | null;
  directorSessionPhase?: unknown;
}): NovelWorkflowStage {
  const fromItemKey = input.currentItemKey ? WORKFLOW_ITEM_STAGE_MAP[input.currentItemKey] : null;
  if (fromItemKey) return fromItemKey;
  if (input.checkpointType) return CHECKPOINT_STAGE_MAP[input.checkpointType];
  const fromDirectorPhase = resolveDirectorPhaseStage(input.directorSessionPhase);
  if (fromDirectorPhase) return fromDirectorPhase;
  if (input.lane === "auto_director" && !input.novelId) return "auto_director";
  return "project_setup";
}

export function buildNovelWorkflowDetailSteps(input: {
  lane: string;
  novelId: string | null;
  status: TaskStatus;
  currentItemKey: string | null;
  checkpointType: NovelWorkflowCheckpoint | null;
  directorSessionPhase?: unknown;
  createdAt: string;
  updatedAt: string;
}): UnifiedTaskStep[] {
  const currentStage = resolveWorkflowDisplayStage(input);
  const steps = buildSteps(
    NOVEL_WORKFLOW_STAGE_STEPS,
    input.status,
    currentStage,
    input.createdAt,
    input.updatedAt,
  );

  if (input.lane !== "auto_director") {
    return steps.map((step) => (step.key === "auto_director" ? resetStep(step) : step));
  }

  if (currentStage === "auto_director" && !input.novelId) {
    return steps.map((step) => (step.key === "project_setup" ? resetStep(step) : step));
  }

  return steps;
}
