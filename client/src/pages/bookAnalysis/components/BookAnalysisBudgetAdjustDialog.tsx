import { useEffect, useMemo, useState } from "react";
import type { BookAnalysisDetail } from "@ai-novel/shared/types/bookAnalysis";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type BudgetDialogMode = "adjust" | "resume";

const MIN_BUDGET_TOKENS = 1_000;
const MAX_BUDGET_TOKENS = 10_000_000;

function formatTokenCount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0";
  }
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(value)));
}

function normalizeBudgetInput(value: string, allowUnlimited: boolean): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return allowUnlimited ? null : Number.NaN;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }
  return Math.floor(parsed);
}

function buildRecommendedResumeBudget(analysis: BookAnalysisDetail): number {
  const usedTokens = analysis.usedTokens ?? 0;
  const succeededCount = analysis.sections.filter((section) => section.status === "succeeded").length;
  const remainingCount = analysis.sections.filter(
    (section) => !section.frozen && section.status !== "succeeded",
  ).length;
  const averageFinishedSectionCost = succeededCount > 0
    ? Math.ceil(usedTokens / succeededCount)
    : 25_000;
  const estimatedNeed = usedTokens + Math.max(1, remainingCount) * averageFinishedSectionCost * 1.2;
  return Math.min(
    MAX_BUDGET_TOKENS,
    Math.max(MIN_BUDGET_TOKENS, Math.ceil(estimatedNeed / 1_000) * 1_000),
  );
}

interface BookAnalysisBudgetAdjustDialogProps {
  open: boolean;
  mode: BudgetDialogMode;
  analysis: BookAnalysisDetail;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (budgetTokens: number | null) => Promise<void>;
}

export default function BookAnalysisBudgetAdjustDialog(props: BookAnalysisBudgetAdjustDialogProps) {
  const {
    open,
    mode,
    analysis,
    pending,
    onOpenChange,
    onSubmit,
  } = props;
  const [budgetInput, setBudgetInput] = useState("");
  const usedTokens = analysis.usedTokens ?? 0;
  const currentBudget = analysis.budgetTokens ?? null;
  const allowUnlimited = mode === "adjust";
  const parsedBudget = normalizeBudgetInput(budgetInput, allowUnlimited);
  const recommendedResumeBudget = useMemo(() => buildRecommendedResumeBudget(analysis), [analysis]);
  const retrySectionCount = analysis.sections.filter(
    (section) => !section.frozen && section.status !== "succeeded",
  ).length;
  const succeededSectionCount = analysis.sections.filter((section) => section.status === "succeeded").length;
  const frozenSectionCount = analysis.sections.filter((section) => section.frozen).length;
  const remainingTokens = typeof parsedBudget === "number" && Number.isFinite(parsedBudget)
    ? parsedBudget - usedTokens
    : null;
  const budgetIsFinite = typeof parsedBudget === "number" && Number.isFinite(parsedBudget);
  const hasValidBudget = parsedBudget === null || (
    budgetIsFinite &&
    parsedBudget >= MIN_BUDGET_TOKENS &&
    parsedBudget <= MAX_BUDGET_TOKENS
  );
  const canSubmit = hasValidBudget && (mode === "adjust" || budgetIsFinite) && !pending;

  useEffect(() => {
    if (!open) {
      return;
    }
    if (mode === "resume") {
      setBudgetInput(String(recommendedResumeBudget));
      return;
    }
    setBudgetInput(currentBudget ? String(currentBudget) : "");
  }, [currentBudget, mode, open, recommendedResumeBudget]);

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }
    await onSubmit(parsedBudget);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        title={mode === "resume" ? "扩容预算并续跑" : "调整拆书预算"}
        description={mode === "resume"
          ? "为这次拆书设置新的预算上限，并继续处理未完成的小节。"
          : "修改预算上限后，累计用量保留，后续小节按新的上限检查。"}
        className="max-w-xl"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              取消
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
              {pending ? "提交中..." : mode === "resume" ? "扩容并续跑" : "保存调整"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {mode === "resume" ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              本次会重做 {retrySectionCount} 节，成功的 {succeededSectionCount} 节保留
              {frozenSectionCount > 0 ? `，冻结的 ${frozenSectionCount} 节跳过` : ""}。
            </div>
          ) : null}

          <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">累计用量</div>
              <div className="mt-1 font-mono tabular-nums">{formatTokenCount(usedTokens)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">预算上限</div>
              <div className="mt-1 font-mono tabular-nums">
                {currentBudget ? formatTokenCount(currentBudget) : "不限"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">调整后剩余</div>
              <div className="mt-1 font-mono tabular-nums">
                {parsedBudget === null
                  ? "不限"
                  : remainingTokens === null
                    ? "-"
                    : formatTokenCount(remainingTokens)}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="book-analysis-budget-input" className="text-sm font-medium">
                新预算上限
              </label>
              {mode === "resume" ? (
                <button
                  type="button"
                  className="text-xs text-primary underline-offset-4 hover:underline"
                  onClick={() => setBudgetInput(String(recommendedResumeBudget))}
                >
                  使用建议值 {formatTokenCount(recommendedResumeBudget)}
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="book-analysis-budget-input"
                type="number"
                min={MIN_BUDGET_TOKENS}
                max={MAX_BUDGET_TOKENS}
                step={1_000}
                value={budgetInput}
                onChange={(event) => setBudgetInput(event.target.value)}
                placeholder={allowUnlimited ? "留空表示不限" : String(recommendedResumeBudget)}
                className="text-right font-mono tabular-nums"
              />
              <span className="shrink-0 text-xs text-muted-foreground">tokens</span>
            </div>
            {!hasValidBudget ? (
              <div className="text-xs text-destructive">
                请输入 {formatTokenCount(MIN_BUDGET_TOKENS)} 到 {formatTokenCount(MAX_BUDGET_TOKENS)} 之间的整数。
              </div>
            ) : null}
            {mode === "adjust" && analysis.status === "running" ? (
              <div className="text-xs leading-5 text-muted-foreground">
                调低预算不会立即终止当前小节，会在下个小节边界按新上限检查。
              </div>
            ) : null}
            {budgetIsFinite && remainingTokens !== null && remainingTokens < 0 ? (
              <div className="text-xs leading-5 text-amber-700">
                新预算低于累计用量，继续生成时会触发预算停止。
              </div>
            ) : null}
          </div>
        </div>
      </AppDialogContent>
    </Dialog>
  );
}
