import i18next from "i18next";
import type {
  StyleDetectionReport,
  StyleExtractionDraft,
  StyleFeatureDecision,
  StyleProfile,
} from "@ai-novel/shared/types/styleEngine";

export const WRITING_FORMULA_V2_MODES = ["imitate", "clean", "book-style"] as const;
export const STARTER_STYLE_PROFILE_SOURCE_PREFIX = "starter-style-profile:";
export const AI_STYLE_BRIEF_SOURCE_PREFIX = "ai-style-brief:";

export type WritingFormulaMode = typeof WRITING_FORMULA_V2_MODES[number];

export function normalizeWritingFormulaMode(value: string | null | undefined): WritingFormulaMode | null {
  if (value === "imitate" || value === "clean" || value === "book-style") {
    return value;
  }
  return null;
}

export function buildExtractionDecisions(
  draft: StyleExtractionDraft,
  presetKey: "imitate" | "balanced" | "transfer",
): Array<{ featureId: string; decision: StyleFeatureDecision }> {
  const preset = draft.presets.find((item) => item.key === presetKey);
  if (preset?.decisions?.length) {
    return preset.decisions;
  }
  return draft.features.map((feature) => ({
    featureId: feature.id,
    decision: "keep",
  }));
}

export interface WritingFormulaDiffRow {
  id: string;
  before: string;
  after: string;
  changed: boolean;
}

export function buildTextDiffRows(before: string, after: string): WritingFormulaDiffRow[] {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  const maxLength = Math.max(beforeLines.length, afterLines.length);
  return Array.from({ length: maxLength }, (_, index) => {
    const previous = beforeLines[index] ?? "";
    const next = afterLines[index] ?? "";
    return {
      id: `diff-${index}`,
      before: previous,
      after: next,
      changed: previous !== next,
    };
  }).filter((row) => row.before.trim() || row.after.trim());
}

export function buildStyleRuleSuggestionDraft(report: StyleDetectionReport | null): string[] {
  if (!report || report.violations.length === 0) {
    return [];
  }

  const seen = new Set<string>();
  return report.violations.reduce<string[]>((result, violation) => {
    const summary = `${violation.ruleName}：${violation.suggestion}`.trim();
    if (!summary || seen.has(summary)) {
      return result;
    }
    seen.add(summary);
    result.push(summary);
    return result;
  }, []).slice(0, 4);
}

export function isStarterStyleProfile(profile: Pick<StyleProfile, "sourceRefId">): boolean {
  return profile.sourceRefId?.startsWith(STARTER_STYLE_PROFILE_SOURCE_PREFIX) ?? false;
}

export function getStyleProfileOriginLabel(
  profile: Pick<StyleProfile, "sourceRefId" | "sourceType">,
): string {
  if (isStarterStyleProfile(profile)) {
    return i18next.t("dict.gen_5c888f73");
  }
  if (profile.sourceRefId?.startsWith(AI_STYLE_BRIEF_SOURCE_PREFIX)) {
    return i18next.t("writingFormula.writingFormulaV2.shared.1rgu1");
  }
  if (profile.sourceType === "from_text") {
    return i18next.t("writingFormula.writingFormulaV2.shared.d8lcnf");
  }
  if (profile.sourceType === "from_book_analysis") {
    return i18next.t("dict.gen_4fa1017a");
  }
  if (profile.sourceType === "from_knowledge_document") {
    return i18next.t("dict.gen_51a7e4d2");
  }
  if (profile.sourceType === "from_current_work") {
    return i18next.t("onboarding.currentWork");
  }
  return i18next.t("dict.gen_4364e2f1");
}
