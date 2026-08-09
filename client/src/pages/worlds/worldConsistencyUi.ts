import i18next from "i18next";
import type { WorldConsistencyIssue, WorldConsistencyReport } from "@ai-novel/shared/types/world";

const ISSUE_CODE_LABELS: Record<string, string> = {
  THEMATIC_INCOHERENCE: i18next.t("gen.pages.worlds.worldConsistencyUi.themeFrameworkInconsistent"),
  REDUNDANT_AXIOM_APPLICATION: i18next.t("gen.pages.worlds.worldConsistencyUi.worldPrincipleRepeatedUse"),
  AXIOM_VIOLATION: i18next.t("gen.pages.worlds.worldConsistencyUi.worldPrincipleConflictDetail"),
  GENRE_MISMATCH: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_1079b694"),
  AXIOM_MAGIC_CONFLICT: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_5c3614d1"),
  TECH_ERA_MISMATCH: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_e14ca1fb"),
  CONFLICT_WEAK: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_b02214df"),
  BASELINE_PASS: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_778255d8"),
};

const ISSUE_MESSAGE_LABELS: Record<string, string> = {
  THEMATIC_INCOHERENCE: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_31869a94"),
  REDUNDANT_AXIOM_APPLICATION: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_4db4c400"),
  AXIOM_VIOLATION: i18next.t("gen.pages.worlds.worldConsistencyUi.worldNameConflict"),
  GENRE_MISMATCH: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_def97baf"),
  AXIOM_MAGIC_CONFLICT: i18next.t("gen.pages.worlds.worldConsistencyUi.worldPrincipleConflict"),
  TECH_ERA_MISMATCH: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_09572079"),
  CONFLICT_WEAK: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_8d46746b"),
  BASELINE_PASS: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_3dd49f49"),
};

const ISSUE_DETAIL_LABELS: Record<string, string> = {
  THEMATIC_INCOHERENCE: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_23358ec0"),
  REDUNDANT_AXIOM_APPLICATION: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_f0e62d44"),
  AXIOM_VIOLATION: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_12e41f58"),
  GENRE_MISMATCH: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_54f89524"),
  AXIOM_MAGIC_CONFLICT: i18next.t("gen.pages.worlds.worldConsistencyUi.youLimitedSupernaturalMagicContentInWorldPrincipleButForceSystemOrRelatedTextReintroducedIt"),
  TECH_ERA_MISMATCH: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_a5f6fc27"),
  CONFLICT_WEAK: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_67b07703"),
};

const FIELD_LABELS: Record<string, string> = {
  description: i18next.t("gen.pages.worlds.worldConsistencyUi.worldDescription"),
  background: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_b2091ef7"),
  geography: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_48d19a29"),
  cultures: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_cca09e79"),
  magicSystem: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_9185e0fc"),
  politics: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_9b670f02"),
  races: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_fe1521ec"),
  religions: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_ba378fee"),
  technology: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_ca9a2400"),
  conflicts: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_ae5f3fde"),
  history: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_efd9a737"),
  economy: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_c557e9a8"),
  factions: i18next.t("gen.pages.worlds.worldConsistencyUi.gen_ef535ae0"),
};

function hasChinese(text: string): boolean {
  return /[\u4E00-\u9FFF]/.test(text);
}

function localizeSummary(summary: string, status: WorldConsistencyReport["status"], issues: WorldConsistencyIssue[]): string {
  if (hasChinese(summary)) {
    return summary;
  }
  if (/Consistency check passed/i.test(summary)) {
    return i18next.t("gen.pages.worlds.worldConsistencyUi.worldManualCheckPassed");
  }
  const errorCount = issues.filter((item) => item.severity === "error").length;
  const warnCount = issues.filter((item) => item.severity === "warn").length;
  if (status === "error") {
    return `检测到 ${errorCount} 个严重冲突，${warnCount} 个警告项。`;
  }
  if (status === "warn") {
    return `检测到 ${warnCount} 个警告项，建议继续修正。`;
  }
  return i18next.t("gen.pages.worlds.worldConsistencyUi.worldManualCheckCompleted");
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
      return i18next.t("gen.pages.worlds.worldConsistencyUi.severeConflict");
    case "warn":
      return i18next.t("gen.pages.worlds.worldConsistencyUi.gen_900c70fa");
    case "pass":
      return i18next.t("gen.pages.worlds.worldConsistencyUi.gen_23c1f399");
    default:
      return severity;
  }
}

export function localizeConsistencyStatus(status: WorldConsistencyIssue["status"] | WorldConsistencyReport["status"]): string {
  switch (status) {
    case "open":
      return i18next.t("gen.pages.worlds.worldConsistencyUi.gen_047109de");
    case "resolved":
      return i18next.t("gen.pages.worlds.worldConsistencyUi.gen_d7d257dd");
    case "ignored":
      return i18next.t("gen.pages.worlds.worldConsistencyUi.gen_82b783f0");
    case "error":
      return i18next.t("gen.pages.worlds.worldConsistencyUi.gen_2d5651bb");
    case "warn":
      return i18next.t("gen.pages.worlds.worldConsistencyUi.gen_bbc1a31c");
    case "pass":
      return i18next.t("gen.pages.worlds.worldConsistencyUi.gen_dce8c864");
    default:
      return status;
  }
}

export function localizeConsistencySource(source: WorldConsistencyIssue["source"]): string {
  return source === "llm" ? i18next.t("gen.pages.worlds.worldConsistencyUi.gen_9011b99b") : i18next.t("gen.pages.worlds.worldConsistencyUi.gen_f4529e95");
}

export function localizeConsistencyField(targetField?: string | null): string {
  if (!targetField) {
    return i18next.t("gen.pages.worlds.worldConsistencyUi.gen_7598f152");
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
    ?? `${localizeConsistencyField(issue.targetField)}存在一致性风险。`;
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
