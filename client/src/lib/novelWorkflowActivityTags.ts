import i18next from "i18next";
const WORKFLOW_ACTIVITY_TAGS = [
  i18next.t("gen.lib.novelWorkflowActivityTags.gen_1b741742"),
  i18next.t("gen.lib.novelWorkflowActivityTags.gen_f0e10078"),
  i18next.t("gen.lib.novelWorkflowActivityTags.gen_52cd92d7"),
  i18next.t("gen.lib.novelWorkflowActivityTags.gen_475ac79f"),
  i18next.t("gen.lib.novelWorkflowActivityTags.syncingForeshadowingLedger"),
  i18next.t("gen.lib.novelWorkflowActivityTags.gen_f6775234"),
  i18next.t("gen.lib.novelWorkflowActivityTags.fillingBackInForeshadowing"),
] as const;

export function extractWorkflowActivityTags(value: string | null | undefined): string[] {
  const source = value?.trim() ?? "";
  if (!source) {
    return [];
  }
  return WORKFLOW_ACTIVITY_TAGS.filter((label) => source.includes(label));
}
