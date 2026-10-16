import type {DirectorChapterBudgetGrant, DirectorChapterBudgetStage, DirectorChapterBudgetView} from "@ai-novel/shared/types/director/chapterBudget";
import type {PipelineDirectorSnapshot} from "../directorBridge";
import {DIRECTOR_CHAPTER_PREFLIGHT_RESERVE_TOKENS, DIRECTOR_CHAPTER_TOKEN_LIMIT} from "./DirectorChapterUsageBudget";

type Checkpoint = NonNullable<PipelineDirectorSnapshot["chapterUsage"]>[number];

export function chapterBudgetView(jobId: string, row: Checkpoint): DirectorChapterBudgetView {
  const usedTokens = row.effectiveTokens ?? row.totalTokens;
  const reserveTokens = row.budgetPause?.reserveTokens
    ?? (row.endJobTokens === undefined ? DIRECTOR_CHAPTER_PREFLIGHT_RESERVE_TOKENS : 0);
  const tokenLimit = row.tokenLimit ?? DIRECTOR_CHAPTER_TOKEN_LIMIT;
  // Cover the next step and one conservative fallback step, rounded for an editable recommendation.
  const recommendedLimit = Math.min(10_000_000,
    Math.ceil((Math.max(tokenLimit, usedTokens + reserveTokens) + DIRECTOR_CHAPTER_PREFLIGHT_RESERVE_TOKENS) / 1000) * 1000);
  return {jobId, chapterId: row.chapterId, chapterOrder: row.chapterOrder,
    metric: row.metric ?? "raw_tokens_v1", usedTokens, rawTokens: row.totalTokens,
    ...(row.metric ? {promptTokens: row.promptTokens, completionTokens: row.completionTokens, cacheHitTokens: row.cacheHitTokens,
      ...(row.unclassifiedTokens ? {unclassifiedTokens: row.unclassifiedTokens} : {})} : {}),
    tokenLimit, reserveTokens, recommendedLimit, stage: row.budgetPause?.stage ?? null, closed: row.endJobTokens !== undefined};
}

/** A structured saved decision, never error-text matching, identifies the paused chapter. */
export function readPausedChapterBudget(snapshot: PipelineDirectorSnapshot, jobId: string): DirectorChapterBudgetView | null {
  const unresolved = snapshot.decisions.slice(snapshot.resolvedDecisionCount ?? 0);
  const pauses = unresolved.filter(decision => decision.action === "pause_for_manual" || decision.action === "fail_task");
  if (pauses.some(decision => decision.issueCode !== "runtime.token_budget_exceeded")) return null;
  const decision = pauses.at(-1);
  if (!decision || decision.issueCode !== "runtime.token_budget_exceeded" || !decision.chapterOrder) return null;
  const row = snapshot.chapterUsage?.find(item => item.chapterOrder === decision.chapterOrder);
  return row ? chapterBudgetView(jobId, row) : null;
}

export function authorizeChapterBudget(snapshot: PipelineDirectorSnapshot, jobId: string, grant: DirectorChapterBudgetGrant): void {
  const view = readPausedChapterBudget(snapshot, jobId);
  if (!view || grant.jobId !== jobId || grant.chapterId !== view.chapterId) throw new Error("预算授权与暂停章节不一致，请刷新后重试。");
  if (grant.metric !== view.metric) throw new Error("预算计量口径发生变化，请刷新后重试。");
  if (!Number.isSafeInteger(grant.tokenLimit) || grant.tokenLimit > 10_000_000
    || grant.tokenLimit <= view.tokenLimit || grant.tokenLimit <= view.usedTokens + view.reserveTokens) {
    throw new Error("本章额度须高于已用量、下一步预留及当前上限。");
  }
  const row = snapshot.chapterUsage!.find(item => item.chapterId === view.chapterId)!;
  row.tokenLimit = grant.tokenLimit;
  delete row.budgetPause;
}

export function pauseChapterBudget(row: Checkpoint, reserveTokens: number, stage: DirectorChapterBudgetStage | null): boolean {
  if (!Number.isSafeInteger(reserveTokens) || reserveTokens < 0) throw new Error("下一步预算预估无效。");
  const view = chapterBudgetView("", row);
  if (view.usedTokens < view.tokenLimit && (reserveTokens === 0 || view.usedTokens + reserveTokens < view.tokenLimit)) return false;
  row.budgetPause = {reserveTokens, stage};
  return true;
}
