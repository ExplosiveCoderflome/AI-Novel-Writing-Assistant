import type { AutoDirectorAction, AutoDirectorFollowUpDetail } from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { TaskKind, TaskStatus, UnifiedTaskDetail, UnifiedTaskSummary, UnifiedTaskStep } from "@ai-novel/shared/types/task";
import type { NovelWorkflowMilestone } from "@ai-novel/shared/types/novelWorkflow";
import { Link } from "react-router-dom";
import { getCandidateSelectionLink } from "@/lib/novelWorkflowTaskUi";
import LLMSelector, { type LLMSelectorValue } from "@/components/common/LLMSelector";
import { LlmInvocationDiagnosticCard } from "@/components/common/LlmInvocationDiagnosticCard";
import DirectorExecutionLogTimeline from "@/components/workflow/DirectorExecutionLogTimeline";
import OpenInCreativeHubButton from "@/components/creativeHub/OpenInCreativeHubButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ARCHIVABLE_STATUSES,
  formatCheckpoint,
  formatDate,
  formatFollowUpPriority,
  formatKind,
  formatResumeTarget,
  formatStatus,
  formatTokenCount,
  followUpActionVariant,
  toStatusVariant,
  type TaskSortMode,
} from "./taskCenterPage.shared";

export function TaskCenterSummaryCards(props: {
  runningCount: number;
  queuedCount: number;
  failedCount: number;
  completed24hCount: number;
}) {
  return (
    <div className="task-status-summary-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">运行中</CardTitle></CardHeader>
        <CardContent><div className="text-2xl font-semibold">{props.runningCount}</div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">排队中</CardTitle></CardHeader>
        <CardContent><div className="text-2xl font-semibold">{props.queuedCount}</div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">失败</CardTitle></CardHeader>
        <CardContent><div className="text-2xl font-semibold">{props.failedCount}</div></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">24h 完成</CardTitle></CardHeader>
        <CardContent><div className="text-2xl font-semibold">{props.completed24hCount}</div></CardContent>
      </Card>
    </div>
  );
}

export function TaskCenterFilters(props: {
  kind: TaskKind | "";
  status: TaskStatus | "";
  keyword: string;
  onlyAnomaly: boolean;
  sortMode: TaskSortMode;
  onKindChange: (value: TaskKind | "") => void;
  onStatusChange: (value: TaskStatus | "") => void;
  onKeywordChange: (value: string) => void;
  onOnlyAnomalyChange: (value: boolean) => void;
  onSortModeChange: (value: TaskSortMode) => void;
}) {
  return (
    <Card className="task-filter-card">
      <CardHeader className="task-filter-header">
        <CardTitle className="text-base">筛选</CardTitle>
      </CardHeader>
      <CardContent className="task-filter-controls grid min-w-0 grid-cols-3 gap-2 xl:grid-cols-1">
        <select className="task-filter-kind col-start-1 row-start-1 w-full rounded-md border bg-background px-2 py-2 text-sm xl:col-auto xl:row-auto" value={props.kind} onChange={(event) => props.onKindChange(event.target.value as TaskKind | "")}>
          <option value="">全部类型</option>
          <option value="book_analysis">拆书分析</option>
          <option value="novel_workflow">小说创作</option>
          <option value="novel_pipeline">小说流水线</option>
          <option value="knowledge_document">知识库索引</option>
          <option value="image_generation">图片生成</option>
          <option value="style_extraction">写法提取</option>
          <option value="agent_run">Agent 运行</option>
        </select>
        <select className="task-filter-status col-start-2 row-start-1 w-full rounded-md border bg-background px-2 py-2 text-sm xl:col-auto xl:row-auto" value={props.status} onChange={(event) => props.onStatusChange(event.target.value as TaskStatus | "")}>
          <option value="">全部状态</option>
          <option value="queued">排队中</option>
          <option value="running">运行中</option>
          <option value="waiting_approval">等待审批</option>
          <option value="failed">失败</option>
          <option value="cancelled">已取消</option>
          <option value="succeeded">已完成</option>
        </select>
        <label className="task-filter-pill col-start-3 row-start-1 flex items-center gap-1.5 rounded-md border bg-muted/30 px-1.5 py-2 text-xs text-muted-foreground sm:gap-2 sm:px-2 sm:text-sm xl:col-auto xl:row-auto">
          <input type="checkbox" checked={props.onlyAnomaly} onChange={(event) => props.onOnlyAnomalyChange(event.target.checked)} />
          仅看异常
        </label>
        <Input className="task-filter-keyword col-span-2 col-start-1 row-start-2 h-10 px-2 xl:col-auto xl:row-auto" value={props.keyword} onChange={(event) => props.onKeywordChange(event.target.value)} placeholder="标题或关联对象" />
        <select className="task-filter-sort col-start-3 row-start-2 w-full rounded-md border bg-background px-2 py-2 text-sm xl:col-auto xl:row-auto" value={props.sortMode} onChange={(event) => props.onSortModeChange(event.target.value as TaskSortMode)}>
          <option value="updated_desc">按更新时间排序：最新优先</option>
          <option value="updated_asc">按更新时间排序：最早优先</option>
          <option value="heartbeat_desc">按最近心跳排序：最新优先</option>
          <option value="heartbeat_asc">按最近心跳排序：最早优先</option>
          <option value="default">默认排序：失败优先</option>
        </select>
      </CardContent>
    </Card>
  );
}

