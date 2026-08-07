import type { WorldConsistencyIssue, WorldConsistencyReport } from "@ai-novel/shared/types/world";

const ISSUE_CODE_LABELS: Record<string, string> = {
  THEMATIC_INCOHERENCE: "主题框架不一致",
  REDUNDANT_AXIOM_APPLICATION: "Repeated application of world axioms",
  AXIOM_VIOLATION: "world justice conflict",
  GENRE_MISMATCH: "Theme Signal Conflict",
  AXIOM_MAGIC_CONFLICT: "Axiom and power system conflict",
  TECH_ERA_MISMATCH: "Mixed technological times",
  CONFLICT_WEAK: "The core conflict is weak",
  BASELINE_PASS: "Rule check passed",
};

const ISSUE_MESSAGE_LABELS: Record<string, string> = {
  THEMATIC_INCOHERENCE: "Searching for supplemental content introduces thematic frameworks that are inconsistent with the core setting.",
  REDUNDANT_AXIOM_APPLICATION: "The supplementary content reiterates existing axioms without adding new valid constraints.",
  AXIOM_VIOLATION: "The world name or core concept conflicts with existing axioms and background.",
  GENRE_MISMATCH: "Theme signals are inconsistent with world manual constraints.",
  AXIOM_MAGIC_CONFLICT: "The world's axioms conflict with the setting of the power system.",
  TECH_ERA_MISMATCH: "The sense of the technological era is mixed and lacks sufficient explanation.",
  CONFLICT_WEAK: "The core conflict information is too thin and lacks support.",
  BASELINE_PASS: "No obvious hard conflicts were found at the rule level.",
};

const ISSUE_DETAIL_LABELS: Record<string, string> = {
  THEMATIC_INCOHERENCE: "The auxiliary context introduces thematic expressions that are not clearly established in the original setting, which can easily cause the main axis of the world to drift.",
  REDUNDANT_AXIOM_APPLICATION: "The supplementary content mainly repeats existing rules. It is recommended to delete redundant repetitions and only retain the truly new constraints.",
  AXIOM_VIOLATION: "The naming, theme commitment or core concepts are inconsistent with the underlying rules of the existing world, and the main setting needs to be unified.",
  GENRE_MISMATCH: "Naming or keywords convey another theme expectation, which does not match the style and rules emphasized in the World Manual.",
  AXIOM_MAGIC_CONFLICT: "You limit supernatural/magical content in the world axioms, but the power system or related text reintroduces it.",
  TECH_ERA_MISMATCH: "The technical description simultaneously presents elements from different era levels, but does not explain the sources, limitations or transition logic.",
  CONFLICT_WEAK: "It is recommended to add conflicting parties, triggering events, escalation paths and failure costs to make the main conflict in the world clearer.",
};

const FIELD_LABELS: Record<string, string> = {
  description: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  background: "background settings",
  geography: "geographical environment",
  cultures: "cultural customs",
  magicSystem: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  politics: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  races: "Race settings",
  religions: "religious beliefs",
  technology: "Technical system",
  conflicts: "core conflict",
  history: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  economy: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  factions: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
};

function hasChinese(text: string): boolean {
  return /[\u4E00-\u9FFF]/.test(text);
}

function localizeSummary(summary: string, status: WorldConsistencyReport["status"], issues: WorldConsistencyIssue[]): string {
  if (hasChinese(summary)) {
    return summary;
  }
  if (/Consistency check passed/i.test(summary)) {
    return "The World Manual physical examination passed and no obvious hard conflicts were found.";
  }
  const errorCount = issues.filter((item) => item.severity === "error").length;
  const warnCount = issues.filter((item) => item.severity === "warn").length;
  if (status === "error") {
    return `检测到 ${errorCount} 个严重冲突，${warnCount} 个警告项。`;
  }
  if (status === "warn") {
    return `检测到 ${warnCount} 个警告项，建议继续修正。`;
  }
  return "World Handbook Physical Examination Completed.";
}

export function parseConsistencyReport(raw: string | null | undefined, issues: WorldConsistencyIssue[]): WorldConsistencyReport | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<WorldConsistencyReport>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const status = parsed.status === "error" || parsed.status === "warn" || parsed.status === "pass"
      ? parsed.status
      : "pass";
    return {
      worldId: typeof parsed.worldId === "string" ? parsed.worldId : "",
      score: typeof parsed.score === "number" ? parsed.score : 0,
      summary: localizeSummary(typeof parsed.summary === "string" ? parsed.summary : "", status, issues),
      status,
      generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : undefined,
      issues,
    };
  } catch {
    return null;
  }
}

export function localizeConsistencySeverity(severity: WorldConsistencyIssue["severity"]): string {
  switch (severity) {
    case "error":
      return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
    case "warn":
      return "warn";
    case "pass":
      return "pass";
    default:
      return severity;
  }
}

export function localizeConsistencyStatus(status: WorldConsistencyIssue["status"] | WorldConsistencyReport["status"]): string {
  switch (status) {
    case "open":
      return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
    case "resolved":
      return "Resolved";
    case "ignored":
      return "Ignored";
    case "error":
      return "There is a serious conflict";
    case "warn":
      return "There is a warning";
    case "pass":
      return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
    default:
      return status;
  }
}

export function localizeConsistencySource(source: WorldConsistencyIssue["source"]): string {
  return source === "llm" ? "Model review" : "Rule checking";
}

export function localizeConsistencyField(targetField?: string | null): string {
  if (!targetField) {
    return "not specified";
  }
  return FIELD_LABELS[targetField] ?? targetField;
}

export function localizeConsistencyIssueTitle(code: string): string {
  return ISSUE_CODE_LABELS[code] ?? code;
}

export function localizeConsistencyIssueMessage(issue: WorldConsistencyIssue): string {
  if (hasChinese(issue.message)) {
    return issue.message;
  }
  return ISSUE_MESSAGE_LABELS[issue.code]
    ?? `The function ${localizeConsistencyField(issue.targetField)} has a consistency risk.`;
}

export function localizeConsistencyIssueDetail(issue: WorldConsistencyIssue): string | null {
  if (issue.detail && hasChinese(issue.detail)) {
    return issue.detail;
  }
  if (ISSUE_DETAIL_LABELS[issue.code]) {
    return ISSUE_DETAIL_LABELS[issue.code];
  }
  if (issue.detail) {
    return `系统检测到一条${localizeConsistencyField(issue.targetField)}相关问题，请结合世界手册复核这项风险。`;
  }
  return null;
}
