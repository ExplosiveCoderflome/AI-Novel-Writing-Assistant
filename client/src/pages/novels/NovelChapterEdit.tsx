import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getChapterAuditReports, getChapterPlan, getLatestStateSnapshot, getNovelDetail } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import ChapterEditorShell from "./components/chapterEditor/ChapterEditorShell";
import { buildWorldInjectionSummary } from "./novelEdit.utils";

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
  const chapterPlanQuery = useQuery({
    queryKey: queryKeys.novels.chapterPlan(id, chapterId || "none"),
    queryFn: () => getChapterPlan(id, chapterId),
    enabled: Boolean(id && chapterId),
  });
  const chapterAuditReportsQuery = useQuery({
    queryKey: queryKeys.novels.chapterAuditReports(id, chapterId || "none"),
    queryFn: () => getChapterAuditReports(id, chapterId),
    enabled: Boolean(id && chapterId),
  });
  const latestStateSnapshotQuery = useQuery({
    queryKey: queryKeys.novels.latestStateSnapshot(id),
    queryFn: () => getLatestStateSnapshot(id),
    enabled: Boolean(id),
  });

  const detail = novelDetailQuery.data?.data;
  const chapter = useMemo(
    () => detail?.chapters.find((item) => item.id === chapterId),
    [chapterId, detail?.chapters],
  );
  const worldInjectionSummary = useMemo(
    () => buildWorldInjectionSummary(detail?.world),
    [detail?.world],
  );
  const styleSummary = useMemo(
    () => [
      detail?.styleTone?.trim(),
      detail?.narrativePov ? `视角: ${detail.narrativePov}` : null,
      detail?.pacePreference ? `节奏: ${detail.pacePreference}` : null,
      detail?.emotionIntensity ? `情绪强度: ${detail.emotionIntensity}` : null,
    ].filter((item): item is string => Boolean(item && item.trim())).join(" · ") || null,
    [detail?.emotionIntensity, detail?.narrativePov, detail?.pacePreference, detail?.styleTone],
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
        chapterPlan={chapterPlanQuery.data?.data ?? null}
        latestStateSnapshot={latestStateSnapshotQuery.data?.data ?? null}
        chapterAuditReports={chapterAuditReportsQuery.data?.data ?? []}
        worldInjectionSummary={worldInjectionSummary}
        styleSummary={styleSummary}
        onBack={() => navigate(`/novels/${id}/edit`)}
        onOpenVersionHistory={() => navigate(`/novels/${id}/edit`)}
      />
    </div>
  );
}
