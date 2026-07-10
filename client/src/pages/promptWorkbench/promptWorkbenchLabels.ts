import i18next from "i18next";
import type { NovelMaterialImportance, PromptCatalogItem } from "@/api/promptWorkbench";

export const LOCKED_FIELD_LABELS: Record<string, string> = {
  outputSchema: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_e5593680"),
  postValidate: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_a2ef87a0"),
  postValidateFailureRecovery: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_dbfff1ad"),
  semanticRetryPolicy: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_6e9b47ee"),
  taskType: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.taskType"),
  mode: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_49ab51a8"),
  contextPolicy: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.contextStrategy"),
  toolCatalog: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_0f437a46"),
  approvalBoundary: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_0cb7a898"),
};

export const SLOT_KIND_LABELS: Record<string, string> = {
  replace: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_670c24f0"),
  append: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_06840bf8"),
  choice: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_ea15ae2b"),
  toggle: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_a6beb974"),
  token: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_f49b0466"),
};

export const CONTEXT_GROUP_LABELS: Record<string, string> = {
  book_contract: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_d2ccee96"),
  chapter_boundary: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_b9636695"),
  chapter_mission: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_057c8e6e"),
  character_dynamics: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_b468cbe3"),
  character_hard_facts: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_c9e13205"),
  character_resource_context: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_c6ef33cc"),
  continuation_constraints: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_4e4ab5f0"),
  custom_slot: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_4e1504b8"),
  historical_issues: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_f33ae4f3"),
  incremental_round_context: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_1f164740"),
  local_state: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_90b05b88"),
  narrative_progress_hint: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_e4ebb388"),
  obligation_contract: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.obligatoryContract"),
  open_conflicts: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_29340986"),
  opening_constraints: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_ff449a45"),
  participant_subset: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_89e5f084"),
  payoff_directives: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.foreshadowingOperationInstructions"),
  payoff_ledger: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.foreshadowingAccount"),
  previous_chapter_hook: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.chapterHook"),
  previous_chapter_tail: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.chapterEnd"),
  rag_context: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_6427746f"),
  recent_chapters: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_87033236"),
  repair_boundaries: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_a702740a"),
  repair_issues: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_4ba701df"),
  state_goal: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_063b84cb"),
  story_macro: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_04d517ef"),
  structure_obligations: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_b926e0c6"),
  style_contract: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_024bd815"),
  timeline_context: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_4404a8da"),
  volume_window: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_be06bb6c"),
  world_rules: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.worldRules"),
  world_slice: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.worldSegment"),
};

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  novel: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_1fb52965"),
  chapter: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_9290b644"),
  plan: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_0debf521"),
  state: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_3fea7ca7"),
  character: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_464f3d4e"),
  world: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.worldSetting"),
  style: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_70e96611"),
  audit: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_4719af71"),
  task: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.task"),
};

export const MESSAGE_ROLE_LABELS: Record<string, string> = {
  system: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_8a8b895f"),
  human: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_1fd02a90"),
  assistant: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_8000f187"),
  ai: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_8000f187"),
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  writer: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_d58e850d"),
  light_review: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_9000a10c"),
  critical_review: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_4c5f96c6"),
  repair: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_84a4bfb1"),
  summary: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_3ae14696"),
  planning: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_335d6d3b"),
  translation: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_8b3607d0"),
  analysis: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_72fa7c88"),
  classification: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_d0771a42"),
};

export const OUTPUT_TYPE_LABELS: Record<string, string> = {
  structured: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_6f0d599a"),
  text: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_5acbeac4"),
};

export const ENTRYPOINT_OPTIONS = [
  { value: "creative_hub", label: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_d50f61ff") },
  { value: "auto_director", label: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_1772aede") },
  { value: "chapter_pipeline", label: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_30261b85") },
  { value: "manual_test", label: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_117392ef") },
];

export const MANAGEMENT_STATUS_LABELS: Record<PromptCatalogItem["managementStatus"], string> = {
  complete: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_54f8fbb0"),
  missing_context_requirements: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_5507a67b"),
  missing_slots: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_f0c2be8d"),
};

export const MATERIAL_IMPORTANCE_LABELS: Record<NovelMaterialImportance, string> = {
  must: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_ca611377"),
  high: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_fc7e3846"),
  medium: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_b6d1cdbf"),
  low: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_d17a0f0b"),
};

export const CONTEXT_STATUS_LABELS = {
  selected: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_011ad262"),
  dropped: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_cfdb747e"),
  summarized: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_326c7f09"),
  available: i18next.t("gen.pages.promptWorkbench.promptWorkbenchLabels.gen_f21434be"),
} as const;

export const LOCKED_CONTEXT_GROUPS = new Set([
  "chapter_mission",
  "character_hard_facts",
  "obligation_contract",
  "style_contract",
  "local_state",
  "timeline_context",
  "previous_chapter_hook",
  "volume_window",
  "participant_subset",
]);

export function statusBadgeVariant(status: PromptCatalogItem["managementStatus"]) {
  return status === "complete" ? "default" : "secondary";
}

export function capabilityLabels(prompt: PromptCatalogItem): string[] {
  return [
    prompt.capabilities.hasOutputSchema ? "Schema" : null,
    prompt.capabilities.hasPostValidate ? "PostValidate" : null,
    prompt.capabilities.hasSemanticRetryPolicy ? "SemanticRetry" : null,
    prompt.capabilities.hasRepairPolicy ? "Repair" : null,
    prompt.capabilities.hasStructuredOutputHint ? "OutputHint" : null,
  ].filter(Boolean) as string[];
}
