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
  { key: "basic", label: "项目设定" },
  { key: "story_macro", label: "故事宏观规划" },
  { key: "character", label: "角色准备" },
  { key: "outline", label: "卷战略 / 卷骨架" },
  { key: "structured", label: "节奏 / 拆章" },
  { key: "chapter", label: "章节执行" },
  { key: "pipeline", label: "质量修复" },
];

export const NOVEL_WORKSPACE_TOOL_TABS: Array<{ key: Extract<NovelWorkspaceTab, "history">; label: string }> = [
  { key: "history", label: "版本历史" },
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
  return [...NOVEL_WORKSPACE_FLOW_STEPS, ...NOVEL_WORKSPACE_TOOL_TABS].find((item) => item.key === normalized)?.label ?? "项目设定";
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

export function tabFromDirectorProgress(input: {
  currentStage?: string | null;
  currentItemKey?: string | null;
  checkpointType?: string | null;
  reviewScope?: DirectorLockScope | null;
}): NovelWorkspaceFlowTab | null {
  const reviewTab = tabFromScope(input.reviewScope);
  if (reviewTab) {
    return reviewTab;
  }

  switch (input.checkpointType) {
    case "book_contract_ready":
      return "story_macro";
    case "character_setup_required":
      return "character";
    case "volume_strategy_ready":
      return "outline";
    case "front10_ready":
      return "structured";
    case "chapter_batch_ready":
    case "workflow_completed":
      return "pipeline";
    default:
      break;
  }

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
      return "chapter";
    case "reviewing":
    case "repairing":
    case "quality_repair":
      return "pipeline";
    default:
      break;
  }

  return tabFromWorkflowStageName(input.currentStage);
}
