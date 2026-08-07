import type {
  BookAnalysis,
  BookAnalysisStatus,
} from "@ai-novel/shared/types/bookAnalysis";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate, formatStatus } from "../bookAnalysis.utils";
import SelectControl from "@/components/common/SelectControl";

interface BookAnalysisSidebarProps {
  analysisMode: "reference" | "diagnosis";
  keyword: string;
  status: BookAnalysisStatus | "";
  analyses: BookAnalysis[];
  selectedAnalysisId: string;
  loading: boolean;
  errorMessage: string;
  onKeywordChange: (keyword: string) => void;
  onStatusChange: (status: BookAnalysisStatus | "") => void;
  onOpenAnalysis: (analysisId: string, documentId: string) => void;
  onOpenCreateDialog: () => void;
  onRetry: () => void;
}

export default function BookAnalysisSidebar(props: BookAnalysisSidebarProps) {
  const {
    analysisMode,
    keyword,
    status,
    analyses,
    selectedAnalysisId,
    loading,
    errorMessage,
    onKeywordChange,
    onStatusChange,
    onOpenAnalysis,
    onOpenCreateDialog,
    onRetry,
  } = props;

  return (
    <Card className="overflow-hidden rounded-2xl border-border/50 bg-card/80 shadow-[0_14px_40px_rgba(15,23,42,0.04)] backdrop-blur-sm">
      <CardHeader className="space-y-4 border-b border-border/40 px-4 pb-4 pt-5">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg tracking-tight">分析列表</CardTitle>
          <Badge variant="secondary" className="border-0 bg-muted/70 font-normal">{analyses.length}</Badge>
        </div>
        <Button type="button" size="sm" className="h-10 w-full rounded-xl shadow-none" onClick={onOpenCreateDialog}>
          <Plus className="mr-1.5 h-4 w-4" />
          新建拆书
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 px-3 pb-4 pt-4">
        <Input className="h-10 rounded-xl border-border/50 bg-muted/20 shadow-none" value={keyword} onChange={(event) => onKeywordChange(event.target.value)} placeholder="搜索标题或关键词" />
        <SelectControl
          className="h-10 w-full rounded-xl border border-border/50 bg-muted/20 px-3 text-sm shadow-none"
          value={status}
          onChange={(event) => onStatusChange(event.target.value as BookAnalysisStatus | "")}
        >
          <option value="">全部状态</option>
          <option value="draft">草稿</option>
          <option value="queued">排队中</option>
          <option value="running">运行中</option>
          <option value="succeeded">成功</option>
          <option value="failed">失败</option>
          <option value="cancelled">已取消</option>
          <option value="archived">已归档</option>
        </SelectControl>

        <div className="space-y-1 pt-1">
          {loading ? (
            <div className="flex items-center gap-2 rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              正在加载拆书分析...
            </div>
          ) : null}
          {!loading && errorMessage ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
              <div>{errorMessage}</div>
              <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRetry}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                重新加载
              </Button>
            </div>
          ) : null}
          {!loading && !errorMessage ? analyses.map((item) => {
            const itemSearchParams = new URLSearchParams({
              analysisId: item.id,
              documentId: item.documentId,
            });
            if (analysisMode === "diagnosis") {
              itemSearchParams.set("mode", "diagnosis");
            }
            return (
              <Link
                key={item.id}
                to={{ pathname: "/book-analysis", search: itemSearchParams.toString() }}
                className={`relative block w-full rounded-xl border-0 px-3 py-3 text-left transition-all ${
                  item.id === selectedAnalysisId
                    ? "bg-primary/[0.07] shadow-[inset_3px_0_0_hsl(var(--primary))]"
                    : "hover:bg-muted/45"
                }`}
                onClick={() => onOpenAnalysis(item.id, item.documentId)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{item.title}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {item.documentTitle} | v{item.documentVersionNumber}
                    </div>
                    {item.sourceRange ? (
                      <div className="mt-1 truncate text-[11px] text-muted-foreground">范围：{item.sourceRange.label ?? "选定章节"}</div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {item.publishedDocumentId && (
                      <Badge variant="secondary" className="border-0 bg-muted px-1.5 text-[10px] font-normal">已发布</Badge>
                    )}
                    <Badge variant="secondary" className="border-0 bg-transparent px-1 text-[10px] font-normal text-muted-foreground">
                      <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${item.status === "succeeded" ? "bg-success" : item.status === "failed" ? "bg-destructive" : "bg-muted-foreground/50"}`} />
                      {formatStatus(item.status)}
                    </Badge>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  {Math.round(item.progress * 100)}% | {formatDate(item.updatedAt)}
                </div>
                {item.lastError ? (
                  <div className="mt-1 line-clamp-2 text-[11px] text-destructive">{item.lastError}</div>
                ) : null}
              </Link>
            );
          }) : null}

          {!loading && !errorMessage && analyses.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
              {keyword.trim() || status
                ? "没有符合当前筛选的拆书分析，可以调整筛选条件。"
                : "暂无拆书分析，点击上方「新建拆书」开始。"}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
