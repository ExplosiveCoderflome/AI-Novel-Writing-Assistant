import type {
  BookAnalysis,
  BookAnalysisStatus,
} from "@ai-novel/shared/types/bookAnalysis";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate, formatStatus } from "../bookAnalysis.utils";
import SelectControl from "@/components/common/SelectControl";

interface BookAnalysisSidebarProps {
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
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>分析列表</CardTitle>
          <Badge variant="outline">{analyses.length}</Badge>
        </div>
        <Button type="button" size="sm" className="w-full" onClick={onOpenCreateDialog}>
          <Plus className="mr-1.5 h-4 w-4" />
          新建拆书
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input value={keyword} onChange={(event) => onKeywordChange(event.target.value)} placeholder="搜索标题或关键词" />
        <SelectControl
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
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

        <div className="space-y-2">
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
          {!loading && !errorMessage ? analyses.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`w-full rounded-md border p-3 text-left transition-colors ${
                item.id === selectedAnalysisId ? "border-primary bg-primary/5" : "hover:bg-muted/30"
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
                    <Badge variant="secondary" className="text-[10px]">已发布</Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">{formatStatus(item.status)}</Badge>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                {Math.round(item.progress * 100)}% | {formatDate(item.updatedAt)}
              </div>
              {item.lastError ? (
                <div className="mt-1 line-clamp-2 text-[11px] text-destructive">{item.lastError}</div>
              ) : null}
            </button>
          )) : null}

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
