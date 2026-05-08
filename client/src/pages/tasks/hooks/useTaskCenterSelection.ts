import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TaskKind, TaskStatus } from "@ai-novel/shared/types/task";
import { getAutoDirectorFollowUpDetail, getTaskDetail } from "@/api/tasks";
import { queryKeys } from "@/api/queryKeys";
import type { LLMSelectorValue } from "@/components/common/LLMSelector";
import { buildTaskCenterSelectionState } from "../taskCenterPage.detail";
import { ACTIVE_STATUSES } from "../taskCenterPage.shared";

export function useTaskCenterSelection(input: {
  selectedKind: TaskKind | null;
  selectedId: string | null;
  llm: LLMSelectorValue;
}) {
  const [retryOverride, setRetryOverride] = useState<LLMSelectorValue>({
    provider: input.llm.provider,
    model: input.llm.model,
    temperature: input.llm.temperature,
  });

  const detailQuery = useQuery({
    queryKey: queryKeys.tasks.detail(input.selectedKind ?? "none", input.selectedId ?? "none"),
    queryFn: () => getTaskDetail(input.selectedKind as TaskKind, input.selectedId as string),
    enabled: Boolean(input.selectedKind && input.selectedId),
    retry: false,
    refetchInterval: (query) => {
      const task = query.state.data?.data;
      return task && ACTIVE_STATUSES.has(task.status) ? 4000 : false;
    },
  });

  const selectedTask = detailQuery.data?.data ?? undefined;

  useEffect(() => {
    setRetryOverride({
      provider: input.llm.provider,
      model: input.llm.model,
      temperature: input.llm.temperature,
    });
  }, [input.llm.model, input.llm.provider, input.llm.temperature, selectedTask?.id]);

  const selectionWithoutFollowUp = buildTaskCenterSelectionState({
    selectedTask,
    retryOverride,
    selectedAutoDirectorFollowUp: null,
  });

  const autoDirectorFollowUpQuery = useQuery({
    queryKey: queryKeys.tasks.autoDirectorFollowUpDetail(input.selectedId ?? "none"),
    queryFn: () => getAutoDirectorFollowUpDetail(input.selectedId as string),
    enabled: Boolean(input.selectedId && selectionWithoutFollowUp.isAutoDirectorTask),
    retry: false,
    refetchInterval: (query) => {
      const followUp = query.state.data?.data;
      return followUp?.task && ACTIVE_STATUSES.has(followUp.task.status as TaskStatus) ? 4000 : false;
    },
  });

  const selection = buildTaskCenterSelectionState({
    selectedTask,
    retryOverride,
    selectedAutoDirectorFollowUp: autoDirectorFollowUpQuery.data?.data ?? null,
  });

  return {
    selectedTask,
    retryOverride,
    setRetryOverride,
    selection,
  };
}
