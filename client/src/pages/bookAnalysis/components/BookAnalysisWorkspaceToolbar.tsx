import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { BookAnalysisDetail } from "@ai-novel/shared/types/bookAnalysis";
import { Columns2, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatStatus } from "../bookAnalysis.utils";

type ExportFormat = "markdown" | "json";

function formatTokenCount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0";
  }
  return new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(value)));
}

interface ToolbarPendingState {
  copy: boolean;
  rebuild: boolean;
  archive: boolean;
  publish: boolean;
  createStyleProfile: boolean;
  updateBudget: boolean;
  resumeWithBudget: boolean;
}

interface BookAnalysisWorkspaceToolbarProps {
  selectedAnalysis: BookAnalysisDetail;
  selectedNovelId: string;
  dualPaneAvailable: boolean;
  isDualPane: boolean;
  pending: ToolbarPendingState;
  onCopy: () => void;
  onRebuild: (analysisId: string) => void;
  onArchive: (analysisId: string) => void;
  onPublish: () => void;
  onCreateStyleProfile: () => void;
  onDownload: (format: ExportFormat) => void;
  onDualPaneChange: (enabled: boolean) => void;
  onOpenBudgetAdjust: () => void;
  onOpenBudgetResume: () => void;
}

export default function BookAnalysisWorkspaceToolbar(props: BookAnalysisWorkspaceToolbarProps) {
  const {
    selectedAnalysis,
    selectedNovelId,
    dualPaneAvailable,
    isDualPane,
    pending,
    onCopy,
    onRebuild,
    onArchive,
    onPublish,
    onCreateStyleProfile,
    onDownload,
    onDualPaneChange,
    onOpenBudgetAdjust,
    onOpenBudgetResume,
  } = props;

  const budgetTokens = selectedAnalysis.budgetTokens ?? null;
  const usedTokens = selectedAnalysis.usedTokens ?? 0;
  const budgetExceeded = selectedAnalysis.lastError?.includes("budget_exceeded") ?? false;
  const budgetResumeAvailable =
    budgetExceeded && (selectedAnalysis.status === "failed" || selectedAnalysis.status === "cancelled");
  const canAdjustBudget = selectedAnalysis.status !== "archived";

  return (
    <div className="sticky top-0 z-30 rounded-md border bg-background/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-normal">{selectedAnalysis.title}</h2>
            <Badge variant="outline">{formatStatus(selectedAnalysis.status)}</Badge>
            {selectedAnalysis.publishedDocumentId ? <Badge variant="secondary">{t("gen.pages.bookAnalysis.components.BookAnalysisWorkspaceToolbar.gen_dca0c13b")}</Badge> : null}
            {selectedAnalysis.sourceRange ? <Badge variant="secondary">{t("gen.pages.bookAnalysis.components.BookAnalysisWorkspaceToolbar.gen_8cd9cf52")}</Badge> : null}
            <Badge variant="outline">{t("gen.pages.bookAnalysis.components.BookAnalysisWorkspaceToolbar.gen_a4b085c4")}</Badge>
            <span className="inline-flex items-center gap-1">
              <Badge variant={budgetExceeded ? "destructive" : "outline"}>
                预算 {budgetTokens
                  ? `${formatTokenCount(usedTokens)}/${formatTokenCount(budgetTokens)}`
                  : `${formatTokenCount(usedTokens)}/不限`}
              </Badge>
              {canAdjustBudget ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  title={t("gen.pages.bookAnalysis.components.BookAnalysisWorkspaceToolbar.gen_015d69aa")}
                  onClick={onOpenBudgetAdjust}
                  disabled={pending.updateBudget || pending.resumeWithBudget}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="sr-only">{t("gen.pages.bookAnalysis.components.BookAnalysisWorkspaceToolbar.gen_015d69aa")}</span>
                </Button>
              ) : null}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            {selectedAnalysis.documentTitle} | 源版本 v{selectedAnalysis.documentVersionNumber}{selectedAnalysis.sourceRange ? ` | 范围：${selectedAnalysis.sourceRange.label ?? t("gen.pages.bookAnalysis.components.BookAnalysisWorkspaceToolbar.gen_963e1a7f")}` : ""}
            {selectedAnalysis.isCurrentVersion ? "" : ` | 当前激活版本 v${selectedAnalysis.currentDocumentVersionNumber}`}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onCopy} disabled={pending.copy}>
            复制
          </Button>
          {budgetResumeAvailable ? (
            <Button
              size="sm"
              onClick={onOpenBudgetResume}
              disabled={pending.resumeWithBudget || selectedAnalysis.status === "archived"}
            >
              {pending.resumeWithBudget ? t("gen.pages.bookAnalysis.components.BookAnalysisWorkspaceToolbar.gen_abe2c5d2") : t("gen.pages.bookAnalysis.components.BookAnalysisWorkspaceToolbar.gen_a69ce727")}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRebuild(selectedAnalysis.id)}
            disabled={pending.rebuild || selectedAnalysis.status === "archived"}
          >
            重新生成
          </Button>
          <Button
            size="sm"
            onClick={onPublish}
            disabled={!selectedNovelId || pending.publish || selectedAnalysis.status === "archived"}
            title={!selectedNovelId ? t("gen.pages.bookAnalysis.components.BookAnalysisWorkspaceToolbar.gen_aac678e4") : t("gen.pages.bookAnalysis.components.BookAnalysisWorkspaceToolbar.gen_a3db6e46")}
          >
            {pending.publish ? t("gen.pages.bookAnalysis.components.BookAnalysisWorkspaceToolbar.gen_27d8a2fa") : t("gen.pages.bookAnalysis.components.BookAnalysisWorkspaceToolbar.gen_83611abd")}
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={`/tasks?kind=book_analysis&id=${selectedAnalysis.id}`}>{t("gen.pages.bookAnalysis.components.BookAnalysisWorkspaceToolbar.gen_2488f577")}</Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => onDownload("markdown")}>
            导出 MD
          </Button>
          <Button size="sm" variant="outline" onClick={() => onDownload("json")}>
            导出 JSON
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onCreateStyleProfile}
            disabled={pending.createStyleProfile || selectedAnalysis.status === "archived"}
          >
            {pending.createStyleProfile ? t("gen.pages.bookAnalysis.components.BookAnalysisWorkspaceToolbar.gen_0245e8fb") : t("gen.pages.bookAnalysis.components.BookAnalysisWorkspaceToolbar.gen_ac303505")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onArchive(selectedAnalysis.id)}
            disabled={pending.archive || selectedAnalysis.status === "archived"}
          >
            归档
          </Button>
          {dualPaneAvailable ? (
            <Button
              type="button"
              size="sm"
              variant={isDualPane ? "default" : "outline"}
              onClick={() => onDualPaneChange(!isDualPane)}
              title={isDualPane ? t("gen.pages.bookAnalysis.components.BookAnalysisWorkspaceToolbar.gen_e6f035fc") : t("gen.pages.bookAnalysis.components.BookAnalysisWorkspaceToolbar.gen_2ba77e44")}
            >
              <Columns2 className="mr-1.5 h-3.5 w-3.5" />
              双栏
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
