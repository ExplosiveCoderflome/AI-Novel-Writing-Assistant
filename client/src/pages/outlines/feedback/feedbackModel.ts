import type { OutlineFeedbackRunView, OutlineFeedbackSettings } from "@ai-novel/shared/types/outlineFeedback";
import type { OutlineBookBindingView } from "@ai-novel/shared/types/outlineOpenBook";

export function feedbackVisible(mobile: boolean, binding?: Pick<OutlineBookBindingView, "feedbackEligible"> | null) {
  return !mobile && binding?.feedbackEligible === true;
}
export function feedbackSettingsInput(settings: OutlineFeedbackSettings, mode: OutlineFeedbackSettings["mode"], everyN: string): OutlineFeedbackSettings | null {
  const n = Number(everyN);
  if (mode === "every_n" && (!Number.isInteger(n) || n < 1 || n > 100)) return null;
  return { ...settings, mode, everyN: mode === "every_n" ? n : settings.everyN };
}
export function selectedFeedbackIds(run: OutlineFeedbackRunView, selected: string[]) {
  return run.items.filter(item => item.status === "pending" && selected.includes(item.operationId)).map(item => item.operationId);
}
export function feedbackItemProtected(binding: OutlineBookBindingView, item: OutlineFeedbackRunView["items"][number], chapterOrder: number) {
  const chapter = binding.mapping.chapters.find(c => c.nodeId === item.nodeId);
  return !!chapter && chapter.chapterOrder <= chapterOrder || Object.keys(item.fields).some(field => {
    const rule = binding.policy.rules.find(r => r.nodeId === item.nodeId && r.field === field);
    return !rule || !["propose_change", "fill_missing"].includes(rule.mode);
  });
}
