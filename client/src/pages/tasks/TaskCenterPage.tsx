import { useNavigate, useSearchParams } from "react-router-dom";
import type { TaskKind } from "@ai-novel/shared/types/task";
import { useLLMStore } from "@/store/llmStore";
import {
  TaskCenterDetailPane,
  TaskCenterFilters,
  TaskCenterSummaryCards,
  TaskCenterTaskList,
} from "./taskCenterPage.components";
import { useTaskCenterList } from "./hooks/useTaskCenterList";
import { useTaskCenterMutations } from "./hooks/useTaskCenterMutations";
import { useTaskCenterSelection } from "./hooks/useTaskCenterSelection";

export default function TaskCenterPage() {
  const navigate = useNavigate();
  const llm = useLLMStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedKind = (searchParams.get("kind") as TaskKind | null) ?? null;
  const selectedId = searchParams.get("id");

  const list = useTaskCenterList({
    selectedKind,
    selectedId,
    setSearchParams,
  });

  const selection = useTaskCenterSelection({
    selectedKind,
    selectedId,
    llm: {
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    },
  });

  const mutations = useTaskCenterMutations({
    llmProvider: llm.provider,
    navigate,
    retryOverride: selection.retryOverride,
    selectedTask: selection.selectedTask,
    setSearchParams,
  });

  return (
    <div className="space-y-4">
      <TaskCenterSummaryCards
        runningCount={list.summary.runningCount}
        queuedCount={list.summary.queuedCount}
        failedCount={list.summary.failedCount}
        completed24hCount={list.summary.completed24hCount}
      />

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
        <TaskCenterFilters
          kind={list.kind}
          status={list.status}
          keyword={list.keyword}
          onlyAnomaly={list.onlyAnomaly}
          sortMode={list.sortMode}
          onKindChange={list.setKind}
          onStatusChange={list.setStatus}
          onKeywordChange={list.setKeyword}
          onOnlyAnomalyChange={list.setOnlyAnomaly}
          onSortModeChange={list.setSortMode}
        />

        <TaskCenterTaskList
          visibleRows={list.visibleRows}
          selectedKind={selectedKind}
          selectedId={selectedId}
          onSelectTask={list.selectTask}
        />

        <TaskCenterDetailPane
          selectedTask={selection.selection.selectedTask}
          selectedTaskSteps={selection.selection.selectedTaskSteps}
          selectedTaskMeta={selection.selection.selectedTaskMeta}
          isAutoDirectorTask={selection.selection.isAutoDirectorTask}
          isActiveAutoDirectorTask={selection.selection.isActiveAutoDirectorTask}
          canResumeFront10AutoExecution={selection.selection.canResumeFront10AutoExecution}
          needsCandidateSelection={selection.selection.needsCandidateSelection}
          selectedTaskNotice={selection.selection.selectedTaskNotice}
          selectedTaskNoticeRoute={selection.selection.selectedTaskNoticeRoute}
          selectedTaskChapterTitleWarning={selection.selection.selectedTaskChapterTitleWarning}
          selectedTaskFailureRepairRoute={selection.selection.selectedTaskFailureRepairRoute}
          selectedTaskHasChapterTitleFailure={selection.selection.selectedTaskHasChapterTitleFailure}
          selectedAutoDirectorFollowUp={selection.selection.selectedAutoDirectorFollowUp}
          llmProvider={llm.provider}
          llmModel={llm.model}
          retryOverride={selection.retryOverride}
          canRetryWithSelectedModel={selection.selection.canRetryWithSelectedModel}
          retryPending={mutations.retryMutation.isPending}
          continuePending={mutations.continueWorkflowMutation.isPending}
          cancelPending={mutations.cancelMutation.isPending}
          archivePending={mutations.archiveMutation.isPending}
          chapterTitleRepairPending={mutations.chapterTitleRepairMutation.isPending}
          executeFollowUpPending={mutations.executeFollowUpActionMutation.isPending}
          onRetryOverrideChange={selection.setRetryOverride}
          onNavigate={navigate}
          onRepairChapterTitle={(task) => mutations.chapterTitleRepairMutation.startRepair(task)}
          onFollowUpAction={mutations.handleFollowUpAction}
          onRetryWithSelectedModel={(task) => mutations.retryMutation.mutate({
            kind: task.kind,
            id: task.id,
            llmOverride: {
              provider: selection.retryOverride.provider,
              model: selection.retryOverride.model,
              temperature: selection.retryOverride.temperature,
            },
            resume: true,
          })}
          onRetryTask={(task) => mutations.retryMutation.mutate({ kind: task.kind, id: task.id })}
          onContinueAutoExecution={(task) => mutations.continueWorkflowMutation.mutate({
            taskId: task.id,
            mode: "auto_execute_range",
          })}
          onContinueWorkflow={(task) => mutations.continueWorkflowMutation.mutate({ taskId: task.id })}
          onCancelTask={(task) => mutations.cancelMutation.mutate({ kind: task.kind, id: task.id })}
          onArchiveTask={(task) => mutations.archiveMutation.mutate({ kind: task.kind, id: task.id })}
        />
      </div>
    </div>
  );
}
