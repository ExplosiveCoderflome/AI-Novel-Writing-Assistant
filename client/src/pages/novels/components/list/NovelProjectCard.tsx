import type { KeyboardEvent, MouseEvent } from "react";
import { BookOpen, Gauge, Trash2 } from "lucide-react";
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
import NovelWorkflowRunningIndicator from "../NovelWorkflowRunningIndicator";
import {
  buildWorkflowDisplay,
  formatProgressStatus,
  formatTokenCount,
  getPrimaryActionLabel,
  getProjectAssetRows,
  type NovelListItem,
} from "./novelListViewModel";
import {
  toneSurfaceClass,
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
  const task = props.novel.latestAutoDirectorTask ?? null;
  const workflow = buildWorkflowDisplay(props.novel);
  const workflowBadge = getWorkflowBadge(task);
  const primaryLabel = getPrimaryActionLabel(props.novel);
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
      className="group h-full cursor-pointer overflow-hidden rounded-xl border-border/70 bg-background/90 transition hover:border-primary/35 hover:bg-muted/[0.08] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
      onClick={() => props.onOpenNovel(props.novel.id)}
      onKeyDown={handleKeyDown}
    >
      <CardContent className="flex h-full flex-col gap-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="line-clamp-1 text-xl font-semibold tracking-normal transition group-hover:text-primary">
              {props.novel.title}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{props.novel.status === "published" ? "已发布" : "草稿"}</span>
              <span>{props.novel.writingMode === "continuation" ? "续写" : "原创"}</span>
              {workflowBadge ? (
                <span className={toneTextClass(workflow.tone)}>{workflowBadge.label}</span>
              ) : null}
            </div>
          </div>
        </div>

        <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
          {props.novel.description || "暂无简介"}
        </p>

        <div className={cn("rounded-xl p-3", toneSurfaceClass(workflow.tone))}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className={cn("text-sm font-medium", toneTextClass(workflow.tone))}>{workflow.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {workflow.currentStage}{workflow.currentAction ? ` · ${workflow.currentAction}` : ""}
              </div>
            </div>
            <div className="text-xs font-medium tabular-nums text-foreground">进度 {workflow.progress}%</div>
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{workflow.description}</p>
          {workflow.running ? (
            <NovelWorkflowRunningIndicator
              className="mt-3"
              progress={task?.progress ?? 0}
              label={workflow.currentAction || "AI 正在后台持续推进"}
            />
          ) : (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-background/45 px-3 py-2 text-xs text-muted-foreground">
              <span className="line-clamp-1">
                {workflow.lastHealthyStage ? `最近健康阶段：${workflow.lastHealthyStage}` : "等待下一步操作"}
              </span>
              <span className="font-medium tabular-nums text-foreground">{workflow.progress}%</span>
            </div>
          )}
          {workflow.running && workflow.lastHealthyStage ? (
            <div className="mt-2 text-xs text-muted-foreground">最近健康阶段：{workflow.lastHealthyStage}</div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-border/55 py-3 sm:grid-cols-4">
          {getProjectAssetRows(props.novel).map((item) => (
            <div key={item.label} className="min-w-0">
              <div className="text-xs text-muted-foreground">{item.label}</div>
              <div className={cn("mt-1 truncate text-sm font-medium", item.tone ? toneTextClass(item.tone) : "text-foreground")}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>项目：{formatProgressStatus(props.novel.projectStatus)}</span>
          <span>主线：{formatProgressStatus(props.novel.storylineStatus)}</span>
          <span>大纲：{formatProgressStatus(props.novel.outlineStatus)}</span>
          <span>Token：{formatTokenCount(props.novel.tokenUsage?.totalTokens)}</span>
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {renderPrimaryAction({
              novel: props.novel,
              task,
              label: primaryLabel,
              pending: isWorkflowPending,
              onContinueWorkflow: props.onContinueWorkflow,
              onStopCardClick: stopCardClick,
            })}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={(event) => {
                stopCardClick(event);
                props.onOpenCockpit(props.novel.id);
              }}
            >
              <Gauge className="mr-1.5 h-4 w-4" aria-hidden="true" />
              AI 驾驶舱
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {task ? (
              <Button asChild size="sm" variant="ghost">
                <Link to={`/novels/${props.novel.id}/edit?directorTaskId=${task.id}&taskPanel=1`} onClick={stopCardClick}>
                  执行详情
                </Link>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="ghost">
              <Link to={`/novels/${props.novel.id}/preview`} onClick={stopCardClick}>
                <BookOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />
                预览
              </Link>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(event) => {
                stopCardClick(event);
                props.onDownload({
                  novelId: props.novel.id,
                  novelTitle: props.novel.title,
                });
              }}
              disabled={isDownloadPending}
            >
              {isDownloadPending ? "导出中..." : "导出"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={(event) => {
                stopCardClick(event);
                props.onDelete(props.novel.id, props.novel.title);
              }}
              disabled={isDeletePending}
            >
              <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {isDeletePending ? "删除中..." : "删除"}
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
