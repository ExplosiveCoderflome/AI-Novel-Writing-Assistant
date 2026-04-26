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

function areCodeListsEqual(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  if (!left || !right) {
    return left === right;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => item === right[index]);
}

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
    setCodes((current) => {
      const hasCustomCodes = current.length > 0 && !areCodeListsEqual(current, DEFAULT_DIRECTOR_AUTO_APPROVAL_POINT_CODES);
      if (hasCustomCodes) {
        return current;
      }
      return areCodeListsEqual(current, defaultCodes) ? current : [...defaultCodes];
    });
  }, [defaultCodes, open]);

  const updateCodes = useCallback((next: string[]) => {
    setCodes((current) => (areCodeListsEqual(current, next) ? current : [...next]));
  }, []);

  const applySnapshot = useCallback((value: DirectorAutoApprovalConfig | null | undefined) => {
    if (!value) {
      return;
    }
    const normalized = normalizeDirectorAutoApprovalConfig(value);
    setEnabled((current) => (current === normalized.enabled ? current : normalized.enabled));
    setCodes((current) => (
      areCodeListsEqual(current, normalized.approvalPointCodes)
        ? current
        : [...normalized.approvalPointCodes]
    ));
  }, []);

  const reset = useCallback(() => {
    const nextCodes = defaultCodes?.length ? defaultCodes : DEFAULT_DIRECTOR_AUTO_APPROVAL_POINT_CODES;
    setEnabled((current) => (current ? current : true));
    setCodes((current) => (areCodeListsEqual(current, nextCodes) ? current : [...nextCodes]));
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
    setCodes: updateCodes,
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
    updateCodes,
  ]);
}
