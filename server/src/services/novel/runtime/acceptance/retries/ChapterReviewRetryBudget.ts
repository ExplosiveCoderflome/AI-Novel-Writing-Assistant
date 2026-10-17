import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import { chapterReviewRetryPolicySchema, type ChapterReviewRetryPolicy } from "@ai-novel/shared/types/directorIssue";
import { withModelRequestBudget } from "../../../../../platform/llm/retries";

export const chapterReviewRetryStateSchema = z.object({
  version: z.literal(1),
  policy: chapterReviewRetryPolicySchema,
  used: z.number().int().nonnegative(),
  startedChecks: z.array(z.enum(["initial", "candidate"])).max(2),
  failedChecks: z.array(z.enum(["initial", "candidate"])).max(2),
}).refine(state => state.used <= state.policy.maxRetries, "检查重试记录超过保存的次数上限。");
export type ChapterReviewRetryState = z.infer<typeof chapterReviewRetryStateSchema>;
export type ReviewCheckScope = "initial" | "candidate";
export interface ChapterReviewRetrySummary extends ChapterReviewRetryPolicy {
  used: number;
  exhausted: boolean;
}

export class ReviewRetryPersistenceError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = "ReviewRetryPersistenceError"; }
}

export class ReviewRetryExhaustedError extends Error {
  constructor(readonly state: ChapterReviewRetryState) { super("章节检查已达到设定的最大重试次数。"); }
}

export interface ReviewRetryStore {
  read?: () => Promise<ChapterReviewRetryState | null>;
  update: (change: (state: ChapterReviewRetryState) => ChapterReviewRetryState) => Promise<ChapterReviewRetryState>;
}

/** Shared by initial acceptance and candidate verification; a restart must reuse the same store. */
export class ChapterReviewRetryBudget {
  private persistenceFailure: ReviewRetryPersistenceError | null = null;
  private guardFailure: unknown = null;
  constructor(private state: ChapterReviewRetryState, private readonly store: ReviewRetryStore,
    private readonly beforeRequest?: () => Promise<void>) {}

  throwIfUnsafe(): void {
    if (this.guardFailure) throw this.guardFailure;
    if (this.persistenceFailure) throw this.persistenceFailure;
  }

  private async update(change: Parameters<ReviewRetryStore["update"]>[0]): Promise<void> {
    try { this.state = await this.store.update(change); }
    catch (error) {
      if (error instanceof ReviewRetryExhaustedError) this.state = error.state;
      if (error instanceof ReviewRetryPersistenceError) this.persistenceFailure = error;
      throw error;
    }
  }

  async runCheck<T>(scope: ReviewCheckScope, run: () => Promise<T>): Promise<T> {
    return withModelRequestBudget({
      remaining: () => Math.max(0, this.state.policy.maxRetries - this.state.used),
      beforeRequest: async () => {
        this.throwIfUnsafe();
        try { await this.beforeRequest?.(); } catch (error) { this.guardFailure = error; throw error; }
        await this.update(state => {
          if (!state.startedChecks.includes(scope)) return { ...state, startedChecks: [...state.startedChecks, scope] };
          if (state.used >= state.policy.maxRetries) throw new ReviewRetryExhaustedError(state);
          return { ...state, used: state.used + 1 };
        });
      },
    }, async () => {
      try { return await run(); }
      catch (error) { this.throwIfUnsafe(); throw error; }
    });
  }

  async recordResult(scope: ReviewCheckScope, valid: boolean): Promise<void> {
    await this.update(state => ({ ...state, failedChecks: valid
      ? state.failedChecks.filter(check => check !== scope)
      : [...new Set([...state.failedChecks, scope])],
    }));
  }

  summary(): ChapterReviewRetrySummary {
    return { ...this.state.policy, used: this.state.used,
      exhausted: this.state.used >= this.state.policy.maxRetries && this.state.failedChecks.length > 0 };
  }

  async loadSummary(): Promise<ChapterReviewRetrySummary> {
    // A cache hit spends no request, but must still show the persisted cumulative count.
    this.state = await this.store.read?.() ?? this.state;
    return this.summary();
  }
}

const chapterBudget = new AsyncLocalStorage<ChapterReviewRetryBudget>();
export const currentChapterReviewRetryBudget = () => chapterBudget.getStore();
export const withChapterReviewRetryBudget = <T>(budget: ChapterReviewRetryBudget, run: () => Promise<T>) => chapterBudget.run(budget, run);

export function createTransientChapterReviewRetryBudget(policy: ChapterReviewRetryPolicy): ChapterReviewRetryBudget {
  let state: ChapterReviewRetryState = { version: 1, policy, used: 0, startedChecks: [], failedChecks: [] };
  return new ChapterReviewRetryBudget(state, { update: async change => (state = change(state)) });
}
