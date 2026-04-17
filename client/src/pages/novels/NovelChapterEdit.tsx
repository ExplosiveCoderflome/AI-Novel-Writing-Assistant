import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getChapterEditorWorkspace, getNovelDetail } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import ChapterEditorShell from "./components/chapterEditor/ChapterEditorShell";

function PageStateCard(props: { message: string }) {
  return (
    <div className="rounded-3xl border border-border/70 bg-background p-10 text-center text-sm text-muted-foreground shadow-sm">
      {props.message}
    </div>
  );
}

export default function NovelChapterEdit() {
  const { id = "", chapterId = "" } = useParams();
  const navigate = useNavigate();

  const novelDetailQuery = useQuery({
    queryKey: queryKeys.novels.detail(id),
    queryFn: () => getNovelDetail(id),
    enabled: Boolean(id),
  });
  const chapterEditorWorkspaceQuery = useQuery({
    queryKey: queryKeys.novels.chapterEditorWorkspace(id, chapterId || "none"),
    queryFn: () => getChapterEditorWorkspace(id, chapterId),
    enabled: Boolean(id && chapterId),
  });

  const detail = novelDetailQuery.data?.data;
  const chapter = useMemo(
    () => detail?.chapters.find((item) => item.id === chapterId),
    [chapterId, detail?.chapters],
  );

  if (novelDetailQuery.isLoading && !detail) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4">
        <PageStateCard message="正在加载章节编辑器..." />
      </div>
    );
  }

  if (novelDetailQuery.isError) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4">
        <PageStateCard message="章节数据加载失败，请刷新后重试。" />
      </div>
    );
  }

  if (!chapter) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4">
        <PageStateCard message="没有找到对应章节，可能已被删除或当前链接不完整。" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ChapterEditorShell
        key={`${chapter.id}:${chapter.updatedAt}`}
        novelId={id}
        chapter={chapter}
        workspace={chapterEditorWorkspaceQuery.data?.data ?? null}
        workspaceStatus={chapterEditorWorkspaceQuery.isLoading
          ? "loading"
          : chapterEditorWorkspaceQuery.isError
            ? "error"
            : "ready"}
        onBack={() => navigate(`/novels/${id}/edit`)}
        onOpenVersionHistory={() => navigate(`/novels/${id}/edit`)}
      />
    </div>
  );
}