export function TaskCenterTaskList(props: {
  visibleRows: UnifiedTaskSummary[];
  selectedKind: TaskKind | null;
  selectedId: string | null;
  onSelectTask: (task: UnifiedTaskSummary) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">任务列表</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.visibleRows.map((task) => {
          const isSelected = task.kind === props.selectedKind && task.id === props.selectedId;
          return (
            <button key={`${task.kind}:${task.id}`} type="button" className={`w-full rounded-md border p-3 text-left transition-colors ${isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`} onClick={() => props.onSelectTask(task)}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{task.title}</div>
                <Badge variant={toStatusVariant(task.status)}>{formatStatus(task.status)}</Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">{formatKind(task.kind)} | 进度 {Math.round(task.progress * 100)}%</div>
              <div className="mt-1 text-xs text-muted-foreground">阶段：{task.currentStage ?? "暂无"} | 当前项：{task.currentItemLabel ?? "暂无"}</div>
              {task.displayStatus || task.lastHealthyStage ? <div className="mt-1 text-xs text-muted-foreground">状态：{task.displayStatus ?? formatStatus(task.status)} | 最近健康阶段：{task.lastHealthyStage ?? "暂无"}</div> : null}
              {task.kind === "novel_workflow" ? <div className="mt-1 text-xs text-muted-foreground">检查点：{formatCheckpoint(task.checkpointType, task.executionScopeLabel)} | 建议继续：{task.resumeAction ?? task.nextActionLabel ?? "继续主流程"}</div> : null}
              {task.blockingReason ? <div className="mt-1 text-xs text-muted-foreground line-clamp-2">原因：{task.blockingReason}</div> : null}
              <div className="mt-1 text-xs text-muted-foreground">最近心跳：{formatDate(task.heartbeatAt)} | 更新时间：{formatDate(task.updatedAt)}</div>
            </button>
          );
        })}
        {props.visibleRows.length === 0 ? <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">当前没有符合条件的任务。</div> : null}
      </CardContent>
    </Card>
  );
}

