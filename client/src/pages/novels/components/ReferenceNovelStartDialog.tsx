import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BookAnalysis } from "@ai-novel/shared/types/bookAnalysis";
import { BookOpen, Check, GitBranch, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { listBookAnalyses } from "@/api/bookAnalysis";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";

export type ReferenceNovelCreateMode = "continuation" | "adaptation";

interface ReferenceNovelStartDialogProps {
  open: boolean;
  fixedAnalysis?: BookAnalysis | null;
  onOpenChange: (open: boolean) => void;
}

export default function ReferenceNovelStartDialog({
  open,
  fixedAnalysis,
  onOpenChange,
}: ReferenceNovelStartDialogProps) {
  const navigate = useNavigate();
  const [selectedAnalysisId, setSelectedAnalysisId] = useState(fixedAnalysis?.id ?? "");
  const analysesQuery = useQuery({
    queryKey: queryKeys.bookAnalysis.list("reference-novel-start-succeeded"),
    queryFn: () => listBookAnalyses({ status: "succeeded" }),
    enabled: open && !fixedAnalysis,
  });
  const analyses = useMemo(
    () => fixedAnalysis ? [fixedAnalysis] : (analysesQuery.data?.data ?? []),
    [analysesQuery.data?.data, fixedAnalysis],
  );
  const selectedAnalysis = analyses.find((analysis) => analysis.id === selectedAnalysisId) ?? analyses[0] ?? null;

  useEffect(() => {
    if (open && !analyses.some((analysis) => analysis.id === selectedAnalysisId)) {
      setSelectedAnalysisId(analyses[0]?.id ?? "");
    }
  }, [analyses, open, selectedAnalysisId]);

  const startCreation = (mode: ReferenceNovelCreateMode) => {
    if (!selectedAnalysis) {
      return;
    }
    const params = new URLSearchParams({
      referenceMode: mode,
      bookAnalysisId: selectedAnalysis.id,
      sourceDocumentId: selectedAnalysis.documentId,
      referenceTitle: selectedAnalysis.documentTitle,
    });
    onOpenChange(false);
    navigate(`/novels/auto-director?${params.toString()}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        className="max-w-3xl"
        title="照着一本书写"
        description="选择参考小说和创作方式，系统会自动带入拆书结论与写法。"
      >
        {!fixedAnalysis ? (
          <section>
            <div className="text-sm font-medium text-foreground">选择参考小说</div>
            {analysesQuery.isLoading ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted/45 px-4 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />正在读取可用小说…
              </div>
            ) : analyses.length > 0 ? (
              <div className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-xl bg-muted/35 p-2" role="radiogroup" aria-label="参考小说">
                {analyses.map((analysis) => {
                  const selected = analysis.id === selectedAnalysis?.id;
                  return (
                    <button
                      key={analysis.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`flex w-full items-start justify-between gap-3 rounded-lg px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "bg-background text-foreground ring-1 ring-border" : "text-muted-foreground hover:bg-background/65"}`}
                      onClick={() => setSelectedAnalysisId(analysis.id)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{analysis.documentTitle}</span>
                        <span className="mt-1 block truncate text-xs">{analysis.title}</span>
                      </span>
                      {selected ? <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 rounded-xl bg-muted/45 px-4 py-5 text-sm text-muted-foreground">
                <p>还没有完成拆书的参考小说。</p>
                <Button type="button" variant="ghost" className="mt-2 h-auto p-0 text-primary hover:bg-transparent" onClick={() => navigate("/book-analysis")}>导入并分析参考小说</Button>
              </div>
            )}
          </section>
        ) : (
          <div className="rounded-xl bg-muted/40 px-4 py-3">
            <div className="text-xs text-muted-foreground">参考小说</div>
            <div className="mt-1 font-medium text-foreground">{fixedAnalysis.documentTitle}</div>
          </div>
        )}

        <section className="mt-5">
          <div className="text-sm font-medium text-foreground">选择创作方式</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="rounded-xl bg-muted/55 p-5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedAnalysis}
              onClick={() => startCreation("continuation")}
            >
              <BookOpen className="h-5 w-5" aria-hidden="true" />
              <div className="mt-4 font-semibold text-foreground">续写原作</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">保留角色、世界规则、时间线与未完线索，从原作结尾继续写。</p>
            </button>
            <button
              type="button"
              className="rounded-xl bg-muted/55 p-5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedAnalysis}
              onClick={() => startCreation("adaptation")}
            >
              <GitBranch className="h-5 w-5" aria-hidden="true" />
              <div className="mt-4 font-semibold text-foreground">参考创作新书</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">参考结构、节奏和写法，重新生成角色、世界与剧情。</p>
            </button>
          </div>
        </section>
      </AppDialogContent>
    </Dialog>
  );
}
