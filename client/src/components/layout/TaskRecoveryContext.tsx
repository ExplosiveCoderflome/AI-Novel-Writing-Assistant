import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { RecoverableTaskSummary } from "@ai-novel/shared/types/task";
import { listRecoveryCandidates } from "@/api/tasks";
import { queryKeys } from "@/api/queryKeys";

type TaskRecoveryContextValue = {
  items: RecoverableTaskSummary[];
  candidateCount: number;
  isOpen: boolean;
  isLoading: boolean;
  openDialog: () => void;
  closeDialog: () => void;
};
const TaskRecoveryContext = createContext<TaskRecoveryContextValue | null>(null);
const emptyItems: RecoverableTaskSummary[] = [];

export function TaskRecoveryProvider({ children }: { children: ReactNode }) {
  const [manualOpen, setManualOpen] = useState(false);
  const [recoveryQueryEnabled, setRecoveryQueryEnabled] = useState(false);
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
  const items = recoveryQuery.data?.data?.items ?? emptyItems;
  useEffect(() => {
    if (recoveryQuery.isSuccess && items.length === 0) setManualOpen(false);
  }, [items.length, recoveryQuery.isSuccess]);
  const closeDialog = useCallback(() => setManualOpen(false), []);
  const openDialog = useCallback(() => {
    if (items.length > 0) setManualOpen(true);
  }, [items.length]);
  return (
    <TaskRecoveryContext.Provider value={{
      items,
      candidateCount: items.length,
      isOpen: items.length > 0 && manualOpen,
      isLoading: recoveryQuery.isLoading,
      openDialog,
      closeDialog,
    }}>
      {children}
    </TaskRecoveryContext.Provider>
  );
}
export function useTaskRecovery() {
  const context = useContext(TaskRecoveryContext);
  if (!context) throw new Error("useTaskRecovery must be used within TaskRecoveryProvider.");
  return context;
}
