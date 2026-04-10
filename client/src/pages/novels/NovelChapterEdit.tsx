import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getChapterAuditReports, getChapterPlan, getLatestStateSnapshot, getNovelDetail } from "@/api/novel";
import { queryKeys } from "@/api/queryKeys";
import ChapterEditorShell from "./components/chapterEditor/ChapterEditorShell";
import { buildWorldInjectionSummary } from "./novelEdit.utils";

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
      detail?.narrativePov ? `视角：${detail.narrativePov}` : null,
      detail?.pacePreference ? `节奏：${detail.pacePreference}` : null,
      detail?.emotionIntensity ? `情绪强度：${detail.emotionIntensity}` : null,
    ].filter((item): item is string => Boolean(item && item.trim())).join(" · ") || null,
    [detail?.emotionIntensity, detail?.narrativePov, detail?.pacePreference, detail?.styleTone],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border/70 bg-gradient-to-r from-slate-50 via-background to-emerald-50/40 p-5 shadow-sm">
        <div className="text-sm leading-7 text-muted-foreground">
          独立章节页现在复用同一套沉浸式章节编辑器壳层，主轴只保留正文编辑、局部 AI 改写和待确认 diff。
        </div>
      </div>

      <ChapterEditorShell
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
