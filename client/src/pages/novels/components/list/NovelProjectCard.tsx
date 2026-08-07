import type { KeyboardEvent, MouseEvent } from "react";
import { Download, Eye, Gauge, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { DirectorContinuationMode } from "@ai-novel/shared/types/novelDirector";
import type { NovelAutoDirectorTaskSummary } from "@ai-novel/shared/types/novel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  canContinueChapterBatchAutoExecution,
  canContinueDirector,
  canEnterChapterExecution,
  getCandidateSelectionLink,
  getWorkflowBadge,
  requiresCandidateSelection,
} from "@/lib/novelWorkflowTaskUi";
import {
  buildWorkflowDisplay,
  formatProgressStatus,
  formatTokenCount,
  getPrimaryActionLabel,
  getProjectAssetRows,
  getNovelWorkflowTask,
  type NovelListItem,
} from "./novelListViewModel";
import {
  toneTextClass,
} from "./novelListTone";

export function NovelProjectCard(props: {
  novel: NovelListItem;
  continuePendingTaskId?: string | null;
  downloadPendingNovelId?: string | null;
  deletePendingNovelId?: string | null;
  onOpenNovel: (novelId: string) => void;
  onOpenCockpit: (novelId: string) => void;
  onContinueWorkflow: (input: { taskId: string; mode?: DirectorContinuationMode }) => void;
  onDownload: (input: { novelId: string; novelTitle: string }) => void;
  onDelete: (novelId: string, title: string) => void;
}) {
  const task = getNovelWorkflowTask(props.novel);
  const workflow = buildWorkflowDisplay(props.novel);
  const workflowBadge = getWorkflowBadge(task);
  const primaryLabel = getPrimaryActionLabel(props.novel);
  const progressToneClass = workflow.tone === "danger"
    ? "bg-destructive"
    : workflow.tone === "warning"
      ? "bg-amber-600"
      : workflow.tone === "success"
        ? "bg-emerald-600"
        : workflow.tone === "info"
          ? "bg-sky-600"
          : "bg-primary";
  const progressBorderClass = workflow.tone === "danger"
    ? "border-destructive"
    : workflow.tone === "warning"
      ? "border-amber-600"
      : workflow.tone === "success"
        ? "border-emerald-600"
        : workflow.tone === "info"
          ? "border-sky-600"
          : "border-primary";
  const isWorkflowPending = props.continuePendingTaskId === task?.id;
  const isDownloadPending = props.downloadPendingNovelId === props.novel.id;
  const isDeletePending = props.deletePendingNovelId === props.novel.id;

  const stopCardClick = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      props.onOpenNovel(props.novel.id);
    }
  };

  return (
    <Card
      role="link"
      tabIndex={0}
      className="group h-full cursor-pointer overflow-hidden rounded-xl border-border/60 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
      onClick={() => props.onOpenNovel(props.novel.id)}
      onKeyDown={handleKeyDown}
    >
      <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <div className="line-clamp-1 text-lg font-semibold tracking-normal transition group-hover:text-primary">
              {props.novel.title}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{props.novel.status === "published" ? "已发布" : "草稿"}</span>
              <span>{props.novel.narrativeForm === "short_story" ? "短篇" : (props.novel.writingMode === "continuation" ? "续写" : "长篇原创")}</span>
              {workflowBadge ? (
                <span className={toneTextClass(workflow.tone)}>{workflowBadge.label}</span>
              ) : null}
            </div>
          </div>
        </div>

        <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
          {props.novel.description || "暂无简介"}
        </p>

        <div className={cn("border-l-2 py-0.5 pl-3", progressBorderClass)}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className={cn("text-sm font-medium", toneTextClass(workflow.tone))}>{workflow.label}</div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {workflow.currentStage}{workflow.currentAction ? ` · ${workflow.currentAction}` : ""}
              </div>
            </div>
            <div className="shrink-0 text-xs font-medium tabular-nums text-foreground">{workflow.progress}%</div>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-border/70">
            <div className={cn("h-full rounded-full transition-[width] duration-500", progressToneClass)} style={{ width: `${workflow.progress}%` }} />
          </div>
          <div className="mt-2 h-10 overflow-hidden opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
            <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
              {workflow.description}{workflow.lastHealthyStage ? ` 最近完成：${workflow.lastHealthyStage}` : ""}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border/55 pt-3 sm:grid-cols-4">
          {getProjectAssetRows(props.novel).map((item) => (
            <div key={item.label} className="min-w-0">
              <div className="text-xs text-muted-foreground">{item.label}</div>
              <div className={cn("mt-1 truncate text-sm font-medium", item.tone ? toneTextClass(item.tone) : "text-foreground")}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div className="h-5 overflow-hidden opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
          <div className="flex flex-nowrap gap-x-4 overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
            <span>项目：{formatProgressStatus(props.novel.projectStatus)}</span>
            <span>主线：{formatProgressStatus(props.novel.storylineStatus)}</span>
            <span>大纲：{formatProgressStatus(props.novel.outlineStatus)}</span>
            <span>Token：{formatTokenCount(props.novel.tokenUsage?.totalTokens)}</span>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border/55 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {renderPrimaryAction({
              novel: props.novel,
              task,
              label: primaryLabel,
              pending: isWorkflowPending,
              onContinueWorkflow: props.onContinueWorkflow,
              onStopCardClick: stopCardClick,
            })}
            {props.novel.narrativeForm !== "short_story" ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 w-8 px-0 opacity-70 transition group-hover:opacity-100 focus-visible:opacity-100"
                onClick={(event) => {
                  stopCardClick(event);
                  props.onOpenCockpit(props.novel.id);
                }}
                title="打开 AI 驾驶舱"
                aria-label="打开 AI 驾驶舱"
              >
                <Gauge className="h-4 w-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-1 opacity-70 transition group-hover:opacity-100 focus-within:opacity-100">
            {task && props.novel.narrativeForm !== "short_story" ? (
              <Button asChild size="sm" variant="ghost" className="h-8 w-8 px-0" title="查看执行详情" aria-label="查看执行详情">
                <Link to={`/novels/${props.novel.id}/edit?directorTaskId=${task.id}&taskPanel=1`} onClick={stopCardClick}>
                  <Gauge className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
            {props.novel.narrativeForm !== "short_story" ? (
              <Button asChild size="sm" variant="ghost" className="h-8 w-8 px-0" title="阅读预览" aria-label="阅读预览">
                <Link to={`/novels/${props.novel.id}/preview`} onClick={stopCardClick}>
                  <Eye className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 px-0"
              onClick={(event) => {
                stopCardClick(event);
                props.onDownload({
                  novelId: props.novel.id,
                  novelTitle: props.novel.title,
                });
              }}
              disabled={isDownloadPending}
              title={isDownloadPending ? "正在导出" : "导出作品"}
              aria-label={isDownloadPending ? "正在导出" : "导出作品"}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 px-0 text-muted-foreground hover:text-destructive"
              onClick={(event) => {
                stopCardClick(event);
                props.onDelete(props.novel.id, props.novel.title);
              }}
              disabled={isDeletePending}
              title={isDeletePending ? "正在删除" : "删除作品"}
              aria-label={isDeletePending ? "正在删除" : "删除作品"}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function renderPrimaryAction(input: {
  novel: NovelListItem;
  task: NovelAutoDirectorTaskSummary | null;
  label: string;
  pending: boolean;
  onContinueWorkflow: (input: { taskId: string; mode?: DirectorContinuationMode }) => void;
  onStopCardClick: (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void;
}) {
  if (input.novel.narrativeForm === "short_story") {
    return (
      <Button asChild size="sm">
        <Link to={`/novels/${input.novel.id}/story`} onClick={input.onStopCardClick}>
          打开作品
        </Link>
      </Button>
    );
  }
  if (canContinueChapterBatchAutoExecution(input.task)) {
    return (
      <Button
        size="sm"
        onClick={(event) => {
          input.onStopCardClick(event);
          if (!input.task) {
            return;
          }
          input.onContinueWorkflow({
            taskId: input.task.id,
            mode: "auto_execute_range",
          });
        }}
        disabled={input.pending}
      >
        {input.pending ? "继续执行中..." : input.label}
      </Button>
    );
  }
  if (canContinueDirector(input.task)) {
    return (
      <Button
        size="sm"
        onClick={(event) => {
          input.onStopCardClick(event);
          if (!input.task) {
            return;
          }
          input.onContinueWorkflow({ taskId: input.task.id });
        }}
        disabled={input.pending}
      >
        {input.pending ? "继续中..." : input.label}
      </Button>
    );
  }
  if (requiresCandidateSelection(input.task)) {
    return (
      <Button asChild size="sm">
        <Link to={getCandidateSelectionLink(input.task!.id)} onClick={input.onStopCardClick}>
          {input.label}
        </Link>
      </Button>
    );
  }
  if (canEnterChapterExecution(input.task)) {
    return (
      <Button asChild size="sm">
        <Link to={`/novels/${input.novel.id}/edit`} onClick={input.onStopCardClick}>
          {input.label}
        </Link>
      </Button>
    );
  }
  if (input.task) {
    return (
      <Button asChild size="sm">
        <Link to={`/novels/${input.novel.id}/edit?directorTaskId=${input.task.id}`} onClick={input.onStopCardClick}>
          {input.label}
        </Link>
      </Button>
    );
  }
  return (
    <Button asChild size="sm">
      <Link to={`/novels/${input.novel.id}/edit`} onClick={input.onStopCardClick}>
        {input.label}
      </Link>
    </Button>
  );
}
