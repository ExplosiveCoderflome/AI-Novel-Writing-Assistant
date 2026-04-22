import type {
  StyleContract,
  StyleContractIssueCategory,
  StyleContractSection,
  StyleContractSectionKey,
  StyleContractViolationSource,
  StyleDetectionRuleType,
} from "@ai-novel/shared/types/styleEngine";

export const WRITER_STYLE_CONTRACT_SECTIONS: StyleContractSectionKey[] = [
  "narrative",
  "character",
  "language",
  "rhythm",
  "antiAi",
  "selfCheck",
];

export const PLANNER_STYLE_CONTRACT_SECTIONS: StyleContractSectionKey[] = [
  "narrative",
  "character",
  "language",
  "antiAi",
];

function getSection(contract: StyleContract, key: StyleContractSectionKey): StyleContractSection {
  return contract[key];
}

function compactValue(value: string | null | undefined, fallback = "none"): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function compactList(values: string[] | undefined, fallback = "none"): string {
  const normalized = (values ?? []).map((item) => item.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized.join(", ") : fallback;
}

function summarizeSection(section: StyleContractSection, maxLines: number): string[] {
  const lines = [
    section.summary?.trim() ? `${section.key}.summary: ${section.summary.trim()}` : "",
    ...section.lines.map((line) => line.trim()).filter(Boolean),
  ].filter(Boolean);
  return lines.slice(0, maxLines);
}

export function listStyleContractSectionsWithContent(contract: StyleContract): StyleContractSectionKey[] {
  return WRITER_STYLE_CONTRACT_SECTIONS.filter((key) => getSection(contract, key).hasContent);
}

export function buildPlannerStyleContractSummaryText(
  contract: StyleContract | null | undefined,
  maxLines = 10,
): string {
  if (!contract) {
    return "";
  }

  const lines = PLANNER_STYLE_CONTRACT_SECTIONS
    .flatMap((key) => summarizeSection(getSection(contract, key), key === "antiAi" ? 3 : 2))
    .slice(0, maxLines);

  return lines.join("\n");
}

export function buildFullStyleContractText(
  contract: StyleContract | null | undefined,
  sections: StyleContractSectionKey[] = WRITER_STYLE_CONTRACT_SECTIONS,
): string {
  if (!contract) {
    return "";
  }

  return sections
    .map((key) => getSection(contract, key).text.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function buildStyleContractMetaText(contract: StyleContract | null | undefined): string {
  if (!contract) {
    return "";
  }

  const activeSections = listStyleContractSectionsWithContent(contract);
  return [
    "Style contract meta:",
    `effective_style_profile_id=${compactValue(contract.meta.effectiveStyleProfileId)}`,
    `task_style_profile_id=${compactValue(contract.meta.taskStyleProfileId)}`,
    `source_targets=${compactList(contract.meta.activeSourceTargets)}`,
    `source_labels=${compactList(contract.meta.activeSourceLabels)}`,
    `maturity=${contract.meta.maturity}`,
    `active_sections=${compactList(activeSections)}`,
    `writer_sections=${compactList(contract.meta.writerIncludedSections)}`,
    `planner_sections=${compactList(contract.meta.plannerIncludedSections)}`,
    `dropped_sections=${compactList(contract.meta.droppedSections)}`,
    `uses_global_anti_ai_baseline=${contract.meta.usesGlobalAntiAiBaseline ? "yes" : "no"}`,
    `global_anti_ai_rule_ids=${compactList(contract.meta.globalAntiAiRuleIds)}`,
    `style_anti_ai_rule_ids=${compactList(contract.meta.styleAntiAiRuleIds)}`,
  ].join("\n");
}

export function buildWriterStyleContractText(contract: StyleContract | null | undefined): string {
  if (!contract) {
    return "";
  }
  return [
    buildStyleContractMetaText(contract),
    buildFullStyleContractText(contract),
  ].filter(Boolean).join("\n\n");
}

export function inferStyleViolationSource(
  ruleId: string | null | undefined,
  contract: StyleContract | null | undefined,
): StyleContractViolationSource {
  const normalizedRuleId = ruleId?.trim();
  if (!normalizedRuleId || !contract) {
    return "style_contract";
  }
  if (contract.meta.globalAntiAiRuleIds.includes(normalizedRuleId)) {
    return "global_anti_ai";
  }
  if (contract.meta.styleAntiAiRuleIds.includes(normalizedRuleId)) {
    return "style_anti_ai";
  }
  return "style_contract";
}

export function inferStyleIssueCategory(input: {
  issueCategory?: StyleContractIssueCategory | null;
  source?: StyleContractViolationSource | null;
  ruleType?: StyleDetectionRuleType | null;
}): StyleContractIssueCategory {
  if (input.issueCategory === "story_structure") {
    return "story_structure";
  }
  if (input.source === "global_anti_ai" || input.source === "style_anti_ai") {
    return "style_expression";
  }
  if (input.ruleType === "style" || input.ruleType === "character") {
    return "style_expression";
  }
  return "style_expression";
}
