import type {
  StyleDetectionReport,
  StyleDetectionViolation,
} from "../styleEngine.js";
import {
  isStyleIssueRewritable,
  type StyleRewriteGuard,
} from "./diagnostics.js";

/**
 * The source workflow that produced a generated-text review.
 *
 * The same contract is used by chapter production, short-story production,
 * and the existing manual clean-up entry point so the UI does not need a
 * workflow-specific interpretation of a style report.
 */
export type GeneratedTextReviewSource = "chapter" | "short_story" | "manual";

/** A review state is a user-visible state, not a pipeline stop signal. */
export type GeneratedTextReviewStatus =
  | "disabled"
  | "checking"
  | "passed"
  | "issues_found"
  | "candidate_ready"
  | "accepted"
  | "deferred"
  | "unavailable";

export type GeneratedTextReviewAction = "none" | "keep_original" | "accept_candidate";

export interface GeneratedTextReviewError {
  code: string;
  message: string;
  retriable?: boolean;
}

export interface GeneratedTextReview {
  schemaVersion: 1;
  source: GeneratedTextReviewSource;
  status: GeneratedTextReviewStatus;
  sourceContentHash: string | null;
  candidateContentHash: string | null;
  report: StyleDetectionReport | null;
  candidateContent: string | null;
  rewriteGuard: StyleRewriteGuard | null;
  action: GeneratedTextReviewAction;
  qualityDebt: string[];
  error: GeneratedTextReviewError | null;
}

export interface GeneratedTextReviewResult {
  content: string;
  review: GeneratedTextReview;
}

/**
 * Only expression and discourse issues with explicit AI permission can enter
 * a local rewrite candidate. Narrative issues remain review guidance.
 */
export function getGeneratedTextRewritableIssues(
  report: Pick<StyleDetectionReport, "violations"> | null | undefined,
): StyleDetectionViolation[] {
  return (report?.violations ?? []).filter((issue) => isStyleIssueRewritable(issue));
}

export function hasGeneratedTextReviewIssues(
  report: Pick<StyleDetectionReport, "violations"> | null | undefined,
): boolean {
  return (report?.violations.length ?? 0) > 0;
}
