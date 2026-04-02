import type { PromptBudgetProfile } from "@ai-novel/shared/types/chapterRuntime";

export const NOVEL_PROMPT_BUDGETS = {
  directorCandidates: 1200,
  directorCandidatePatch: 1200,
  directorBookContract: 1400,
  directorBlueprint: 2400,
  storyMacroDecomposition: 1800,
  storyMacroFieldRegeneration: 1600,
  volumeStrategy: 1800,
  volumeStrategyCritique: 1800,
  volumeSkeleton: 2000,
  volumeBeatSheet: 1600,
  volumeChapterList: 1600,
  volumeChapterDetail: 1600,
  volumeRebalance: 1600,
  chapterWriter: 1800,
  chapterReview: 2600,
  chapterRepair: 1600,
  chapterSummary: 1000,
} as const;

export const RUNTIME_PROMPT_BUDGET_PROFILES: PromptBudgetProfile[] = [
  {
    promptId: "novel.chapter.writer",
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterWriter,
    preferredGroups: [
      "chapter_mission",
      "volume_window",
      "participant_subset",
      "local_state",
      "open_conflicts",
      "recent_chapters",
    ],
    dropOrder: [
      "rag_facts",
      "world_rules",
      "style_constraints",
      "continuation_constraints",
      "opening_constraints",
    ],
  },
  {
    promptId: "audit.chapter.full",
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterReview,
    preferredGroups: [
      "chapter_mission",
      "structure_obligations",
      "world_rules",
      "historical_issues",
    ],
    dropOrder: [
      "rag_facts",
      "recent_chapters",
      "participant_subset",
    ],
  },
  {
    promptId: "novel.review.repair",
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterRepair,
    preferredGroups: [
      "repair_issues",
      "chapter_mission",
      "repair_boundaries",
      "world_rules",
    ],
    dropOrder: [
      "recent_chapters",
      "participant_subset",
      "style_constraints",
      "continuation_constraints",
    ],
  },
];
