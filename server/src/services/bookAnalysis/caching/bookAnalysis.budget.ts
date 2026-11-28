import { prisma } from "../../../db/prisma";
import type { LlmTokenUsageSnapshot } from "../../../llm/usageTracking";
import { AppError } from "../../../middleware/errorHandler";

export const BOOK_ANALYSIS_BUDGET_EXCEEDED_CODE = "budget_exceeded";

export class BookAnalysisBudgetExceededError extends AppError {
  constructor(
    readonly analysisId: string,
    readonly usedTokens: number,
    readonly budgetTokens: number,
  ) {
    super(`拆书累计用量已达到预算。请调整预算后继续。（${BOOK_ANALYSIS_BUDGET_EXCEEDED_CODE}: ${usedTokens}/${budgetTokens} tokens）`, 409);
    this.name = "BookAnalysisBudgetExceededError";
  }
}

export function normalizeBookAnalysisBudgetTokens(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : null;
}

function readUsageTokens(usage: LlmTokenUsageSnapshot | null | undefined): number {
  if (!usage) {
    return 0;
  }
  return Math.max(0, Math.round(usage.totalTokens));
}

const budgetSelection = { budgetTokens: true, usedTokens: true } as const;
type BookAnalysisBudgetState = { budgetTokens: number | null; usedTokens: number | null };

export class BookAnalysisBudgetGuard {
  constructor(private readonly analysisId: string) {}

  async onSectionFinished(usage: LlmTokenUsageSnapshot | null | undefined): Promise<void> {
    this.assertWithinBudget(await this.recordUsage(usage));
  }

  async assertCanDispatch(): Promise<void> {
    const state = await prisma.bookAnalysis.findUnique({ where: { id: this.analysisId }, select: budgetSelection });
    if (state?.budgetTokens && (state.usedTokens ?? 0) >= state.budgetTokens) {
      throw new BookAnalysisBudgetExceededError(this.analysisId, state.usedTokens ?? 0, state.budgetTokens);
    }
  }

  async recordUsage(
    usage: LlmTokenUsageSnapshot | null | undefined,
    db: Pick<typeof prisma, "bookAnalysis"> = prisma,
  ): Promise<BookAnalysisBudgetState | null> {
    const tokenCount = readUsageTokens(usage);
    // Initialize legacy NULL counters without overwriting another completed call.
    if (tokenCount > 0) {
      await db.bookAnalysis.updateMany({
        where: { id: this.analysisId, usedTokens: null },
        data: { usedTokens: 0 },
      });
    }
    return tokenCount > 0
      ? db.bookAnalysis.update({
          where: { id: this.analysisId },
          data: { usedTokens: { increment: tokenCount } },
          select: budgetSelection,
        })
      : db.bookAnalysis.findUnique({
          where: { id: this.analysisId },
          select: budgetSelection,
        });
  }

  assertWithinBudget(state: BookAnalysisBudgetState | null): void {
    const usedTokens = state?.usedTokens ?? 0;
    if (state?.budgetTokens && usedTokens > state.budgetTokens) {
      throw new BookAnalysisBudgetExceededError(this.analysisId, usedTokens, state.budgetTokens);
    }
  }
}
