import type { AuditReport } from "@ai-novel/shared/types/novel";

/** Lossless assessment sharing; report and issue identities remain distinct for AI routing. */
export function buildReplanAuditContext(reports: AuditReport[]) {
  const assessments: unknown[] = [];
  const indices = new Map<string, number>();
  return {
    reports: reports.map(report => {
      let assessmentIndex: number | null = null;
      let unparsedAssessment: string | undefined;
      if (report.legacyScoreJson?.trim()) {
        try {
          const assessment: unknown = JSON.parse(report.legacyScoreJson);
          const key = JSON.stringify(assessment);
          const existing = indices.get(key);
          assessmentIndex = existing ?? assessments.length;
          if (existing === undefined) {
            indices.set(key, assessmentIndex);
            assessments.push(assessment);
          }
        } catch { unparsedAssessment = report.legacyScoreJson; }
      }
      return {
        id: report.id, chapterId: report.chapterId, auditType: report.auditType,
        overallScore: report.overallScore ?? null, summary: report.summary ?? null,
        assessmentIndex, ...(unparsedAssessment !== undefined ? { unparsedAssessment } : {}),
        issues: report.issues.map(issue => ({
          id: issue.id, auditType: issue.auditType, severity: issue.severity, code: issue.code,
          description: issue.description, evidence: issue.evidence, fixSuggestion: issue.fixSuggestion, status: issue.status,
        })),
      };
    }),
    assessments,
  };
}
