import type {
  ChapterTabViewProps,
  CharacterTabViewProps,
  NovelTaskDrawerState,
  NovelEditTakeoverState,
  NovelEditViewProps,
  PipelineTabViewProps,
} from "./components/NovelEditView.types";
import type { DirectorTakeoverEntryStep } from "@ai-novel/shared/types/novelDirector";
import type { CharacterResourceProposalSummary } from "@ai-novel/shared/types/characterResource";
import type { NovelWorkspaceFlowTab } from "./novelWorkspaceNavigation";

export type BuildNovelEditChapterTabInput = Omit<ChapterTabViewProps, "directorTakeoverEntry">;

export function buildNovelEditChapterTab(input: BuildNovelEditChapterTabInput): ChapterTabViewProps {
  return {
    ...input,
    directorTakeoverEntry: undefined,
  };
}

export type BuildNovelEditPipelineTabInput = Omit<PipelineTabViewProps, "directorTakeoverEntry">;

export function buildNovelEditPipelineTab(input: BuildNovelEditPipelineTabInput): PipelineTabViewProps {
  return {
    ...input,
    directorTakeoverEntry: undefined,
  };
}

export type BuildNovelEditCharacterTabInput = Omit<CharacterTabViewProps, "directorTakeoverEntry">;

export function buildNovelEditCharacterTab(input: BuildNovelEditCharacterTabInput): CharacterTabViewProps {
  return {
    ...input,
    directorTakeoverEntry: undefined,
  };
}

export type BuildNovelEditExportControlsInput = NovelEditViewProps["exportControls"];

export function buildNovelEditExportControls(input: BuildNovelEditExportControlsInput): NovelEditViewProps["exportControls"] {
  return input;
}

export type BuildNovelEditTaskDrawerInput = NovelTaskDrawerState;

export function buildNovelEditTaskDrawer(input: BuildNovelEditTaskDrawerInput): NovelTaskDrawerState {
  return input;
}

export function resolveNovelEditActiveTakeoverStep(activeTab: string): DirectorTakeoverEntryStep {
  if (activeTab === "story_macro") {
    return "story_macro";
  }
  if (activeTab === "character") {
    return "character";
  }
  if (activeTab === "outline") {
    return "outline";
  }
  if (activeTab === "structured") {
    return "structured";
  }
  if (activeTab === "chapter") {
    return "chapter";
  }
  if (activeTab === "pipeline") {
    return "pipeline";
  }
  return "basic";
}

export function createNovelEditTaskDrawerResourceProposalHandler(input: {
  setSelectedChapterId: (chapterId: string) => void;
  setActiveTab: (tab: NovelWorkspaceFlowTab) => void;
  setIsTaskDrawerOpen: (open: boolean) => void;
}): (proposal: CharacterResourceProposalSummary) => void {
  return (proposal) => {
    if (proposal.chapterId) {
      input.setSelectedChapterId(proposal.chapterId);
      input.setActiveTab("chapter");
    } else {
      input.setActiveTab("character");
    }
    input.setIsTaskDrawerOpen(false);
  };
}
