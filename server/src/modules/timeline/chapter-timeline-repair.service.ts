import type { ChapterRepairIssue } from "@ai-novel/shared/types/chapterRuntime";
import type { TimelineIssue } from "@ai-novel/shared/types/timeline";

function severityToRepairSeverity(severity: TimelineIssue["severity"]): ChapterRepairIssue["severity"] {
  if (severity === "blocking") return "critical";
  if (severity === "error") return "high";
  if (severity === "warning") return "medium";
  return "low";
}

export class ChapterTimelineRepairService {
  toRepairIssues(issues: TimelineIssue[]): ChapterRepairIssue[] {
    return issues.map((issue) => ({
      severity: severityToRepairSeverity(issue.severity),
      category: "coherence",
      evidence: issue.evidence || issue.message,
      fixSuggestion: issue.suggestedFix || issue.message,
    }));
  }
}

export const chapterTimelineRepairService = new ChapterTimelineRepairService();
