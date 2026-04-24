import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AutoDirectorAction,
  AutoDirectorFollowUpItem,
  AutoDirectorFollowUpReason,
  AutoDirectorChannelType,
  AutoDirectorMutationActionCode,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import {
  AUTO_DIRECTOR_CHANNEL_TYPES,
  AUTO_DIRECTOR_FOLLOW_UP_REASONS,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { TaskStatus } from "@ai-novel/shared/types/task";
import { useSearchParams } from "react-router-dom";
import {
  executeAutoDirectorFollowUpAction,
  executeAutoDirectorFollowUpBatchAction,
  getAutoDirectorFollowUpDetail,
  getAutoDirectorFollowUpOverview,
  listAutoDirectorFollowUps,
} from "@/api/autoDirectorFollowUps";
import { queryKeys } from "@/api/queryKeys";
import { AutoDirectorFollowUpBatchBar } from "./components/AutoDirectorFollowUpBatchBar";
import { AutoDirectorFollowUpDetailPanel } from "./components/AutoDirectorFollowUpDetail";
import { AutoDirectorFollowUpListPanel } from "./components/AutoDirectorFollowUpList";
import { AutoDirectorFollowUpOverviewCards } from "./components/AutoDirectorFollowUpOverview";
import { reconcileSelectedTaskIds } from "./selectionState";
import { toast } from "@/components/ui/toast";

const TASK_STATUSES: readonly TaskStatus[] = [
  "queued",
  "running",
  "waiting_approval",
  "succeeded",
  "failed",
  "cancelled",
];

function buildListParamsKey(input: {
  reason: AutoDirectorFollowUpReason | "";
  status: TaskStatus | "";
  supportsBatch: string;
  channelType: AutoDirectorChannelType | "";
  page: number;
  pageSize: number;
}): string {
  return JSON.stringify(input);
}

function buildIdempotencyKey(taskId: string, actionCode: AutoDirectorMutationActionCode): string {
  return `${taskId}:${actionCode}:${Date.now()}`;
}

function buildBatchRequestKey(actionCode: AutoDirectorMutationActionCode): string {
  return `${actionCode}:${Date.now()}`;
}

function isBatchActionCode(
  actionCode: AutoDirectorMutationActionCode,
): actionCode is Extract<AutoDirectorMutationActionCode, "continue_auto_execution" | "retry_with_task_model"> {
  return actionCode === "continue_auto_execution" || actionCode === "retry_with_task_model";
}

function shouldConfirmAction(action: AutoDirectorAction): boolean {
  if (!action.requiresConfirm) {
    return false;
  }
  return window.confirm(`确认执行“${action.label}”？`);
}

function formatActionFeedbackMessage(message: string, fallback: string): string {
  const trimmed = message.trim();
  return trimmed || fallback;
}

function parseEnumParam<T extends string>(value: string | null, candidates: readonly T[]): T | "" {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return "";
  }
  return candidates.includes(normalized as T) ? (normalized as T) : "";
}

export default function AutoDirectorFollowUpCenterPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  const selectedTaskId = searchParams.get("taskId")?.trim() || "";
  const reason = parseEnumParam(searchParams.get("reason"), AUTO_DIRECTOR_FOLLOW_UP_REASONS);
  const status = parseEnumParam(searchParams.get("status"), TASK_STATUSES);
  const supportsBatch = searchParams.get("supportsBatch")?.trim() || "";
  const channelType = parseEnumParam(searchParams.get("channelType"), AUTO_DIRECTOR_CHANNEL_TYPES);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = 20;
  const paramsKey = buildListParamsKey({
    reason,
    status,
    supportsBatch,
    channelType,
    page,
    pageSize,
  });

  const overviewQuery = useQuery({
    queryKey: queryKeys.autoDirectorFollowUps.overview,
    queryFn: getAutoDirectorFollowUpOverview,
    refetchInterval: (query) => {
      const totalCount = query.state.data?.data?.totalCount ?? 0;
      return totalCount > 0 ? 4000 : false;
    },
  });

  const listQuery = useQuery({
    queryKey: queryKeys.autoDirectorFollowUps.list(paramsKey),
    queryFn: () => listAutoDirectorFollowUps({
      reason: reason || undefined,
      status: status || undefined,
      supportsBatch: supportsBatch ? supportsBatch === "true" : undefined,
      channelType: channelType || undefined,
      page,
      pageSize,
    }),
    refetchInterval: (query) => {
      const items = query.state.data?.data?.items ?? [];
      return items.some((item) => item.status === "failed" || item.status === "waiting_approval") ? 4000 : false;
    },
  });

  const items = listQuery.data?.data?.items ?? [];

  const detailQuery = useQuery({
    queryKey: queryKeys.autoDirectorFollowUps.detail(selectedTaskId || "none"),
    queryFn: () => getAutoDirectorFollowUpDetail(selectedTaskId),
    enabled: Boolean(selectedTaskId),
    retry: false,
  });

  useEffect(() => {
    if (selectedTaskId) {
      const exists = items.some((item) => item.taskId === selectedTaskId);
      if (exists || items.length === 0) {
        return;
      }
    }
    if (items.length === 0) {
      return;
    }
    const fallback = items[0];
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("taskId", fallback.taskId);
      return next;
    }, { replace: true });
  }, [items, selectedTaskId, setSearchParams]);

  useEffect(() => {
    setSelectedTaskIds((current) => reconcileSelectedTaskIds(current, items));
  }, [items]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedTaskIds.includes(item.taskId)),
    [items, selectedTaskIds],
  );

  const batchActionCode = useMemo(() => {
    if (selectedItems.length === 0) {
      return null;
    }
    const intersection = selectedItems
      .map((item) => item.batchActionCodes)
      .reduce<AutoDirectorMutationActionCode[]>((sharedCodes, codes, index) => {
        if (index === 0) {
          return [...codes];
        }
        return sharedCodes.filter((code) => codes.includes(code));
      }, []);
    return intersection.find((code) => isBatchActionCode(code)) ?? null;
  }, [selectedItems]);

  const invalidateFollowUps = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.autoDirectorFollowUps.overview }),
      queryClient.invalidateQueries({ queryKey: queryKeys.autoDirectorFollowUps.list(paramsKey) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.overview }),
      queryClient.invalidateQueries({ queryKey: ["auto-director-follow-ups"] }),
    ]);
    if (selectedTaskId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.autoDirectorFollowUps.detail(selectedTaskId) });
    }
  };

  const actionMutation = useMutation({
    mutationFn: (input: {
      taskId: string;
      actionCode: AutoDirectorMutationActionCode;
    }) => executeAutoDirectorFollowUpAction(input.taskId, {
      actionCode: input.actionCode,
      idempotencyKey: buildIdempotencyKey(input.taskId, input.actionCode),
    }),
    onSuccess: async (response) => {
      await invalidateFollowUps();
      toast.success(formatActionFeedbackMessage(response.message ?? "", "操作已提交"));
    },
  });

  const batchMutation = useMutation({
    mutationFn: (input: {
      actionCode: Extract<AutoDirectorMutationActionCode, "continue_auto_execution" | "retry_with_task_model">;
      taskIds: string[];
    }) => executeAutoDirectorFollowUpBatchAction({
      actionCode: input.actionCode,
      taskIds: input.taskIds,
      batchRequestKey: buildBatchRequestKey(input.actionCode),
    }),
    onSuccess: async (response) => {
      await invalidateFollowUps();
      toast.success(formatActionFeedbackMessage(response.message ?? "", "批量操作已提交"));
      setSelectedTaskIds([]);
    },
  });

  const handleSelectTask = (taskId: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("taskId", taskId);
      return next;
    });
  };

  const handleFilterChange = (key: "reason" | "status" | "supportsBatch" | "channelType", value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      next.set("page", "1");
      return next;
    });
  };

  const handleToggleSelected = (taskId: string, checked: boolean) => {
    setSelectedTaskIds((current) => {
      if (checked) {
        return Array.from(new Set(current.concat(taskId)));
      }
      return current.filter((id) => id !== taskId);
    });
  };

  const handleExecuteAction = async (item: AutoDirectorFollowUpItem, action: AutoDirectorAction) => {
    if (action.kind === "navigation") {
      if (action.targetUrl) {
        window.location.href = action.targetUrl;
      }
      return;
    }
    if (shouldConfirmAction(action) === false && action.requiresConfirm) {
      return;
    }
    const actionCode = action.code as AutoDirectorMutationActionCode;
    await actionMutation.mutateAsync({
      taskId: item.taskId,
      actionCode,
    });
  };

  const handleExecuteBatch = async () => {
    if (!batchActionCode || !isBatchActionCode(batchActionCode) || selectedItems.length === 0) {
      return;
    }
    await batchMutation.mutateAsync({
      actionCode: batchActionCode,
      taskIds: selectedItems.map((item) => item.taskId),
    });
  };

  return (
    <div className="mobile-page-follow-ups space-y-4">
      <AutoDirectorFollowUpOverviewCards
        overview={overviewQuery.data?.data ?? null}
        list={listQuery.data?.data ?? null}
        activeReason={reason}
        onReasonChange={(nextReason: string) => handleFilterChange("reason", nextReason)}
      />

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <AutoDirectorFollowUpListPanel
          items={items}
          pagination={listQuery.data?.data?.pagination ?? null}
          filters={listQuery.data?.data?.availableFilters ?? null}
          activeReason={reason}
          activeStatus={status}
          activeSupportsBatch={supportsBatch}
          activeChannelType={channelType}
          selectedTaskId={selectedTaskId}
          selectedTaskIds={selectedTaskIds}
          loading={listQuery.isLoading}
          actionLoading={actionMutation.isPending || batchMutation.isPending}
          onSelectTask={handleSelectTask}
          onFilterChange={handleFilterChange}
          onToggleSelected={handleToggleSelected}
          onPageChange={(nextPage: number) => {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set("page", String(nextPage));
              return next;
            });
          }}
        />

        <AutoDirectorFollowUpDetailPanel
          detail={detailQuery.data?.data ?? null}
          selectedItem={items.find((item) => item.taskId === selectedTaskId) ?? null}
          loading={detailQuery.isLoading}
          actionLoading={actionMutation.isPending}
          onExecuteAction={handleExecuteAction}
        />
      </div>

      <AutoDirectorFollowUpBatchBar
        selectedItems={selectedItems}
        batchActionCode={batchActionCode}
        loading={batchMutation.isPending}
        onClear={() => setSelectedTaskIds([])}
        onExecute={handleExecuteBatch}
      />
    </div>
  );
}
