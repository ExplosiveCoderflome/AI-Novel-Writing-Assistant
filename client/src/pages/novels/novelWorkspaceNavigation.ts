import i18next from "i18next";
import type { DirectorDisplayStageKey } from "@ai-novel/shared/types/directorRuntime";
import type { DirectorLockScope } from "@ai-novel/shared/types/novelDirector";

export type NovelWorkspaceFlowTab =
  | "basic"
  | "story_macro"
  | "character"
  | "outline"
  | "structured"
  | "chapter"
  | "pipeline";

export type NovelWorkspaceTab = NovelWorkspaceFlowTab | "history";

export const NOVEL_WORKSPACE_FLOW_STEPS: Array<{ key: NovelWorkspaceFlowTab; label: string }> = [
  { key: "basic", label: i18next.t("gen.pages.novels.novelWorkspaceNavigation.gen_12dc9530") },
  { key: "story_macro", label: i18next.t("gen.pages.novels.novelWorkspaceNavigation.gen_15183ae2") },
  { key: "character", label: i18next.t("gen.pages.novels.novelWorkspaceNavigation.gen_3ed577c6") },
  { key: "outline", label: i18next.t("gen.pages.novels.novelWorkspaceNavigation.gen_ec71d83a") },
  { key: "structured", label: i18next.t("gen.pages.novels.novelWorkspaceNavigation.gen_4bb0dcce") },
  { key: "chapter", label: i18next.t("gen.pages.novels.novelWorkspaceNavigation.gen_663bbefc") },
  { key: "pipeline", label: i18next.t("gen.pages.novels.novelWorkspaceNavigation.gen_9b00f20b") },
];

export const NOVEL_WORKSPACE_TOOL_TABS: Array<{ key: Extract<NovelWorkspaceTab, "history">; label: string }> = [
  { key: "history", label: i18next.t("gen.pages.novels.novelWorkspaceNavigation.gen_6fdd8590") },
];

const NOVEL_WORKSPACE_TAB_SET = new Set<NovelWorkspaceTab>([
  ...NOVEL_WORKSPACE_FLOW_STEPS.map((item) => item.key),
  ...NOVEL_WORKSPACE_TOOL_TABS.map((item) => item.key),
]);

export function normalizeNovelWorkspaceTab(value: string | null | undefined): NovelWorkspaceTab {
  return value && NOVEL_WORKSPACE_TAB_SET.has(value as NovelWorkspaceTab)
    ? value as NovelWorkspaceTab
    : "basic";
}

export function isNovelWorkspaceFlowTab(value: string | null | undefined): value is NovelWorkspaceFlowTab {
  return NOVEL_WORKSPACE_FLOW_STEPS.some((item) => item.key === value);
}

export function getNovelWorkspaceFlowStepIndex(value: string | null | undefined): number {
  const normalized = normalizeNovelWorkspaceTab(value);
  if (!isNovelWorkspaceFlowTab(normalized)) {
    return -1;
  }
  return NOVEL_WORKSPACE_FLOW_STEPS.findIndex((item) => item.key === normalized);
}

export function getPreviousNovelWorkspaceFlowTab(value: string | null | undefined): NovelWorkspaceFlowTab | null {
  const currentIndex = getNovelWorkspaceFlowStepIndex(value);
  if (currentIndex <= 0) {
    return null;
  }
  return NOVEL_WORKSPACE_FLOW_STEPS[currentIndex - 1]?.key ?? null;
}

export function getNextNovelWorkspaceFlowTab(value: string | null | undefined): NovelWorkspaceFlowTab | null {
  const currentIndex = getNovelWorkspaceFlowStepIndex(value);
  if (currentIndex < 0 || currentIndex >= NOVEL_WORKSPACE_FLOW_STEPS.length - 1) {
    return null;
  }
  return NOVEL_WORKSPACE_FLOW_STEPS[currentIndex + 1]?.key ?? null;
}

