import { useMutation } from "@tanstack/react-query";
import { BookOpen, Download } from "lucide-react";
import { Link } from "react-router-dom";
import type { NovelBookCompletion } from "@ai-novel/shared/types/director/bookProgress";
import { downloadNovelExport } from "@/api/novel";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

interface NovelBookDeliveryActionsProps {
  novelId: string;
  title: string;
  completion?: NovelBookCompletion | null;
  allowDraftExport?: boolean;
  onFinalReview?:()=>void;
}

export default function NovelBookDeliveryActions({
  novelId,
  title,
  completion,
  allowDraftExport = false,
  onFinalReview,
}: NovelBookDeliveryActionsProps) {
  const download = useMutation({
    mutationFn: () => downloadNovelExport(novelId, "txt", "full", title),
    onSuccess: ({ blob, fileName }) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    },
    onError: () => toast.error("导出失败，请稍后重试。"),
  });
  const firstChapterId = completion?.status === "completed" ? completion.firstChapterId : null;
  if (!firstChapterId && !allowDraftExport) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {firstChapterId ? (
        <span role="status" className="text-sm font-medium text-success">全书已写完 · {completion?.completedChapters} 章</span>
      ) : null}
      {firstChapterId && onFinalReview ? <Button size="sm" onClick={onFinalReview}>全书完稿检查</Button> : firstChapterId && completion?.finalReviewRoute ? <Button asChild size="sm"><Link to={completion.finalReviewRoute}>全书完稿检查</Link></Button> : <Button variant={firstChapterId ? "default" : "outline"} size="sm" onClick={() => download.mutate()} disabled={download.isPending}>
        <Download className="h-4 w-4" aria-hidden="true" />
        {download.isPending ? "正在导出…" : firstChapterId ? "导出全书" : "导出当前稿件"}
      </Button>}
      {firstChapterId ? (
        <Button asChild variant="outline" size="sm">
          <Link to={`/novels/${encodeURIComponent(novelId)}/preview?${new URLSearchParams({ chapterId: firstChapterId })}`}>
            <BookOpen className="h-4 w-4" aria-hidden="true" /> 从第一章阅读
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
