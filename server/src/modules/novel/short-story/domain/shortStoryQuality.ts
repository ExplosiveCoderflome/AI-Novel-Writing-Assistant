import type { ShortStoryQualityResult } from "@ai-novel/shared/types/creationStudio";

export function hasOnlyExpressionIssues(audit: Pick<ShortStoryQualityResult, "issues">): boolean {
  return audit.issues.length > 0 && audit.issues.every((issue) => issue.category === "style_expression");
}