export function getNovelWorkspaceTabLabel(value: string | null | undefined): string {
  const normalized = normalizeNovelWorkspaceTab(value);
  return [...NOVEL_WORKSPACE_FLOW_STEPS, ...NOVEL_WORKSPACE_TOOL_TABS].find((item) => item.key === normalized)?.label ?? i18next.t("gen.pages.novels.novelWorkspaceNavigation.gen_12dc9530");
}

export function scopeFromWorkspaceTab(tab: string): DirectorLockScope | null {
  if (tab === "basic") return "basic";
  if (tab === "story_macro") return "story_macro";
  if (tab === "character") return "character";
  if (tab === "outline") return "outline";
  if (tab === "structured") return "structured";
  if (tab === "chapter") return "chapter";
  if (tab === "pipeline") return "pipeline";
  return null;
}

export function tabFromScope(scope: DirectorLockScope | null | undefined): NovelWorkspaceFlowTab | null {
  if (!scope) {
    return null;
  }
  return scope;
}

export function tabFromWorkflowStageName(stage: string | null | undefined): NovelWorkspaceFlowTab | null {
  switch (stage) {
    case "project_setup":
      return "basic";
    case "story_macro":
      return "story_macro";
    case "character_setup":
      return "character";
    case "volume_strategy":
      return "outline";
    case "structured_outline":
      return "structured";
    case "chapter_execution":
      return "chapter";
    case "quality_repair":
      return "pipeline";
    default:
      return null;
  }
}

export function tabFromDirectorDisplayStage(stage: DirectorDisplayStageKey | null | undefined): NovelWorkspaceFlowTab | null {
  switch (stage) {
    case "project_setup":
      return "basic";
    case "story_planning":
      return "story_macro";
    case "character_setup":
      return "character";
    case "volume_strategy":
      return "outline";
    case "structured_outline":
      return "structured";
    case "chapter_execution":
      return "chapter";
    case "quality_repair":
      return "pipeline";
    default:
      return null;
  }
}

export function tabFromDirectorProgress(input: {
  currentStage?: string | null;
  currentItemKey?: string | null;
  checkpointType?: string | null;
  reviewScope?: DirectorLockScope | null;
  status?: string | null;
}): NovelWorkspaceFlowTab | null {
  const reviewTab = tabFromScope(input.reviewScope);
  if (reviewTab) {
    return reviewTab;
  }

  const checkpointTab = (() => {
    switch (input.checkpointType) {
    case "book_contract_ready":
      return "story_macro";
    case "character_setup_required":
      return "character";
    case "volume_strategy_ready":
      return "outline";
    case "chapter_batch_ready":
      return "structured";
    case "workflow_completed":
      return "pipeline";
    default:
      break;
    }
    return null;
  })();

  const currentTab = (() => {
    switch (input.currentItemKey) {
    case "novel_create":
    case "project_setup":
      return "basic";
    case "book_contract":
    case "story_macro":
    case "constraint_engine":
      return "story_macro";
    case "character_setup":
    case "character_cast_apply":
      return "character";
    case "volume_strategy":
    case "volume_skeleton":
      return "outline";
    case "beat_sheet":
    case "chapter_list":
    case "chapter_sync":
    case "chapter_detail_bundle":
      return "structured";
    case "chapter_execution":
    case "chapter_execution_node":
    case "chapter.draft.write":
    case "chapter.write":
      return "chapter";
    case "reviewing":
    case "repairing":
    case "quality_repair":
    case "chapter_quality_review_node":
    case "chapter.quality.review":
    case "chapter_state_commit_node":
    case "chapter.state.commit":
      return "pipeline";
    default:
      break;
    }
    return tabFromWorkflowStageName(input.currentStage);
  })();

  const shouldPreferActiveCurrentTab = (input.status === "running" || input.status === "queued")
    && checkpointTab
    && currentTab
    && getNovelWorkspaceFlowStepIndex(currentTab) > getNovelWorkspaceFlowStepIndex(checkpointTab);
  if (shouldPreferActiveCurrentTab) {
    return currentTab;
  }

  return checkpointTab ?? currentTab;
}
