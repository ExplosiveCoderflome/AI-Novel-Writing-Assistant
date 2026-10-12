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
import { ModelSettingsDialog } from "@/pages/settings/models";
import QuickSetupDialog from "./QuickSetupDialog";
import {
  shouldOpenAutomaticSetupPrompt,
  shouldOpenSetupPromptForRoute,
} from "./creationSetupState";

const DISMISSED_STORAGE_KEY = "ai-novel.quick-setup.dismissed.v1";

interface CreationSetupContextValue {
  readyForCreation: boolean;
  loading: boolean;
  statusError: boolean;
  openModelSettings: () => void;
  openQuickSetup: () => void;
  requireCreationSetup: () => boolean;
}

const CreationSetupContext = createContext<CreationSetupContextValue>({
  readyForCreation: true,
  loading: true,
  statusError: false,
  openModelSettings: () => undefined,
  openQuickSetup: () => undefined,
  requireCreationSetup: () => true,
});

export function useCreationSetup(): CreationSetupContextValue {
  return useContext(CreationSetupContext);
}

export function CreationSetupProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const [forceConfiguration, setForceConfiguration] = useState(false);
  const [automaticPromptChecked, setAutomaticPromptChecked] = useState(false);
  const statusQuery = useQuery({
    queryKey: queryKeys.settings.quickSetup,
    queryFn: getQuickSetupStatus,
    staleTime: 60_000,
    retry: 1,
  });
  const readyForCreation = statusQuery.data?.data?.readyForCreation === true;

  const openModelSettings = useCallback(() => {
    setDialogOpen(false);
    setForceConfiguration(false);
    setModelSettingsOpen(true);
  }, []);

  const openQuickSetup = useCallback(() => {
    setModelSettingsOpen(false);
    setForceConfiguration(true);
    setDialogOpen(true);
  }, []);

  const requireCreationSetup = useCallback(() => {
    if (readyForCreation) {
      return true;
    }
    setModelSettingsOpen(false);
    setForceConfiguration(false);
    setDialogOpen(true);
    return false;
  }, [readyForCreation]);

  useEffect(() => {
    if (automaticPromptChecked || !statusQuery.isSuccess || modelSettingsOpen) {
      return;
    }
    setAutomaticPromptChecked(true);
    if (readyForCreation) {
      window.localStorage.removeItem(DISMISSED_STORAGE_KEY);
      return;
    }
    if (shouldOpenAutomaticSetupPrompt({
      statusResolved: statusQuery.isSuccess,
      readyForCreation,
      dismissed: window.localStorage.getItem(DISMISSED_STORAGE_KEY) === "true",
      modelSettingsOpen,
    })) {
      setForceConfiguration(false);
      setDialogOpen(true);
    }
  }, [automaticPromptChecked, modelSettingsOpen, readyForCreation, statusQuery.isSuccess]);

  useEffect(() => {
    if (shouldOpenSetupPromptForRoute({
      statusResolved: statusQuery.isSuccess,
      readyForCreation,
      pathname: location.pathname,
      modelSettingsOpen,
    })) {
      setForceConfiguration(false);
      setDialogOpen(true);
    }
  }, [location.pathname, modelSettingsOpen, readyForCreation, statusQuery.isSuccess]);

  const handleOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open && !readyForCreation) {
      window.localStorage.setItem(DISMISSED_STORAGE_KEY, "true");
    }
    if (!open) {
      setForceConfiguration(false);
    }
  };

  const value = useMemo<CreationSetupContextValue>(() => ({
    readyForCreation,
    loading: statusQuery.isPending,
    statusError: statusQuery.isError,
    openModelSettings,
    openQuickSetup,
    requireCreationSetup,
  }), [
    openModelSettings,
    openQuickSetup,
    readyForCreation,
    requireCreationSetup,
    statusQuery.isError,
    statusQuery.isPending,
  ]);

  return (
    <CreationSetupContext.Provider value={value}>
      {children}
      <ModelSettingsDialog open={modelSettingsOpen} onOpenChange={setModelSettingsOpen} />
      <QuickSetupDialog
        open={dialogOpen}
        onOpenChange={handleOpenChange}
        status={statusQuery.data?.data ?? null}
        loading={statusQuery.isPending}
        error={statusQuery.isError}
        onRetry={() => void statusQuery.refetch()}
        forceConfiguration={forceConfiguration}
      />
    </CreationSetupContext.Provider>
  );
}