export function TaskCenterDetailPane(props: {
  selectedTask?: UnifiedTaskDetail | null;
  selectedTaskSteps: UnifiedTaskStep[];
  selectedTaskMeta: Record<string, unknown>;
  isAutoDirectorTask: boolean;
  isActiveAutoDirectorTask: boolean;
  canResumeFront10AutoExecution: boolean;
  needsCandidateSelection: boolean;
  selectedTaskNotice?: { action?: { label?: string | null } | null } | null;
  selectedTaskNoticeRoute: string | null;
  selectedTaskChapterTitleWarning?: { label?: string | null } | null;
  selectedTaskFailureRepairRoute: string | null;
  selectedTaskHasChapterTitleFailure: boolean;
  selectedAutoDirectorFollowUp: AutoDirectorFollowUpDetail | null;
  llmProvider: string;
  llmModel: string;
  retryOverride: LLMSelectorValue;
  canRetryWithSelectedModel: boolean;
  retryPending: boolean;
  continuePending: boolean;
  cancelPending: boolean;
  archivePending: boolean;
  chapterTitleRepairPending: boolean;
  executeFollowUpPending: boolean;
  onRetryOverrideChange: (value: LLMSelectorValue) => void;
  onNavigate: (target: string) => void;
  onRepairChapterTitle: (task: UnifiedTaskDetail) => void;
  onFollowUpAction: (action: AutoDirectorAction) => void;
  onRetryWithSelectedModel: (task: UnifiedTaskDetail) => void;
  onRetryTask: (task: UnifiedTaskDetail) => void;
  onContinueAutoExecution: (task: UnifiedTaskDetail) => void;
  onContinueWorkflow: (task: UnifiedTaskDetail) => void;
  onCancelTask: (task: UnifiedTaskDetail) => void;
  onArchiveTask: (task: UnifiedTaskDetail) => void;
}) {
  const selectedTask = props.selectedTask;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">任务详情</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {selectedTask ? (
          <>
            <div className="space-y-1">
              <div className="font-medium">{selectedTask.title}</div>
              <div className="text-xs text-muted-foreground">{formatKind(selectedTask.kind)} | 归属：{selectedTask.ownerLabel}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={toStatusVariant(selectedTask.status)}>{formatStatus(selectedTask.status)}</Badge>
              <Badge variant="outline">进度 {Math.round(selectedTask.progress * 100)}%</Badge>
            </div>
            <div className="space-y-1 text-muted-foreground">
              <div>展示状态：{selectedTask.displayStatus ?? formatStatus(selectedTask.status)}</div>
              <div>当前阶段：{selectedTask.currentStage ?? "暂无"}</div>
              <div>当前项：{selectedTask.currentItemLabel ?? "暂无"}</div>
              {selectedTask.kind === "novel_workflow" ? (
                <>
                  <div>最近检查点：{formatCheckpoint(selectedTask.checkpointType, selectedTask.executionScopeLabel)}</div>
                  <div>恢复目标页：{formatResumeTarget(selectedTask.resumeTarget)}</div>
                  <div>建议继续：{selectedTask.resumeAction ?? selectedTask.nextActionLabel ?? "继续小说主流程"}</div>
                  <div>最近健康阶段：{selectedTask.lastHealthyStage ?? "暂无"}</div>
                </>
              ) : null}
              {selectedTask.blockingReason ? <div>阻塞原因：{selectedTask.blockingReason}</div> : null}
              <div>最近心跳：{formatDate(selectedTask.heartbeatAt)}</div>
              <div>开始时间：{formatDate(selectedTask.startedAt)}</div>
              <div>结束时间：{formatDate(selectedTask.finishedAt)}</div>
              <div>重试计数：{selectedTask.retryCountLabel}</div>
              {(selectedTask.provider || selectedTask.model) ? <div>调用模型：{selectedTask.provider ?? "暂无"} / {selectedTask.model ?? "暂无"}</div> : null}
              {props.isAutoDirectorTask ? <div>当前界面模型：{props.llmProvider} / {props.llmModel}</div> : null}
              {(selectedTask.tokenUsage || selectedTask.provider || selectedTask.model) ? (
                <>
                  <div>累计调用：{formatTokenCount(selectedTask.tokenUsage?.llmCallCount ?? 0)}</div>
                  <div>输入 Tokens：{formatTokenCount(selectedTask.tokenUsage?.promptTokens ?? 0)}</div>
                  <div>输出 Tokens：{formatTokenCount(selectedTask.tokenUsage?.completionTokens ?? 0)}</div>
                  <div>累计总 Tokens：{formatTokenCount(selectedTask.tokenUsage?.totalTokens ?? 0)}</div>
                  <div>最近记录：{formatDate(selectedTask.tokenUsage?.lastRecordedAt)}</div>
                </>
              ) : null}
            </div>
            <LlmInvocationDiagnosticCard diagnostic={selectedTask.recentLlmDiagnostic} className="rounded-md" />
            {props.isAutoDirectorTask ? (
              <DirectorExecutionLogTimeline
                taskId={selectedTask.id}
                isRunning={selectedTask.status === "running"}
                defaultExpanded={false}
                maxVisible={15}
                className="mt-2"
              />
            ) : null}
            {selectedTask.noticeCode || selectedTask.noticeSummary ? (
              <div className="rounded-md border border-amber-300/50 bg-amber-50/70 p-2 text-amber-900">
                <div className="font-medium">{props.selectedTaskChapterTitleWarning ? "当前提醒" : (selectedTask.noticeCode ?? "结果提醒")}</div>
                {selectedTask.noticeSummary ? <div className="mt-1 text-sm">{selectedTask.noticeSummary}</div> : null}
                {props.selectedTaskChapterTitleWarning || props.selectedTaskNoticeRoute ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => {
                      if (props.selectedTaskChapterTitleWarning) {
                        props.onRepairChapterTitle(selectedTask);
                        return;
                      }
                      if (props.selectedTaskNoticeRoute) {
                        props.onNavigate(props.selectedTaskNoticeRoute);
                      }
                    }} disabled={props.chapterTitleRepairPending}>
                      {props.selectedTaskChapterTitleWarning?.label ?? props.selectedTaskNotice?.action?.label ?? "打开当前卷拆章"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {selectedTask.failureCode || selectedTask.failureSummary ? (
              <div className="rounded-md border border-amber-300/50 bg-amber-50/70 p-2 text-amber-900">
                <div className="font-medium">{props.selectedTaskHasChapterTitleFailure ? "当前提醒" : (selectedTask.failureCode ?? "任务异常")}</div>
                {selectedTask.failureSummary ? <div className="mt-1 text-sm">{selectedTask.failureSummary}</div> : null}
                {props.selectedTaskChapterTitleWarning || props.selectedTaskFailureRepairRoute ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => {
                      if (props.selectedTaskChapterTitleWarning) {
                        props.onRepairChapterTitle(selectedTask);
                        return;
                      }
                      if (props.selectedTaskFailureRepairRoute) {
                        props.onNavigate(props.selectedTaskFailureRepairRoute);
                      }
                    }} disabled={props.chapterTitleRepairPending}>
                      {props.selectedTaskChapterTitleWarning?.label ?? "快速修复章节标题"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {selectedTask.lastError && !props.selectedTaskHasChapterTitleFailure ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-destructive">{selectedTask.lastError}</div> : null}
            {selectedTask.kind === "novel_workflow" && selectedTask.checkpointSummary ? <div className="rounded-md border bg-muted/20 p-2 text-muted-foreground">{selectedTask.checkpointSummary}</div> : null}
            {props.selectedAutoDirectorFollowUp ? (
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium">当前待处理动作</div>
                  <Badge variant="outline">{props.selectedAutoDirectorFollowUp.reasonLabel}</Badge>
                  <Badge variant={props.selectedAutoDirectorFollowUp.priority === "P0" ? "destructive" : "secondary"}>{formatFollowUpPriority(props.selectedAutoDirectorFollowUp.priority)}</Badge>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">{props.selectedAutoDirectorFollowUp.followUpSummary}</div>
                {props.selectedAutoDirectorFollowUp.blockingReason ? <div className="mt-2 text-sm text-muted-foreground">阻塞原因：{props.selectedAutoDirectorFollowUp.blockingReason}</div> : null}
                {props.selectedAutoDirectorFollowUp.currentModel ? <div className="mt-2 text-sm text-muted-foreground">当前任务模型：{props.selectedAutoDirectorFollowUp.currentModel}</div> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {props.selectedAutoDirectorFollowUp.availableActions.map((action) => (
                    <Button key={action.code} size="sm" variant={followUpActionVariant(action)} onClick={() => props.onFollowUpAction(action)} disabled={props.executeFollowUpPending}>{action.label}</Button>
                  ))}
                </div>
              </div>
            ) : null}
            {(selectedTask.status === "failed" || selectedTask.status === "cancelled") && props.isAutoDirectorTask ? (
              <div className="rounded-md border bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">使用其他模型重试</div>
                <div className="mt-2 flex flex-col gap-2">
                  <LLMSelector value={props.retryOverride} onChange={props.onRetryOverrideChange} compact showBadge={false} showHelperText={false} />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => props.onRetryWithSelectedModel(selectedTask)} disabled={props.retryPending || !props.canRetryWithSelectedModel}>使用所选模型重试</Button>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {!props.selectedAutoDirectorFollowUp && props.needsCandidateSelection ? <Button size="sm" onClick={() => props.onNavigate(getCandidateSelectionLink(selectedTask.id))}>{selectedTask.resumeAction ?? "继续确认书级方向"}</Button> : null}
              {!props.selectedAutoDirectorFollowUp && props.canResumeFront10AutoExecution ? <Button size="sm" onClick={() => props.onContinueAutoExecution(selectedTask)} disabled={props.continuePending}>{selectedTask.resumeAction ?? `继续自动执行${selectedTask.executionScopeLabel ?? "当前章节范围"}`}</Button> : null}
              {!props.selectedAutoDirectorFollowUp && selectedTask.kind === "novel_workflow" && !props.needsCandidateSelection && !props.canResumeFront10AutoExecution && (selectedTask.status === "waiting_approval" || selectedTask.status === "queued" || selectedTask.status === "running") ? <Button size="sm" onClick={() => props.onContinueWorkflow(selectedTask)} disabled={props.continuePending}>{selectedTask.resumeAction ?? (props.isActiveAutoDirectorTask ? "查看进度" : "继续")}</Button> : null}
              {(selectedTask.status === "failed" || selectedTask.status === "cancelled") && (!props.isAutoDirectorTask || !props.selectedAutoDirectorFollowUp) ? <Button size="sm" variant={props.isAutoDirectorTask ? "outline" : "default"} onClick={() => props.onRetryTask(selectedTask)} disabled={props.retryPending}>{props.isAutoDirectorTask ? "按任务原模型重试" : "重试"}</Button> : null}
              {(selectedTask.status === "queued" || selectedTask.status === "running" || selectedTask.status === "waiting_approval") ? <Button size="sm" variant="outline" onClick={() => props.onCancelTask(selectedTask)} disabled={props.cancelPending}>取消</Button> : null}
              {ARCHIVABLE_STATUSES.has(selectedTask.status) ? <Button size="sm" variant="outline" onClick={() => props.onArchiveTask(selectedTask)} disabled={props.archivePending}>归档</Button> : null}
              <Button asChild size="sm" variant="outline"><Link to={selectedTask.sourceRoute}>打开来源页面</Link></Button>
              <OpenInCreativeHubButton bindings={{ taskId: selectedTask.id }} label="在创作中枢诊断" />
            </div>
            <div className="space-y-2">
              <div className="font-medium">步骤状态</div>
              {props.selectedTaskSteps.length === 0 ? <div className="rounded-md border border-dashed p-2 text-muted-foreground">暂无步骤状态。</div> : props.selectedTaskSteps.map((step) => <div key={step.key} className="flex items-center justify-between rounded-md border p-2"><div>{step.label}</div><Badge variant="outline">{step.status}</Badge></div>)}
            </div>
            {selectedTask.kind === "novel_workflow" && Array.isArray(props.selectedTaskMeta.milestones) && props.selectedTaskMeta.milestones.length > 0 ? (
              <div className="space-y-2">
                <div className="font-medium">里程碑历史</div>
                {(props.selectedTaskMeta.milestones as NovelWorkflowMilestone[]).map((item) => (
                  <div key={`${item.checkpointType}:${item.createdAt}`} className="rounded-md border p-2 text-muted-foreground">
                    <div className="font-medium text-foreground">{formatCheckpoint(item.checkpointType)}</div>
                    <div className="mt-1">{item.summary}</div>
                    <div className="mt-1 text-xs">记录时间：{formatDate(item.createdAt)}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="text-muted-foreground">请选择任务查看详情。</div>
        )}
      </CardContent>
    </Card>
  );
}
