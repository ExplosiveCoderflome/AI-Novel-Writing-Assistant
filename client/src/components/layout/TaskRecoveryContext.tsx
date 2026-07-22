import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RecoverableTaskSummary } from "@ai-novel/shared/types/task";
import {
  listRecoveryCandidates,
  resumeAllRecoveryCandidates,
  resumeRecoveryCandidate,
} from "@/api/tasks";
import { queryKeys } from "@/api/queryKeys";
import { toast } from "@/components/ui/toast";

type RecoveryTaskInput = {
  kind: RecoverableTaskSummary["kind"];
  id: string;
};

type TaskRecoveryContextValue = {
  items: RecoverableTaskSummary[];
  candidateCount: number;
  isOpen: boolean;
  isLoading: boolean;
  isResumeSinglePending: boolean;
  isResumeAllPending: boolean;
  busyTaskId: string;
  openDialog: () => void;
  closeDialog: () => void;
  resumeSingle: (input: RecoveryTaskInput) => void;
  resumeAll: () => void;
};

const TaskRecoveryContext = createContext<TaskRecoveryContextValue | null>(null);

function recoveryItemKey(item: { kind: string; id: string }): string {
  return `${item.kind}:${item.id}`;
}

export function TaskRecoveryProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [manualOpen, setManualOpen] = useState(false);
  const [recoveryQueryEnabled, setRecoveryQueryEnabled] = useState(false);
  const [acceptedRecoveryKeys, setAcceptedRecoveryKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const timer = window.setTimeout(() => setRecoveryQueryEnabled(true), 900);
    return () => window.clearTimeout(timer);
  }, []);

  const recoveryQuery = useQuery({
    queryKey: queryKeys.tasks.recoveryCandidates,
    queryFn: listRecoveryCandidates,
    enabled: recoveryQueryEnabled,
    staleTime: 10_000,
  });

  const rawItems = recoveryQuery.data?.data?.items ?? [];
  const items = useMemo(
    () => rawItems.filter((item) => !acceptedRecoveryKeys.has(recoveryItemKey(item))),
    [acceptedRecoveryKeys, rawItems],
  );

  useEffect(() => {
    if (recoveryQuery.isSuccess && rawItems.length === 0) {
      setManualOpen(false);
      setAcceptedRecoveryKeys(new Set());
    }
  }, [rawItems.length, recoveryQuery.isSuccess]);

  const refreshTaskState = useCallback(() => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.novels.all }),
    ]);
  }, [queryClient]);

  const resumeSingleMutation = useMutation({
    mutationFn: (input: RecoveryTaskInput) => resumeRecoveryCandidate(input.kind, input.id),
    onSuccess: (_response, variables) => {
      setAcceptedRecoveryKeys((previous) => {
        const next = new Set(previous);
        next.add(recoveryItemKey(variables));
        return next;
      });
      toast.success(t("gen.components.layout.TaskRecoveryContext.gen_07826f27"));
      refreshTaskState();
      void recoveryQuery.refetch();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("gen.components.layout.TaskRecoveryContext.gen_2cf820a2"));
    },
  });

  const resumeAllMutation = useMutation({
    mutationFn: resumeAllRecoveryCandidates,
    onSuccess: (response) => {
      const resumedCount = response.data?.resumed.length ?? 0;
      setAcceptedRecoveryKeys((previous) => {
        const next = new Set(previous);
        for (const item of response.data?.resumed ?? []) {
          next.add(recoveryItemKey(item));
        }
        return next;
      });
      toast.success(resumedCount > 0 ? `已开始恢复 ${resumedCount} 个任务。` : t("gen.components.layout.TaskRecoveryContext.gen_3c783b2d"));
      refreshTaskState();
      void recoveryQuery.refetch();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : t("gen.components.layout.TaskRecoveryContext.gen_12c15229"));
    },
  });

  const busyTaskId = useMemo(() => {
    if (!resumeSingleMutation.isPending) {
      return "";
    }
    return resumeSingleMutation.variables?.id ?? "";
  }, [resumeSingleMutation.isPending, resumeSingleMutation.variables]);

  const isOpen = items.length > 0 && manualOpen;

  const closeDialog = useCallback(() => {
    setManualOpen(false);
  }, []);

  const openDialog = useCallback(() => {
    if (items.length === 0) {
      return;
    }
    setManualOpen(true);
  }, [items.length]);

  const value = useMemo<TaskRecoveryContextValue>(() => ({
    items,
    candidateCount: items.length,
    isOpen,
    isLoading: recoveryQuery.isLoading,
    isResumeSinglePending: resumeSingleMutation.isPending,
    isResumeAllPending: resumeAllMutation.isPending,
    busyTaskId,
    openDialog,
    closeDialog,
    resumeSingle: (input) => resumeSingleMutation.mutate(input),
    resumeAll: () => resumeAllMutation.mutate(),
  }), [
    busyTaskId,
    closeDialog,
    isOpen,
    items,
    openDialog,
    recoveryQuery.isLoading,
    resumeAllMutation,
    resumeSingleMutation,
  ]);

  return (
    <TaskRecoveryContext.Provider value={value}>
      {children}
    </TaskRecoveryContext.Provider>
  );
}

export function useTaskRecovery() {
  const context = useContext(TaskRecoveryContext);
  if (!context) {
    throw new Error("useTaskRecovery must be used within TaskRecoveryProvider.");
  }
  return context;
}
