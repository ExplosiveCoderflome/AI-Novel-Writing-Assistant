import type { ChapterRuntimePackage } from "@ai-novel/shared/types/chapterRuntime";
import type { Chapter, StoryPlan, StoryStateSnapshot } from "@ai-novel/shared/types/novel";
import type { CharacterResourceContext } from "@ai-novel/shared/types/characterResource";
import type { TimelineCheckReport } from "@ai-novel/shared/types/timeline";
import type { ChapterTimelineViewData, ChapterTabViewProps } from "../NovelEditView.types";

export type TimelineCheckSummary =
  | Pick<TimelineCheckReport, "status" | "score" | "issues">
  | Pick<NonNullable<ChapterRuntimePackage["timelineCheck"]>, "status" | "score" | "issues">;

export interface ChapterExecutionInsightsSidebarProps {
  selectedChapter?: Chapter;
  chapterTimeline?: ChapterTimelineViewData | null;
  isLoadingChapterTimeline?: boolean;
  latestStateSnapshot?: StoryStateSnapshot | null;
  chapterStateSnapshot?: StoryStateSnapshot | null;
  chapterRuntimePackage?: ChapterRuntimePackage | null;
  chapterPlan?: StoryPlan | null;
  chapterQualityReport?: {
    coherence: number;
    repetition: number;
    pacing: number;
    voice: number;
    engagement: number;
    overall: number;
    issues?: string | null;
  } | null;
  reviewResult?: {
    issues?: Array<{ category: string; fixSuggestion: string }>;
  } | null;
  openAuditIssues?: Array<{ id: string; auditType: string; fixSuggestion: string }>;
  chapterResourceContext?: CharacterResourceContext | null;
  isLoadingChapterResourceContext?: boolean;
  resourceWorkflowMode?: ChapterTabViewProps["resourceWorkflowMode"];
  pendingCharacterResourceProposals?: NonNullable<ChapterTabViewProps["pendingCharacterResourceProposals"]>;
  onExtractChapterResources?: ChapterTabViewProps["onExtractChapterResources"];
  isExtractingChapterResources?: boolean;
  onConfirmCharacterResourceProposal?: ChapterTabViewProps["onConfirmCharacterResourceProposal"];
  onRejectCharacterResourceProposal?: ChapterTabViewProps["onRejectCharacterResourceProposal"];
  confirmingCharacterResourceProposalId?: string;
  rejectingCharacterResourceProposalId?: string;
}

export interface ParsedSnapshotData {
  characterStates: Array<{
    characterId?: string;
    characterName?: string;
    currentGoal?: string;
    emotion?: string;
    summary?: string;
  }>;
  relationStates: Array<{
    sourceCharacterId?: string;
    sourceCharacterName?: string;
    targetCharacterId?: string;
    targetCharacterName?: string;
    summary?: string;
  }>;
  foreshadowStates: Array<{
    title?: string;
    summary?: string;
    status?: string;
  }>;
}

export interface SnapshotCharacterItem {
  label: string;
  summary: string;
  currentGoal?: string;
  emotion?: string;
}

export interface SnapshotRelationItem {
  label: string;
  summary: string;
}

export interface SnapshotForeshadowItem {
  label: string;
  summary: string;
  status: string;
}
