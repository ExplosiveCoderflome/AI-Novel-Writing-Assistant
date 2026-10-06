import type { ChapterIssueDecision, ChapterQualityReport } from "./chapterDetailBundle";

/** Deterministic projection of the existing structured AI contract, never classification of prose. */
export function resolveChapterQualityReports(reports: readonly ChapterQualityReport[]): ChapterIssueDecision {
  if (reports.length === 0 || reports.some(report => !report.assessment
    || !["use_as_is", "repair_contract", "replan_window"].includes(report.assessment.recommendedHandling))) {
    throw new Error("章节质量缺少有效 AI 结构化处理决定。");
  }
  const reason = reports.flatMap(report => report.result.issues.map(issue => issue.summary.trim())).filter(Boolean).join("；")
    || "AI 章节合同评估给出质量提醒。";
  if (reports.some(report => report.assessment?.recommendedHandling === "replan_window")) return {action: "stop_for_replan", reason};
  if (reports.some(report => report.assessment?.recommendedHandling === "repair_contract")) return {action: "local_patch_plan", reason};
  return {action: "continue_with_warning", reason};
}
