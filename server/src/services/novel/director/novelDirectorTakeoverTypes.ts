import type {
  DirectorProjectContextInput,
  DirectorTakeoverCheckpointSnapshot,
  DirectorTakeoverEntryStep,
  DirectorTakeoverExecutableRangeSnapshot,
  DirectorTakeoverPipelineJobSnapshot,
  DirectorTakeoverStartPhase,
  DirectorTakeoverStrategy,
} from "@ai-novel/shared/types/novelDirector";
import type { NovelWorkflowStage } from "@ai-novel/shared/types/novelWorkflow";

export interface DirectorTakeoverNovelContext extends Omit<DirectorProjectContextInput, "description"> {
  id: string;
  title: string;
  description?: string | null;
  commercialTags: string[];
}

export interface DirectorTakeoverAssetSnapshot {
  hasStoryMacroPlan: boolean;
  hasBookContract: boolean;
  characterCount: number;
  chapterCount: number;
  volumeCount: number;
  hasVolumeStrategyPlan?: boolean;
  expectedVolumeCount?: number | null;
  plannedChapterCount?: number;
  volumePlanningReady?: boolean;
  structuredOutlineReady?: boolean;
  chapterSyncReady?: boolean;
  chapterExecutionReadyForRepair?: boolean;
  firstVolumeId: string | null;
  firstVolumeChapterCount: number;
  firstVolumeBeatSheetReady?: boolean;
  firstVolumePreparedChapterCount?: number;
  structuredOutlineRecoveryStep?: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync" | "completed" | null;
  generatedChapterCount?: number;
  approvedChapterCount?: number;
  pendingRepairChapterCount?: number;
}

export interface DirectorTakeoverDecisionInput {
  entryStep: DirectorTakeoverEntryStep;
  strategy: DirectorTakeoverStrategy;
  snapshot: DirectorTakeoverAssetSnapshot;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
  requestedExecutionRange?: DirectorTakeoverExecutableRangeSnapshot | null;
  requestedPendingRepairChapterCount?: number;
}

export interface DirectorTakeoverResolvedPlan {
  entryStep: DirectorTakeoverEntryStep;
  strategy: DirectorTakeoverStrategy;
  effectiveStep: DirectorTakeoverEntryStep;
  effectiveStage: NovelWorkflowStage;
  startPhase: DirectorTakeoverStartPhase;
  resumeStage: "basic" | "story_macro" | "character" | "outline" | "structured" | "chapter" | "pipeline";
  skipSteps: DirectorTakeoverEntryStep[];
  summary: string;
  effectSummary: string;
  impactNotes: string[];
  usesCurrentBatch: boolean;
  currentStep?: DirectorTakeoverEntryStep | null;
  restartStep?: DirectorTakeoverEntryStep | null;
  executionMode: "phase" | "auto_execution";
  phase?: DirectorTakeoverStartPhase;
  resumeCheckpointType?: "front10_ready" | "chapter_batch_ready" | "replan_required" | null;
}

