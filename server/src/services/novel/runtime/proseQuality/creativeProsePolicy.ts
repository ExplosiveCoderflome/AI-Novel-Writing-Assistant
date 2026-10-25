import type { ProseQualityReport } from "./ProseQualityDetector";
import { readStoredCreativeProfile, usesNonWebCreativePolicy } from "../../../../modules/novel/creative-profile";

const STYLE_SIGNALS = new Set(["prose_negative_flip", "prose_dash_or_ellipsis", "prose_period_stutter", "prose_long_paragraph", "prose_verbatim_repeat"]);
/** Fixed surface patterns can signal a risk; they cannot decide a literary passage's function. */
export function applyCreativeProsePolicy(report: ProseQualityReport, stored: { creativeProfileJson?: string | null } | null | undefined): ProseQualityReport {
  if (!usesNonWebCreativePolicy(readStoredCreativeProfile(stored))) return report;
  const findings = report.findings.map((finding) => STYLE_SIGNALS.has(finding.code) ? {
    ...finding, severity: "low" as const,
    fixSuggestion: "结合本书文体与上下文判断表达功能；模式命中只作提示，不自动改写有功能的停顿、长段、复沓或议论。",
  } : finding);
  return { findings, hasBlockingFindings: findings.some((finding) => finding.severity === "high" || finding.severity === "critical") };
}

/** Literary surface signals remain risk tags and must not enter the automatic repair queue. */
export function selectProseRepairFindings(report: ProseQualityReport, stored: { creativeProfileJson?: string | null } | null | undefined) {
  return usesNonWebCreativePolicy(readStoredCreativeProfile(stored))
    ? report.findings.filter((finding) => !STYLE_SIGNALS.has(finding.code))
    : report.findings;
}
