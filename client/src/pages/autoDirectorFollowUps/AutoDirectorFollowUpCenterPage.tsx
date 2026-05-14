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
import {
  AUTO_DIRECTOR_FOLLOW_UP_SECTIONS,
  type AutoDirectorFollowUpSection,
} from "@ai-novel/shared/types/autoDirectorValidation";
import type { TaskStatus } from "@ai-novel/shared/types/task";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  executeAutoDirectorFollowUpAction,
  executeAutoDirectorFollowUpBatchAction,
  getAutoDirectorFollowUpDetail,
  getAutoDirectorFollowUpOverview,
  listAutoDirectorFollowUps,
  revalidateAutoDirectorFollowUpDetail,
} from "@/api/autoDirectorFollowUps";
import { queryKeys } from "@/api/queryKeys";
import { AutoDirectorFollowUpBatchBar } from "./components/AutoDirectorFollowUpBatchBar";
import { AutoDirectorFollowUpDetailPanel } from "./components/AutoDirectorFollowUpDetail";
import { AutoDirectorFollowUpListPanel } from "./components/AutoDirectorFollowUpList";
import { AutoDirectorFollowUpOverviewCards } from "./components/AutoDirectorFollowUpOverview";
import { reconcileSelectedTaskIds } from "./selectionState";
import { toast } from "@/components/ui/toast";
import { resolveInternalNavigationTarget } from "@/lib/internalNavigation";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

const TASK_STATUSES: readonly TaskStatus[] = [
  "queued",
  "running",
  "waiting_approval",
  "succeeded",
  "failed",
  "cancelled",
];

function buildListParamsKey(input: {
  section: AutoDirectorFollowUpSection | "";
  reason: AutoDirectorFollowUpReason | "";
  status: TaskStatus | "";
  supportsBatch: string;
  channelType: AutoDirectorChannelType | "";
  page: number;
  pageSize: number;
}): string {
  return JSON.stringify(input);
}

function isBatchActionAllowedForSection(
  section: AutoDirectorFollowUpSection,
  actionCode: AutoDirectorMutationActionCode,
): actionCode is Extract<AutoDirectorMutationActionCode, "continue_auto_execution" | "retry_with_task_model"> {
  if (section === "pending") {
    return actionCode === "continue_auto_execution";
  }
  if (section === "exception") {
    return actionCode === "retry_with_task_model";
  }
  return false;
}

function buildIdempotencyKey(directorTaskId: string, actionCode: AutoDirectorMutationActionCode): string {
  return `${directorTaskId}:${actionCode}:${Date.now()}`;
}

function buildBatchRequestKey(actionCode: AutoDirectorMutationActionCode): string {
  return `${actionCode}:${Date.now()}`;
}

function isBatchActionCode(
  actionCode: AutoDirectorMutationActionCode,
): actionCode is Extract<AutoDirectorMutationActionCode, "continue_auto_execution" | "retry_with_task_model"> {
  return actionCode === "continue_auto_execution" || actionCode === "retry_with_task_model";
}

