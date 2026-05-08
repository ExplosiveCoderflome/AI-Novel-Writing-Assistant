import type { NovelMaterialGroupDefinition } from "./types";

export const NOVEL_MATERIAL_GROUPS: NovelMaterialGroupDefinition[] = [
  {
    group: "novel_basics",
    title: "小说基础信息",
    required: true,
    importance: "must",
    sourceType: "novel",
  },
  {
    group: "book_contract",
    title: "书级约定",
    required: true,
    importance: "must",
    sourceType: "novel",
    aliases: ["story_macro"],
  },
  {
    group: "chapter_mission",
    title: "章节任务",
    required: true,
    importance: "must",
    sourceType: "chapter",
    requiresChapterId: true,
    aliases: ["scene_plan", "structure_obligations"],
  },
  {
    group: "current_chapter",
    title: "当前章节",
    required: true,
    importance: "must",
    sourceType: "chapter",
    requiresChapterId: true,
    aliases: ["current_draft_excerpt"],
  },
  {
    group: "recent_chapters",
    title: "最近章节",
    required: false,
    importance: "medium",
    sourceType: "chapter",
    requiresChapterId: true,
  },
  {
    group: "character_state",
    title: "角色状态",
    required: false,
    importance: "high",
    sourceType: "character",
    aliases: [
      "participant_subset",
      "character_dynamics",
      "character_resource",
      "character_resource_context",
      "local_state",
    ],
  },
  {
    group: "world_rules",
    title: "世界观约束",
    required: false,
    importance: "high",
    sourceType: "world",
    aliases: ["world_slice"],
  },
  {
    group: "style_contract",
    title: "风格约束",
    required: false,
    importance: "high",
    sourceType: "style",
    aliases: ["opening_constraints", "continuation_constraints"],
  },
  {
    group: "open_issues",
    title: "开放问题",
    required: false,
    importance: "medium",
    sourceType: "audit",
    requiresChapterId: true,
    aliases: ["open_conflicts", "historical_issues", "payoff_ledger"],
  },
  {
    group: "director_workspace",
    title: "自动导演工作区摘要",
    required: false,
    importance: "medium",
    sourceType: "task",
    aliases: ["workspace_inventory", "manual_edit_inventory"],
  },
];

export function listNovelMaterialGroupDefinitions(): NovelMaterialGroupDefinition[] {
  return NOVEL_MATERIAL_GROUPS;
}

export function resolveNovelMaterialGroup(group: string): NovelMaterialGroupDefinition | null {
  const normalized = group.trim();
  if (!normalized) {
    return null;
  }
  return NOVEL_MATERIAL_GROUPS.find((definition) => (
    definition.group === normalized || (definition.aliases ?? []).includes(normalized)
  )) ?? null;
}
