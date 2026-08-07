import type { NovelMaterialImportance, PromptCatalogItem } from "@/api/promptWorkbench";

export const LOCKED_FIELD_LABELS: Record<string, string> = { outputSchema: "Output Format", postValidate: "Output Validation", postValidateFailureRecovery: "Validation Failure Recovery", semanticRetryPolicy: "Semantic Retry Policy", taskType: "Task Type", mode: "Output Mode", contextPolicy: "Context Policy", toolCatalog: "Tool Catalog", approvalBoundary: "Approval Boundary", }; export const SLOT_KIND_LABELS: Record<string, string> = { replace: "Rewrite", append: "Add Constraints", choice: "Options", toggle: "Switch", token: "Inline Value", }; export const CONTEXT_GROUP_LABELS: Record<string, string> = {
  book_contract: "full book contract",
  chapter_boundary: "Chapter boundaries",
  chapter_mission: "Tasks in this chapter",
  character_dynamics: "Role relationship dynamics",
  character_hard_facts: "character hard facts",
  character_resource_context: "Role resource status",
  continuation_constraints: "continuation constraints",
  custom_slot: "Custom constraints",
  historical_issues: "Historical review issues",
  incremental_round_context: "Incremental generation rounds",
  local_state: "current situation",
  narrative_progress_hint: "Narrative progress prompts",
  obligation_contract: "obligation contract",
  open_conflicts: "open conflict",
  opening_constraints: "opening constraints",
  participant_subset: "participation role",
  payoff_directives: "Foreshadowing operation instructions",
  payoff_ledger: "Foreshadowing account",
  previous_chapter_hook: "Chapter hook",
  previous_chapter_tail: "End of last chapter",
  rag_context: "Search supplement",
  recent_chapters: "Summary of recent chapters",
  repair_boundaries: "Revision scope constraints",
  repair_issues: "List of revision questions",
  state_goal: "status and goals",
  story_macro: "macro story structure",
  structure_obligations: "structural obligations",
  style_contract: "style contract",
  timeline_context: "timeline",
  volume_window: "Volume level progress",
  world_rules: "world rules",
  world_slice: "world fragment",
};

export const SOURCE_TYPE_LABELS: Record<string, string> = { novel: "novel", chapter: "chapter", plan: "plan", state: "state", character: "character", world: "world setting", style: "style", audit: "auditor", task: "task", }; export const MESSAGE_ROLE_LABELS: Record<string, string> = { system: "System", human: "User", assistant: "Model", ai: "Model", }; export const TASK_TYPE_LABELS: Record<string, string> = { writer: "writing", light_review: "light review", critical_review: "critical review", repair: "repair", summary: "summary", planning: "planning", translation: "translation", analysis: "analysis", classification: "classification", }; export const OUTPUT_TYPE_LABELS: Record<string, string> = { structured: "Structured Output", text: "Text Output", }; export const ENTRYPOINT_OPTIONS = [ { value: "creative_hub", label: "Creative Hub" }, { value: "auto_director", label: "Auto Director" }, { value: "chapter_pipeline", label: "Chapter Pipeline" }, { value: "manual_test", label: "Manual Test" }, ]; export const MANAGEMENT_STATUS_LABELS: Record<PromptCatalogItem["managementStatus"], string> = {
  complete: "Metadata is complete",
  missing_context_requirements: "Missing contextual requirements",
  missing_slots: "Missing slot statement",
};

export const MATERIAL_IMPORTANCE_LABELS: Record<NovelMaterialImportance, string> = {
  must: "required",
  high: "important",
  medium: "Auxiliary",
  low: "reference",
};

export const CONTEXT_STATUS_LABELS = {
  selected: "Injected",
  dropped: "Cropped",
  summarized: "Summary",
  available: "candidate",
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
