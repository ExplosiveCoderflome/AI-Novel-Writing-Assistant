import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DEFAULT_DIRECTOR_AUTO_APPROVAL_POINT_CODES,
  normalizeDirectorAutoApprovalConfig,
  type DirectorAutoApprovalConfig,
} from "@ai-novel/shared/types/autoDirectorApproval";
import type { DirectorRunMode } from "@ai-novel/shared/types/novelDirector";
import { getAutoDirectorApprovalPreferenceSettings } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";

export function useDirectorAutoApprovalDraft(open: boolean) {
  const [enabled, setEnabled] = useState(true);
  const [codes, setCodes] = useState<string[]>([...DEFAULT_DIRECTOR_AUTO_APPROVAL_POINT_CODES]);
  const preferenceQuery = useQuery({
    queryKey: queryKeys.settings.autoDirectorApprovalPreferences,
    queryFn: getAutoDirectorApprovalPreferenceSettings,
    enabled: open,
  });
  const defaultCodes = preferenceQuery.data?.data?.approvalPointCodes;

  useEffect(() => {
    if (!open || !defaultCodes?.length) {
      return;
    }
    setCodes((current) => (
      current.length > 0 && current.join(",") !== DEFAULT_DIRECTOR_AUTO_APPROVAL_POINT_CODES.join(",")
        ? current
        : defaultCodes
    ));
  }, [defaultCodes, open]);

  const applySnapshot = useCallback((value: DirectorAutoApprovalConfig | null | undefined) => {
    if (!value) {
      return;
    }
    const normalized = normalizeDirectorAutoApprovalConfig(value);
    setEnabled(normalized.enabled);
    setCodes(normalized.approvalPointCodes);
  }, []);

  const reset = useCallback(() => {
    setEnabled(true);
    setCodes(defaultCodes ?? [...DEFAULT_DIRECTOR_AUTO_APPROVAL_POINT_CODES]);
  }, [defaultCodes]);

  const buildPayload = useCallback((runMode: DirectorRunMode): DirectorAutoApprovalConfig => ({
    enabled: runMode === "auto_to_execution" && enabled,
    approvalPointCodes: normalizeDirectorAutoApprovalConfig({
      enabled,
      approvalPointCodes: codes,
    }).approvalPointCodes,
  }), [codes, enabled]);

  return useMemo(() => ({
    enabled,
    codes,
    groups: preferenceQuery.data?.data?.groups,
    points: preferenceQuery.data?.data?.approvalPoints,
    setEnabled,
    setCodes,
    applySnapshot,
    reset,
    buildPayload,
  }), [
    applySnapshot,
    buildPayload,
    codes,
    enabled,
    preferenceQuery.data?.data?.approvalPoints,
    preferenceQuery.data?.data?.groups,
    reset,
  ]);
}
