import type {
  AuditReport,
  QualityScore,
  ReplanRecommendation,
  ReviewIssue,
} from "@ai-novel/shared/types/novel";

export interface ChapterReviewResult {
  score: QualityScore;
  issues: ReviewIssue[];
  auditReports?: AuditReport[];
  replanRecommendation?: ReplanRecommendation;
}

export function buildReplanRecommendationFromAuditReports(
  auditReports: AuditReport[] | null | undefined,
): ReplanRecommendation | null {
  if (!auditReports || auditReports.length === 0) {
    return null;
  }

  const blockingIssueIds = auditReports
    .flatMap((report) => report.issues)
    .filter((issue) => issue.status === "open" && (issue.severity === "high" || issue.severity === "critical"))
    .map((issue) => issue.id);

  return {
    recommended: blockingIssueIds.length > 0,
    reason: blockingIssueIds.length > 0
      ? "There are unresolved high-priority audit issues, and it is recommended to re-plan subsequent chapters."
      : "There are currently no blocking audit issues and there is no need to re-plan subsequent chapters.",
    blockingIssueIds,
  };
}
