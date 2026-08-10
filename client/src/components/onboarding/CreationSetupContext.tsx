import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { getQuickSetupStatus } from "@/api/onboarding";
import { queryKeys } from "@/api/queryKeys";
import QuickSetupDialog from "./QuickSetupDialog";

const DISMISSED_STORAGE_KEY = "ai-novel.quick-setup.dismissed.v1";
const GATED_ROUTE_PREFIXES = [
  "/novels/auto-director",
  "/creative-hub",
  "/book-analysis",
  "/style-engine",
  "/worlds/generator",
];

interface CreationSetupContextValue {
  readyForCreation: boolean;
  loading: boolean;
  statusError: boolean;
  openQuickSetup: () => void;
  requireCreationSetup: () => boolean;
}

const CreationSetupContext = createContext<CreationSetupContextValue>({
  readyForCreation: true,
  loading: true,
  statusError: false,
  openQuickSetup: () => undefined,
  requireCreationSetup: () => true,
});

export function useCreationSetup(): CreationSetupContextValue {
  return useContext(CreationSetupContext);
}

export function CreationSetupProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [automaticPromptChecked, setAutomaticPromptChecked] = useState(false);
  const statusQuery = useQuery({
    queryKey: queryKeys.settings.quickSetup,
    queryFn: getQuickSetupStatus,
    staleTime: 60_000,
    retry: 1,
  });
  const readyForCreation = statusQuery.data?.data?.readyForCreation === true;

  const openQuickSetup = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const requireCreationSetup = useCallback(() => {
    if (readyForCreation) {
      return true;
    }
    setDialogOpen(true);
    return false;
  }, [readyForCreation]);

  useEffect(() => {
    if (automaticPromptChecked || statusQuery.isPending || statusQuery.isError) {
      return;
    }
    setAutomaticPromptChecked(true);
    if (readyForCreation) {
      window.localStorage.removeItem(DISMISSED_STORAGE_KEY);
      return;
    }
    if (window.localStorage.getItem(DISMISSED_STORAGE_KEY) !== "true") {
      setDialogOpen(true);
    }
  }, [automaticPromptChecked, readyForCreation, statusQuery.isError, statusQuery.isPending]);

  useEffect(() => {
    if (
      !readyForCreation
      && GATED_ROUTE_PREFIXES.some((prefix) => location.pathname.startsWith(prefix))
    ) {
      setDialogOpen(true);
    }
  }, [location.pathname, readyForCreation, statusQuery.isError, statusQuery.isPending]);

  const handleOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open && !readyForCreation) {
      window.localStorage.setItem(DISMISSED_STORAGE_KEY, "true");
    }
  };

  const value = useMemo<CreationSetupContextValue>(() => ({
    readyForCreation,
    loading: statusQuery.isPending,
    statusError: statusQuery.isError,
    openQuickSetup,
    requireCreationSetup,
  }), [
    openQuickSetup,
    readyForCreation,
    requireCreationSetup,
    statusQuery.isError,
    statusQuery.isPending,
  ]);

  return (
    <CreationSetupContext.Provider value={value}>
      {children}
      <QuickSetupDialog
        open={dialogOpen}
        onOpenChange={handleOpenChange}
        status={statusQuery.data?.data ?? null}
        loading={statusQuery.isPending}
        error={statusQuery.isError}
        onRetry={() => void statusQuery.refetch()}
      />
    </CreationSetupContext.Provider>
  );
}