function getSelectedSection(items: AutoDirectorFollowUpItem[]): AutoDirectorFollowUpSection | null {
  const sections = Array.from(new Set(items.map((item) => item.section)));
  return sections.length === 1 ? sections[0] : null;
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDirectorTaskIds, setSelectedDirectorTaskIds] = useState<string[]>([]);

  const selectedDirectorTaskId = searchParams.get("directorTaskId")?.trim() || searchParams.get("taskId")?.trim() || "";
  const section = parseEnumParam(searchParams.get("section"), AUTO_DIRECTOR_FOLLOW_UP_SECTIONS);
  const reason = parseEnumParam(searchParams.get("reason"), AUTO_DIRECTOR_FOLLOW_UP_REASONS);
  const status = parseEnumParam(searchParams.get("status"), TASK_STATUSES);
  const supportsBatch = searchParams.get("supportsBatch")?.trim() || "";
  const channelType = parseEnumParam(searchParams.get("channelType"), AUTO_DIRECTOR_CHANNEL_TYPES);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = 20;
  const paramsKey = buildListParamsKey({
    section,
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
      section: section || undefined,
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
    queryKey: queryKeys.autoDirectorFollowUps.detail(selectedDirectorTaskId || "none"),
    queryFn: () => getAutoDirectorFollowUpDetail(selectedDirectorTaskId),
    enabled: Boolean(selectedDirectorTaskId),
    retry: false,
  });

  useEffect(() => {
    const legacyTaskId = searchParams.get("taskId")?.trim() || "";
    if (legacyTaskId) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("directorTaskId", selectedDirectorTaskId || legacyTaskId);
        next.delete("taskId");
        return next;
      }, { replace: true });
      return;
    }
    if (selectedDirectorTaskId) {
      const exists = items.some((item) => item.directorTaskId === selectedDirectorTaskId);
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
      next.set("directorTaskId", fallback.directorTaskId);
      next.delete("taskId");
      return next;
    }, { replace: true });
  }, [items, searchParams, selectedDirectorTaskId, setSearchParams]);

  useEffect(() => {
    setSelectedDirectorTaskIds((current) => reconcileSelectedTaskIds(current, items));
  }, [items]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedDirectorTaskIds.includes(item.directorTaskId)),
    [items, selectedDirectorTaskIds],
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
    const selectedSection = getSelectedSection(selectedItems);
    if (!selectedSection) {
      return null;
    }
    return intersection.find((code) => isBatchActionAllowedForSection(selectedSection, code)) ?? null;
  }, [selectedItems]);

  const invalidateFollowUps = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.autoDirectorFollowUps.overview }),
      queryClient.invalidateQueries({ queryKey: queryKeys.autoDirectorFollowUps.list(paramsKey) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.overview }),
      queryClient.invalidateQueries({ queryKey: ["auto-director-follow-ups"] }),
    ]);
    if (selectedDirectorTaskId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.autoDirectorFollowUps.detail(selectedDirectorTaskId) });
    }
  };

  const actionMutation = useMutation({
    mutationFn: (input: {
      directorTaskId: string;
      actionCode: AutoDirectorMutationActionCode;
    }) => executeAutoDirectorFollowUpAction(input.directorTaskId, {
      actionCode: input.actionCode,
      idempotencyKey: buildIdempotencyKey(input.directorTaskId, input.actionCode),
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
      setSelectedDirectorTaskIds([]);
    },
  });

  const revalidationMutation = useMutation({
    mutationFn: revalidateAutoDirectorFollowUpDetail,
    onSuccess: async (response, directorTaskId) => {
      queryClient.setQueryData(
        queryKeys.autoDirectorFollowUps.detail(directorTaskId),
        response,
      );
      toast.success("校验结果已刷新。");
    },
  });

  const handleSelectTask = (directorTaskId: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("directorTaskId", directorTaskId);
      next.delete("taskId");
      return next;
    });
  };

  const handleSectionChange = (nextSection: AutoDirectorFollowUpSection | "") => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!nextSection) {
        next.delete("section");
        next.delete("directorTaskId");
        next.delete("taskId");
        next.delete("supportsBatch");
        next.set("page", "1");
        return next;
      }
      if (section === nextSection) {
        next.delete("section");
      } else {
        next.set("section", nextSection);
      }
      next.delete("directorTaskId");
      next.delete("taskId");
      next.delete("supportsBatch");
      next.set("page", "1");
      return next;
    });
    setSelectedDirectorTaskIds([]);
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

  const handleToggleSelected = (directorTaskId: string, checked: boolean) => {
    setSelectedDirectorTaskIds((current) => {
      if (checked) {
        return Array.from(new Set(current.concat(directorTaskId)));
      }
      return current.filter((id) => id !== directorTaskId);
    });
  };

  const handleExecuteAction = async (item: AutoDirectorFollowUpItem, action: AutoDirectorAction) => {
    if (action.kind === "navigation") {
      const internalTarget = resolveInternalNavigationTarget(action.targetUrl);
      if (internalTarget) {
        navigate(internalTarget);
        return;
      }
      const externalTarget = action.targetUrl?.trim();
      if (externalTarget && /^https?:\/\//i.test(externalTarget)) {
        window.location.assign(externalTarget);
      }
      return;
    }
    if (shouldConfirmAction(action) === false && action.requiresConfirm) {
      return;
    }
    const actionCode = action.code as AutoDirectorMutationActionCode;
    await actionMutation.mutateAsync({
      directorTaskId: item.directorTaskId,
      actionCode,
    });
  };

  const handleExecuteBatch = async () => {
    if (!batchActionCode || !isBatchActionCode(batchActionCode) || selectedItems.length === 0) {
      return;
    }
    await batchMutation.mutateAsync({
      actionCode: batchActionCode,
      taskIds: selectedItems.map((item) => item.directorTaskId),
    });
  };

  const handleRefreshValidation = async () => {
    if (!selectedDirectorTaskId) {
      return;
    }
    await revalidationMutation.mutateAsync(selectedDirectorTaskId);
  };

  const handleSafeFix = async () => {
    if (!selectedDirectorTaskId) {
      return;
    }
    await actionMutation.mutateAsync({
      directorTaskId: selectedDirectorTaskId,
      actionCode: "safe_fix_validation",
    });
  };

  return (
    <div className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpPageRoot}>
      <AutoDirectorFollowUpOverviewCards
        overview={overviewQuery.data?.data ?? null}
        list={listQuery.data?.data ?? null}
        activeSection={section}
        onSectionChange={handleSectionChange}
      />

      <div className={AUTO_DIRECTOR_MOBILE_CLASSES.followUpMasterDetailGrid}>
        <AutoDirectorFollowUpListPanel
          items={items}
          pagination={listQuery.data?.data?.pagination ?? null}
          filters={listQuery.data?.data?.availableFilters ?? null}
          activeReason={reason}
          activeSection={section}
          activeStatus={status}
          activeSupportsBatch={supportsBatch}
          selectedTaskId={selectedDirectorTaskId}
          selectedTaskIds={selectedDirectorTaskIds}
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
          selectedItem={items.find((item) => item.directorTaskId === selectedDirectorTaskId) ?? null}
          loading={detailQuery.isLoading || revalidationMutation.isPending}
          actionLoading={actionMutation.isPending || revalidationMutation.isPending}
          onExecuteAction={handleExecuteAction}
          onRefreshValidation={handleRefreshValidation}
          onSafeFix={handleSafeFix}
        />
      </div>

      <AutoDirectorFollowUpBatchBar
        selectedItems={selectedItems}
        batchActionCode={batchActionCode}
        loading={batchMutation.isPending}
        onClear={() => setSelectedDirectorTaskIds([])}
        onExecute={handleExecuteBatch}
      />
    </div>
  );
}
