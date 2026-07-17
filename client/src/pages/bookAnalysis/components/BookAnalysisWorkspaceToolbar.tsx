import type { BookAnalysisDetail } from "@ai-novel/shared/types/bookAnalysis";
import { Columns2, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatStatus, isBookAnalysisBudgetExceeded } from "../bookAnalysis.utils";

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
  const budgetExceeded = isBookAnalysisBudgetExceeded(selectedAnalysis.lastError);
  const budgetResumeAvailable =
    budgetExceeded && (selectedAnalysis.status === "failed" || selectedAnalysis.status === "cancelled");
  const canAdjustBudget = selectedAnalysis.status !== "archived";

  return (
    <div className="rounded-md border border-border/80 bg-card">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold tracking-normal text-foreground">结果工具</h2>
            <Badge variant="outline">{formatStatus(selectedAnalysis.status)}</Badge>
            {selectedAnalysis.publishedDocumentId ? <Badge variant="secondary">已发布</Badge> : null}
            <Badge variant={budgetExceeded ? "destructive" : "outline"}>
              预算 {budgetTokens
                ? `${formatTokenCount(usedTokens)}/${formatTokenCount(budgetTokens)}`
                : `${formatTokenCount(usedTokens)}/不限`}
            </Badge>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            阅读结果是当前主任务；发布、导出和维护操作可按需使用。
          </p>
        </div>
        <div className="mobile-full-actions flex flex-wrap gap-2">
          {budgetResumeAvailable ? (
            <Button
              size="sm"
              variant="outline"
              onClick={onOpenBudgetResume}
              disabled={pending.resumeWithBudget || selectedAnalysis.status === "archived"}
            >
              {pending.resumeWithBudget ? "提交中..." : "扩容预算并续跑"}
            </Button>
          ) : null}
          {dualPaneAvailable ? (
            <Button
              type="button"
              size="sm"
              variant={isDualPane ? "secondary" : "outline"}
              onClick={() => onDualPaneChange(!isDualPane)}
              title={isDualPane ? "关闭双栏对照" : "打开双栏对照"}
            >
              <Columns2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {isDualPane ? "关闭双栏" : "原文双栏"}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={onPublish}
            disabled={!selectedNovelId || pending.publish || selectedAnalysis.status === "archived"}
            title={!selectedNovelId ? "请在下方「分析信息与发布」中选择目标小说" : "发布到小说知识库"}
          >
            {pending.publish ? "发布中..." : "发布到知识库"}
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={`/tasks?kind=book_analysis&id=${selectedAnalysis.id}`}>任务详情</Link>
          </Button>
        </div>
      </div>

      <details className="border-t border-border/70 px-4 py-3">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">更多维护操作</summary>
        <div className="mobile-full-actions mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onCopy} disabled={pending.copy}>复制分析</Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRebuild(selectedAnalysis.id)}
            disabled={pending.rebuild || selectedAnalysis.status === "archived"}
          >
            重新生成
          </Button>
          {canAdjustBudget ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenBudgetAdjust}
              disabled={pending.updateBudget || pending.resumeWithBudget}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              调整预算
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => onDownload("markdown")}>导出 MD</Button>
          <Button size="sm" variant="outline" onClick={() => onDownload("json")}>导出 JSON</Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onCreateStyleProfile}
            disabled={pending.createStyleProfile || selectedAnalysis.status === "archived"}
          >
            {pending.createStyleProfile ? "生成写法中..." : "生成写法"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onArchive(selectedAnalysis.id)}
            disabled={pending.archive || selectedAnalysis.status === "archived"}
          >
            归档
          </Button>
        </div>
      </details>
    </div>
  );
}
