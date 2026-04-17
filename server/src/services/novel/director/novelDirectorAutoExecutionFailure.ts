import type { DirectorAutoExecutionState } from "@ai-novel/shared/types/novelDirector";

export function isSkippableAutoExecutionReviewFailure(message: string | null | undefined): boolean {
  const normalized = message?.trim() ?? "";
  return normalized.startsWith("Chapter generation is blocked until review is resolved.");
}

function formatAutoExecutionContinuation(input: Pick<
  DirectorAutoExecutionState,
  "remainingChapterCount" | "nextChapterOrder"
>): string {
  const remainingPart = typeof input.remainingChapterCount === "number"
    ? input.remainingChapterCount > 0
      ? `当前仍有 ${input.remainingChapterCount} 章待继续`
      : "当前已无待继续章节"
    : "当前仍有待继续章节";
  const nextPart = typeof input.nextChapterOrder === "number"
    ? `，系统会从第 ${input.nextChapterOrder} 章继续`
    : "，系统会从下一章继续";
  return `${remainingPart}${nextPart}。`;
}

function formatAutoExecutionActionLabel(
  autoExecution?: Pick<DirectorAutoExecutionState, "scopeLabel"> | null,
): string {
  const scopeLabel = autoExecution?.scopeLabel?.trim();
  return scopeLabel ? `继续自动执行${scopeLabel}` : "继续自动执行当前范围";
}

export function buildSkippableAutoExecutionReviewFailureSummary(
  autoExecution?: Pick<DirectorAutoExecutionState, "remainingChapterCount" | "nextChapterOrder" | "scopeLabel"> | null,
): string {
  return [
    "当前章因审核阻断而暂停，但这类问题允许跳过当前章继续执行。",
    `点击“${formatAutoExecutionActionLabel(autoExecution)}”后，系统会直接续跑剩余章节。`,
    formatAutoExecutionContinuation({
      remainingChapterCount: autoExecution?.remainingChapterCount,
      nextChapterOrder: autoExecution?.nextChapterOrder,
    }),
  ].join(" ");
}

export function buildSkippableAutoExecutionReviewCheckpointSummary(input: {
  scopeLabel: string;
  autoExecution?: Pick<DirectorAutoExecutionState, "remainingChapterCount" | "nextChapterOrder"> | null;
}): string {
  return [
    `${input.scopeLabel}已进入自动执行，但当前章因审核阻断而暂停。`,
    "这类问题允许跳过当前章继续执行。",
    formatAutoExecutionContinuation({
      remainingChapterCount: input.autoExecution?.remainingChapterCount,
      nextChapterOrder: input.autoExecution?.nextChapterOrder,
    }),
  ].join(" ");
}

export function buildSkippableAutoExecutionReviewBlockingReason(
  autoExecution?: Pick<DirectorAutoExecutionState, "nextChapterOrder" | "scopeLabel"> | null,
): string {
  const actionLabel = formatAutoExecutionActionLabel(autoExecution);
  if (typeof autoExecution?.nextChapterOrder === "number") {
    return `当前章因审核阻断而暂停，但这类问题允许跳过当前章继续执行。点击“${actionLabel}”后，系统会从第 ${autoExecution.nextChapterOrder} 章继续。`;
  }
  return `当前章因审核阻断而暂停，但这类问题允许跳过当前章继续执行。点击“${actionLabel}”后，系统会从下一章继续。`;
}

export function buildSkippableAutoExecutionReviewRecoveryHint(
  autoExecution?: Pick<DirectorAutoExecutionState, "nextChapterOrder" | "scopeLabel"> | null,
): string {
  const actionLabel = formatAutoExecutionActionLabel(autoExecution);
  if (typeof autoExecution?.nextChapterOrder === "number") {
    return `可直接点击“${actionLabel}”，系统会跳过当前审核阻断章并从第 ${autoExecution.nextChapterOrder} 章继续；如需修复当前章，再回到章节执行或质量修复处理。`;
  }
  return `可直接点击“${actionLabel}”，系统会跳过当前审核阻断章并从下一章继续；如需修复当前章，再回到章节执行或质量修复处理。`;
}
