import { BookOpen, Clock3, Download, ImagePlus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { ImageTaskStatus } from "@ai-novel/shared/types/image";
import defaultNovelCoverUrl from "@/assets/default-novel-cover.webp";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { resolveImageAssetUrl } from "@/api/images";
import { getNovelWorkspaceHref, type NovelListItem } from "./novelListViewModel";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最近编辑";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
}

function getFormLabel(novel: NovelListItem): string {
  if (novel.narrativeForm === "short_story") return "短篇";
  return novel.writingMode === "continuation" ? "长篇续写" : "长篇原创";
}

function getProgress(novel: NovelListItem): number {
  const task = novel.narrativeForm === "short_story" ? novel.latestCreationStudioTask : novel.latestAutoDirectorTask;
  if (task) return Math.max(0, Math.min(100, Math.round(task.progress * 100)));
  if (novel.projectStatus === "completed" && novel.outlineStatus === "completed") return 100;
  return 0;
}

function getPrimaryAction(novel: NovelListItem): { label: string; href: string } {
  if (novel.narrativeForm === "short_story") {
    const task = novel.latestCreationStudioTask;
    return {
      label: task?.status === "succeeded" ? "阅读作品" : "继续创作",
      href: `/novels/${novel.id}/story`,
    };
  }
  const task = novel.latestAutoDirectorTask;
  const workspaceHref = getNovelWorkspaceHref(novel);
  if (task?.status === "failed" || task?.status === "cancelled") {
    return { label: "恢复创作", href: workspaceHref };
  }
  if (task?.status === "waiting_approval") {
    return { label: "继续处理", href: workspaceHref };
  }
  return { label: task ? "继续创作" : "编辑作品", href: workspaceHref };
}

function getPreviewHref(novel: NovelListItem): string {
  return novel.narrativeForm === "short_story"
    ? `/novels/${novel.id}/story`
    : `/novels/${novel.id}/preview`;
}

function coverStatusLabel(status?: ImageTaskStatus | null): string {
  if (status === "queued" || status === "running") return "封面生成中";
  if (status === "failed" || status === "cancelled") return "重新生成封面";
  return "生成封面";
}

export function NovelShelfCard(props: {
  novel: NovelListItem;
  onManageCover: (novelId: string) => void;
  onDownload: (input: { novelId: string; novelTitle: string }) => void;
  onDelete: (novelId: string, title: string) => void;
}) {
  const { novel } = props;
  const action = getPrimaryAction(novel);
  const progress = getProgress(novel);
  const coverStatus = novel.coverGeneration?.status && novel.coverGeneration.status !== "succeeded"
    ? novel.coverGeneration.status
    : null;
  const hasGeneratedCover = Boolean(novel.primaryCover?.url);
  const coverUrl = novel.primaryCover?.url
    ? resolveImageAssetUrl(novel.primaryCover.url)
    : defaultNovelCoverUrl;

  return (
    <Card className="group overflow-hidden rounded-lg border-border/70 bg-background transition hover:border-primary/35 hover:shadow-sm">
      <CardContent className="flex h-full flex-col p-3">
        <Link to={getPreviewHref(novel)} className="block" aria-label={`预览《${novel.title}》`}>
          <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-muted/50">
            <img
              src={coverUrl}
              alt={hasGeneratedCover ? `${novel.title}封面` : ""}
              className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
              loading="lazy"
            />
            {!hasGeneratedCover ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 px-5 text-center text-white">
                <div className="text-xs tracking-[0.18em] text-white/75">MY NOVEL</div>
                <div className="mt-4 line-clamp-4 text-lg font-semibold leading-7 drop-shadow">{novel.title}</div>
                <div className="mt-5 text-xs text-white/75">{getFormLabel(novel)}</div>
              </div>
            ) : null}
            {coverStatus ? (
              <span className="absolute left-2 top-2 rounded bg-black/65 px-2 py-1 text-[11px] text-white">
                {coverStatusLabel(coverStatus)}
              </span>
            ) : null}
          </div>
        </Link>

        <div className="flex min-h-0 flex-1 flex-col pt-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link to={action.href} className="line-clamp-1 text-base font-semibold hover:text-primary">
                {novel.title}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>{getFormLabel(novel)}</span>
                {novel.writingPlatform ? <span>{novel.writingPlatform}</span> : null}
                <span>{novel.status === "published" ? "已发布" : "草稿"}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{progress > 0 ? `创作进度 ${progress}%` : "尚未开始正文"}</span>
              <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{formatDate(novel.updatedAt)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
            <Button asChild size="sm" className="flex-1">
              <Link to={action.href}><BookOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />{action.label}</Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              title={coverStatusLabel(coverStatus)}
              aria-label={coverStatusLabel(coverStatus)}
              onClick={() => props.onManageCover(novel.id)}
            >
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              title="导出作品"
              aria-label="导出作品"
              onClick={() => props.onDownload({ novelId: novel.id, novelTitle: novel.title })}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              title="删除作品"
              aria-label="删除作品"
              onClick={() => props.onDelete(novel.id, novel.title)}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function NovelContinueCard(props: {
  novel: NovelListItem;
  onManageCover: (novelId: string) => void;
}) {
  const { novel } = props;
  const action = getPrimaryAction(novel);
  const progress = getProgress(novel);
  const hasGeneratedCover = Boolean(novel.primaryCover?.url);
  const coverUrl = novel.primaryCover?.url
    ? resolveImageAssetUrl(novel.primaryCover.url)
    : defaultNovelCoverUrl;

  return (
    <Card className="rounded-lg border-border/70 bg-background">
      <CardContent className="flex min-h-[132px] items-center gap-3 p-3">
        <Link to={getPreviewHref(novel)} className="relative h-[108px] w-[72px] shrink-0 overflow-hidden rounded bg-muted" aria-label={`预览《${novel.title}》`}>
          <img src={coverUrl} alt={hasGeneratedCover ? `${novel.title}封面` : ""} className="h-full w-full object-cover" loading="lazy" />
          {!hasGeneratedCover ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45 px-2 text-center text-[11px] font-medium leading-4 text-white">
              <span className="line-clamp-4 drop-shadow">{novel.title}</span>
            </div>
          ) : null}
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={action.href} className="line-clamp-1 text-sm font-semibold hover:text-primary">{novel.title}</Link>
          <div className="mt-1 text-xs text-muted-foreground">{getFormLabel(novel)} · {progress}%</div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button asChild size="sm" className="h-8 flex-1 px-2 text-xs">
              <Link to={action.href}>{action.label}</Link>
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8 w-8 p-0" title="管理封面" aria-label="管理封面" onClick={() => props.onManageCover(novel.id)}>
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
