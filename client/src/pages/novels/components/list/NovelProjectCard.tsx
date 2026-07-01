import type { KeyboardEvent, MouseEvent } from "react";
import { BookOpen, Gauge, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { DirectorContinuationMode } from "@ai-novel/shared/types/novelDirector";
import type { NovelAutoDirectorTaskSummary } from "@ai-novel/shared/types/novel";
import { Badge } from "@/components/ui/badge";
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
  toneBorderClass,
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
      className={cn(
        "group cursor-pointer overflow-hidden transition hover:border-primary/40 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-ring",
        toneBorderClass(workflow.tone),
      )}
      onClick={() => props.onOpenNovel(props.novel.id)}
      onKeyDown={handleKeyDown}
    >
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="line-clamp-1 text-xl font-semibold tracking-normal transition group-hover:text-primary">
              {props.novel.title}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={props.novel.status === "published" ? "default" : "secondary"}>
                {props.novel.status === "published" ? "已发布" : "草稿"}
              </Badge>
              <Badge variant="outline">{props.novel.writingMode === "continuation" ? "续写" : "原创"}</Badge>
              {workflowBadge ? (
                <Badge variant={workflowBadge.variant}>{workflowBadge.label}</Badge>
              ) : null}
            </div>
          </div>
        </div>

        <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
          {props.novel.description || "暂无简介"}
        </p>

        <div className={cn("rounded-lg border p-3", toneBorderClass(workflow.tone), toneSurfaceClass(workflow.tone))}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className={cn("text-sm font-medium", toneTextClass(workflow.tone))}>{workflow.label}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {workflow.currentStage}{workflow.currentAction ? ` · ${workflow.currentAction}` : ""}
              </div>
            </div>
            <Badge variant="outline">进度 {workflow.progress}%</Badge>
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{workflow.description}</p>
          {workflow.running ? (
            <NovelWorkflowRunningIndicator
              className="mt-3"
              progress={task?.progress ?? 0}
              label={workflow.currentAction || "AI 正在后台持续推进"}
            />
          ) : null}
          {workflow.lastHealthyStage ? (
            <div className="mt-2 text-xs text-muted-foreground">最近健康阶段：{workflow.lastHealthyStage}</div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {getProjectAssetRows(props.novel).map((item) => (
            <div key={item.label} className={cn("min-w-0 rounded-md border bg-muted/15 px-2.5 py-2", item.tone ? toneBorderClass(item.tone) : "")}>
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

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
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
            variant="outline"
            onClick={(event) => {
              stopCardClick(event);
              props.onOpenCockpit(props.novel.id);
            }}
          >
            <Gauge className="mr-1.5 h-4 w-4" aria-hidden="true" />
            AI 驾驶舱
          </Button>
          {task ? (
            <Button asChild size="sm" variant="outline">
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
