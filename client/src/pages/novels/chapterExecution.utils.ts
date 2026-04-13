import type { ReviewIssue } from "@ai-novel/shared/types/novel";

export interface ChapterExecutionStrategy {
  runMode: "fast" | "polish";
  wordSize: "short" | "medium" | "long";
  conflictLevel: number;
  pace: "slow" | "balanced" | "fast";
  aiFreedom: "low" | "medium" | "high";
}

export function resolveTargetWordCount(strategy: ChapterExecutionStrategy): number {
  if (strategy.wordSize === "short") {
    return 1500;
  }
  if (strategy.wordSize === "long") {
    return 3500;
  }
  return 2500;
}

export function buildRepairIssue(category: ReviewIssue["category"], fixSuggestion: string, evidence: string): ReviewIssue {
  return {
    severity: "medium",
    category,
    evidence,
    fixSuggestion,
  };
}
