import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getChapterEditorWorkspace, getNovelDetail } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import ChapterEditorShell from "@/pages/novels/components/chapterEditor/ChapterEditorShell";

export function DirectorChapterEditor({ novelId, chapterId, onClose, onSaved }: {
  novelId: string; chapterId: string; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const editingState = useRef({ isDirty: false, isBusy: false, hasCandidate: false });
  const detailQuery = useQuery({
    queryKey: queryKeys.novels.detail(novelId), queryFn: () => getNovelDetail(novelId),
    refetchOnWindowFocus: false,
  });
  const workspaceQuery = useQuery({
    queryKey: queryKeys.novels.chapterEditorWorkspace(novelId, chapterId),
    queryFn: () => getChapterEditorWorkspace(novelId, chapterId), staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const chapter = detailQuery.data?.data?.chapters.find(row => row.id === chapterId);
  function requestClose() {
    const state = editingState.current;
    if (state.isBusy) {
      toast.error("请等待当前操作完成后再离开正文编辑。");
      return;
    }
    if ((state.isDirty || state.hasCandidate) && !window.confirm("未保存的修改可从草稿恢复，未采纳的 AI 候选将被关闭。要离开正文编辑吗？")) return;
    onClose();
  }
  return <Dialog open onOpenChange={open => { if (!open) requestClose(); }}>
    <AppDialogContent title={chapter ? `编辑正文 · 第 ${chapter.order} 章 · ${chapter.title}` : "编辑正文"}
      description="点击正文放置光标，在 AI 操作区选择续写方向，比较候选后插入正文。编辑期间暂停跟随生成。"
      className="left-0 top-0 h-dvh max-h-dvh w-full max-w-none translate-x-0 translate-y-0 rounded-none border-0"
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-3 sm:p-4"
      onInteractOutside={event => event.preventDefault()}>
      {detailQuery.isError ? <div role="alert" className="space-y-3 py-8 text-sm"><p>章节读取失败，请重新读取后再编辑。</p><Button onClick={() => void detailQuery.refetch()}>重新读取章节</Button></div>
        : !chapter ? <p className="py-8 text-sm text-muted-foreground">{detailQuery.isLoading ? "正在读取章节…" : "未找到本章，请返回目录选择章节。"}</p>
          : <ChapterEditorShell key={chapter.id} novelId={novelId} chapter={chapter}
            workspace={workspaceQuery.data?.data ?? null}
            workspaceStatus={workspaceQuery.isLoading ? "loading" : workspaceQuery.isError ? "error" : "ready"}
            backLabel="返回正文阅读" onBack={onClose} onChapterSaved={onSaved}
            onEditingStateChange={state => { editingState.current = state; }}
            onRefreshWorkspace={() => { void workspaceQuery.refetch(); }} isRefreshingWorkspace={workspaceQuery.isFetching}/>
      }
    </AppDialogContent>
  </Dialog>;
}
