import i18next from "i18next";
const INTENT_LABELS: Record<string, string> = {
  social_opening: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_464ae451"),
  list_novels: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_40554844"),
  list_worlds: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_342ac222"),
  query_task_status: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_4a57d2e4"),
  create_novel: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_14196ad0"),
  select_novel_workspace: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_3f279677"),
  bind_world_to_novel: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_d6db1d74"),
  unbind_world_from_novel: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_940bd13c"),
  produce_novel: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_080bb6bb"),
  query_novel_production_status: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_04f704fb"),
  query_novel_title: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_25b5b85f"),
  query_chapter_content: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_734269f8"),
  query_progress: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_870e26e3"),
  inspect_failure_reason: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_9ec6279a"),
  write_chapter: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_87039156"),
  rewrite_chapter: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_86910639"),
  save_chapter_draft: i18next.t("gen.pages.creativeHub.lib.plannerLabels.saveChapterDraft"),
  start_pipeline: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_eaf7b261"),
  inspect_characters: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_7d62c967"),
  inspect_timeline: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_c0d75dab"),
  inspect_world: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_b2ec72e0"),
  search_knowledge: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_3498909f"),
  ideate_novel_setup: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_e9a3af2e"),
  general_chat: i18next.t("gen.pages.creativeHub.lib.plannerLabels.generalDialogue"),
  unknown: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_cff22502"),
};

const PLANNER_SOURCE_LABELS: Record<string, string> = {
  llm: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_1f419f23"),
  unknown: i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_36cead0e"),
};

function formatBilingualLabel(label: string, rawValue: string) {
  return `${label}（${rawValue}）`;
}

export function getIntentDisplayLabel(intent: unknown): string {
  const rawValue = typeof intent === "string" && intent.trim() ? intent.trim() : "unknown";
  const label = INTENT_LABELS[rawValue] ?? i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_d8d3e7ee");
  return formatBilingualLabel(label, rawValue);
}

export function getPlannerSourceDisplayLabel(source: unknown): string {
  const rawValue = typeof source === "string" && source.trim() ? source.trim() : "unknown";
  const label = PLANNER_SOURCE_LABELS[rawValue] ?? i18next.t("gen.pages.creativeHub.lib.plannerLabels.gen_0af14613");
  return formatBilingualLabel(label, rawValue);
}
