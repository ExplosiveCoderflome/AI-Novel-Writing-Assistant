import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AutoDirectorActionExecutionResult,
  AutoDirectorMutationActionCode,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { TaskKind, UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { continueNovelWorkflow } from "@/api/novelWorkflow";
import {
  archiveTask,
  cancelTask,
  executeAutoDirectorFollowUpAction,
  retryTask,
} from "@/api/tasks";
import { queryKeys } from "@/api/queryKeys";
import type { LLMSelectorValue } from "@/components/common/LLMSelector";
import { toast } from "@/components/ui/toast";
import { useDirectorChapterTitleRepair } from "@/hooks/useDirectorChapterTitleRepair";
import { resolveInternalNavigationTarget } from "@/lib/internalNavigation";
import { resolveWorkflowContinuationFeedback } from "@/lib/novelWorkflowContinuation";
import { syncKnownTaskCaches } from "@/lib/taskQueryCache";
import { createTaskCenterFollowUpActionHandler } from "../taskCenterPage.detail";

export function useTaskCenterMutations(input: {
  llmProvider: string;
  navigate: (target: string) => void;
  retryOverride: LLMSelectorValue;
  selectedTask: UnifiedTaskDetail | undefined;
  setSearchParams: React.Dispatch<React.SetStateAction<URLSearchParams>>;
}) {
  const queryClient = useQueryClient();
  const chapterTitleRepairMutation = useDirectorChapterTitleRepair();

  const invalidateTaskQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const retryMutation = useMutation({
    mutationFn: (payload: {
      kind: TaskKind;
      id: string;
      llmOverride?: {
        provider?: typeof input.llmProvider;
        model?: string;
        temperature?: number;
      };
      resume?: boolean;
    }) => retryTask(payload.kind, payload.id, {
      llmOverride: payload.llmOverride,
      resume: payload.resume,
    }),
    onSuccess: async (response, variables) => {
      const task = response.data;
      syncKnownTaskCaches(queryClient, task);
      await invalidateTaskQueries();
      if (task) {
        input.setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("kind", task.kind);
          next.set("id", task.id);
          return next;
        });
      }
      toast.success(
        variables.llmOverride
          ? `已切换到 ${variables.llmOverride.provider ?? "当前提供商"} / ${variables.llmOverride.model ?? "当前模型"} 并重试任务`
          : "任务已重新入队",
      );
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (payload: { kind: TaskKind; id: string }) => cancelTask(payload.kind, payload.id),
    onSuccess: async () => {
      await invalidateTaskQueries();
      toast.success("任务取消请求已提交");
    },
  });

  const continueWorkflowMutation = useMutation({
    mutationFn: (payload: { taskId: string; mode?: "auto_execute_range" }) => continueNovelWorkflow(
      payload.taskId,
      payload.mode ? { continuationMode: payload.mode } : undefined,
    ),
    onSuccess: async (response, variables) => {
      await invalidateTaskQueries();
      const task = response.data;
      const feedback = resolveWorkflowContinuationFeedback(task, {
        mode: variables.mode,
      });
      if (feedback.tone === "error") {
        toast.error(feedback.message);
        return;
      }
      if (variables.mode === "auto_execute_range") {
        toast.success(feedback.message);
        return;
      }
      if (task?.kind && task.id) {
        input.setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("kind", task.kind);
          next.set("id", task.id);
          return next;
        });
        input.navigate(task.sourceRoute);
        return;
      }
      toast.success(feedback.message);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (payload: { kind: TaskKind; id: string }) => archiveTask(payload.kind, payload.id),
    onSuccess: async (_, payload) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.tasks.detail(payload.kind, payload.id),
      });
      input.setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("kind");
        next.delete("id");
        return next;
      });
      await invalidateTaskQueries();
      toast.success("任务已归档并从任务中心隐藏");
    },
  });

  const executeFollowUpActionMutation = useMutation({
    mutationFn: (payload: {
      taskId: string;
      actionCode: AutoDirectorMutationActionCode;
      idempotencyKey: string;
    }) =>
      executeAutoDirectorFollowUpAction(payload.taskId, {
        actionCode: payload.actionCode,
        idempotencyKey: payload.idempotencyKey,
      }),
    onSuccess: async (response, variables) => {
      const result = response.data as AutoDirectorActionExecutionResult | null;
      if (result?.task) {
        syncKnownTaskCaches(queryClient, result.task);
      }
      await Promise.all([
        invalidateTaskQueries(),
        queryClient.invalidateQueries({
          queryKey: queryKeys.tasks.autoDirectorFollowUpDetail(result?.taskId ?? variables.taskId),
        }),
      ]);
      if (result?.code === "failed" || result?.code === "forbidden") {
        toast.error(result.message);
        return;
      }
      toast.success(result?.message ?? "操作已执行");
    },
  });

  const handleFollowUpAction = createTaskCenterFollowUpActionHandler({
    selectedTask: input.selectedTask,
    navigate: input.navigate,
    resolveInternalNavigationTarget,
    executeFollowUpAction: (payload) => {
      executeFollowUpActionMutation.mutate({
        taskId: payload.taskId,
        actionCode: payload.actionCode,
        idempotencyKey: payload.idempotencyKey,
      });
    },
  });

  return {
    retryMutation,
    cancelMutation,
    continueWorkflowMutation,
    archiveMutation,
    executeFollowUpActionMutation,
    chapterTitleRepairMutation,
    handleFollowUpAction,
  };
}
