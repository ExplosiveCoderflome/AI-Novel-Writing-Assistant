import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getNovelList } from "@/api/novel/core";
import {
  getSlotOverrides,
  getSlotReconcile,
  type PromptCatalogItem,
  type PromptSlotDef,
  type PromptSlotOverrideEntry,
  type PromptSlotOverrideScope,
  type PromptSlotOverrideView,
  type PromptSlotReconcileItem,
  type PromptSlotReconcileResult,
} from "@/api/promptWorkbench";
import { queryKeys } from "@/api/queryKeys";
import type { PromptEditorSection, PromptSlotDrafts, PromptSlotValue } from "../promptWorkbenchTypes";
import {
  buildOverrideParamsKey,
  buildReconcileParamsKey,
  usePromptSlotPersistence,
} from "./usePromptSlotPersistence";

function getSlotDefault(def: PromptSlotDef): PromptSlotValue {
  return def.default;
}

function sameSlotValue(left: PromptSlotValue, right: PromptSlotValue): boolean {
  return left === right;
}

function getEntryValue(def: PromptSlotDef, entry: PromptSlotOverrideEntry | undefined): PromptSlotValue {
  return entry?.value ?? getSlotDefault(def);
}

function getPersistedEffectiveValue(input: {
  def: PromptSlotDef;
  scope: PromptSlotOverrideScope;
  globalEntry?: PromptSlotOverrideEntry;
  novelEntry?: PromptSlotOverrideEntry;
}): PromptSlotValue {
  const { def, globalEntry, novelEntry, scope } = input;
  if (scope === "novel") {
    return getEntryValue(def, novelEntry ?? globalEntry);
  }
  return getEntryValue(def, globalEntry);
}

function getSectionPlacement(def: PromptSlotDef): PromptEditorSection["placement"] {
  if (def.kind === "choice" || def.kind === "toggle") {
    return "control";
  }
  if (def.kind === "append") {
    return "append";
  }
  return "body";
}

function mapSlotsByScope(overrides: PromptSlotOverrideView[], activeNovelId: string) {
  const globalOverride = overrides.find((row) => row.scope === "global");
  const novelOverride = activeNovelId
    ? overrides.find((row) => row.scope === "novel" && row.novelId === activeNovelId)
    : undefined;
  return {
    globalSlotMap: globalOverride?.slots ?? {},
    novelSlotMap: novelOverride?.slots ?? {},
  };
}

export function buildPromptEditorSections(input: {
  prompt: PromptCatalogItem | null;
  scope: PromptSlotOverrideScope;
  drafts: PromptSlotDrafts;
  globalSlotMap: Record<string, PromptSlotOverrideEntry>;
  novelSlotMap: Record<string, PromptSlotOverrideEntry>;
}): PromptEditorSection[] {
  const { drafts, globalSlotMap, novelSlotMap, prompt, scope } = input;
  if (!prompt) {
    return [];
  }

  return prompt.slots.map((slot) => {
    const globalOverride = globalSlotMap[slot.key];
    const novelOverride = novelSlotMap[slot.key];
    const currentScopeOverride = scope === "global" ? globalOverride : novelOverride;
    const persistedValue = getPersistedEffectiveValue({
      def: slot,
      scope,
      globalEntry: globalOverride,
      novelEntry: novelOverride,
    });
    const draftValue = drafts[slot.key];
    const value = draftValue !== undefined ? draftValue : persistedValue;
    return {
      id: slot.key,
      slotKey: slot.key,
      slot,
      label: slot.label,
      description: slot.description,
      kind: slot.kind,
      placement: getSectionPlacement(slot),
      value,
      defaultValue: getSlotDefault(slot),
      persistedValue,
      draftValue,
      currentScopeOverride,
      globalOverride,
      novelOverride,
      isDirty: draftValue !== undefined && !sameSlotValue(draftValue, persistedValue),
      isSavedOverride: currentScopeOverride !== undefined,
      isInheritedFromGlobal: scope === "novel" && novelOverride === undefined && globalOverride !== undefined,
    } satisfies PromptEditorSection;
  });
}

export function usePromptDraftSlots(prompt: PromptCatalogItem | null) {
  const [scope, setScopeState] = useState<PromptSlotOverrideScope>("global");
  const [selectedNovelId, setSelectedNovelIdState] = useState("");
  const [drafts, setDrafts] = useState<PromptSlotDrafts>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showReconcile, setShowReconcile] = useState(false);
  const prevPromptId = useRef(prompt?.id ?? "");

  useEffect(() => {
    if (prevPromptId.current !== (prompt?.id ?? "")) {
      prevPromptId.current = prompt?.id ?? "";
      setDrafts({});
      setSaveError(null);
      setShowReconcile(false);
    }
  }, [prompt?.id]);

  const activeNovelId = scope === "novel" ? selectedNovelId : "";
  const promptId = prompt?.id ?? "";
  const overrideParamsKey = useMemo(
    () => buildOverrideParamsKey(promptId, activeNovelId),
    [activeNovelId, promptId],
  );
  const reconcileParamsKey = useMemo(
    () => buildReconcileParamsKey(promptId, scope, activeNovelId),
    [activeNovelId, promptId, scope],
  );

  const novelsQuery = useQuery({
    queryKey: queryKeys.novels.list(1, 50),
    queryFn: () => getNovelList({ page: 1, limit: 50 }),
    enabled: Boolean(prompt?.slotSupported),
    staleTime: 60_000,
  });

  const overrideQuery = useQuery({
    queryKey: queryKeys.promptWorkbench.slotOverrides(overrideParamsKey),
    queryFn: () => getSlotOverrides({ promptId, novelId: activeNovelId || undefined }),
    enabled: Boolean(prompt?.slotSupported && promptId),
    staleTime: 15_000,
  });

  const isNovelScopeDisabled = scope === "novel" && !activeNovelId;

  const reconcileQuery = useQuery({
    queryKey: queryKeys.promptWorkbench.slotReconcile(reconcileParamsKey),
    queryFn: () => getSlotReconcile({
      promptId,
      scope,
      novelId: activeNovelId || undefined,
    }),
    enabled: Boolean(prompt?.slotSupported && promptId && showReconcile && !isNovelScopeDisabled),
    staleTime: 30_000,
  });

  const { saveMutation, resetMutation, adoptMutation, keepMutation, invalidateReconcile } =
    usePromptSlotPersistence({
      prompt,
      scope,
      activeNovelId,
      overrideParamsKey,
      reconcileParamsKey,
      onSaved: () => {
        setSaveError(null);
        setDrafts({});
      },
    });

  useEffect(() => {
    if (saveMutation.isError) {
      const error = saveMutation.error;
      setSaveError(error instanceof Error ? error.message : "保存失败，请重试。");
    }
  }, [saveMutation.error, saveMutation.isError]);

  const overrides: PromptSlotOverrideView[] = overrideQuery.data?.data ?? [];
  const { globalSlotMap, novelSlotMap } = useMemo(
    () => mapSlotsByScope(overrides, activeNovelId),
    [activeNovelId, overrides],
  );

  const sections = useMemo(
    () => buildPromptEditorSections({
      prompt,
      scope,
      drafts,
      globalSlotMap,
      novelSlotMap,
    }),
    [drafts, globalSlotMap, novelSlotMap, prompt, scope],
  );

  const reconcile: PromptSlotReconcileResult | null = reconcileQuery.data?.data ?? null;
  const reconcileMap: Record<string, PromptSlotReconcileItem> = useMemo(() => {
    if (!reconcile) {
      return {};
    }
    return Object.fromEntries(reconcile.items.map((item) => [item.key, item]));
  }, [reconcile]);

  const dirtySlotKeys = useMemo(
    () => sections.filter((section) => section.isDirty).map((section) => section.slotKey),
    [sections],
  );

  const setScope = useCallback((nextScope: PromptSlotOverrideScope) => {
    setScopeState(nextScope);
    setDrafts({});
    setSaveError(null);
  }, []);

  const setSelectedNovelId = useCallback((nextNovelId: string) => {
    setSelectedNovelIdState(nextNovelId);
    setDrafts({});
    setSaveError(null);
  }, []);

  const changeSlotDraft = useCallback((key: string, value: PromptSlotValue) => {
    const section = sections.find((item) => item.slotKey === key);
    if (!section) {
      return;
    }
    setSaveError(null);
    setDrafts((current) => {
      const next = { ...current };
      if (sameSlotValue(value, section.persistedValue)) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }, [sections]);

  const resetSlot = useCallback((key: string) => {
    const section = sections.find((item) => item.slotKey === key);
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (section?.currentScopeOverride) {
      resetMutation.mutate([key]);
    }
  }, [resetMutation, sections]);

  const resetDrafts = useCallback(() => {
    setDrafts({});
    setSaveError(null);
  }, []);

  const saveDrafts = useCallback(() => {
    if (dirtySlotKeys.length === 0) {
      return;
    }
    const updates = Object.fromEntries(
      dirtySlotKeys.map((key) => [key, drafts[key]]),
    );
    saveMutation.mutate(updates);
  }, [dirtySlotKeys, drafts, saveMutation]);

  const adoptSlotsByKey = useCallback((slotKeys: string[]) => {
    if (slotKeys.length === 0) {
      return;
    }
    adoptMutation.mutate(slotKeys);
  }, [adoptMutation]);

  const keepSlotsByKey = useCallback((slotKeys: string[]) => {
    if (slotKeys.length === 0) {
      return;
    }
    keepMutation.mutate(slotKeys);
  }, [keepMutation]);

  const adoptAllDrifted = useCallback(() => {
    if (!reconcile) {
      return;
    }
    adoptSlotsByKey(
      reconcile.items
        .filter((item) => item.state === "drifted" || item.state === "orphaned")
        .map((item) => item.key),
    );
  }, [adoptSlotsByKey, reconcile]);

  const keepAllDrifted = useCallback(() => {
    if (!reconcile) {
      return;
    }
    keepSlotsByKey(
      reconcile.items
        .filter((item) => item.state === "drifted")
        .map((item) => item.key),
    );
  }, [keepSlotsByKey, reconcile]);

  return {
    activeNovelId,
    adoptAllDrifted,
    adoptMutation,
    adoptSlotsByKey,
    changeSlotDraft,
    dirtySlotKeys,
    draftState: {
      prompt,
      scope,
      novelId: selectedNovelId,
      drafts,
      dirtySlotKeys,
      isDirty: dirtySlotKeys.length > 0,
    },
    drafts,
    globalSlotMap,
    hasDirtyDrafts: dirtySlotKeys.length > 0,
    invalidateReconcile,
    isNovelScopeDisabled,
    keepAllDrifted,
    keepMutation,
    keepSlotsByKey,
    novelSlotMap,
    novels: novelsQuery.data?.data?.items ?? [],
    novelsQuery,
    overrideQuery,
    reconcile,
    reconcileMap,
    reconcilePending: adoptMutation.isPending || keepMutation.isPending,
    reconcileQuery,
    resetDrafts,
    resetMutation,
    resetSlot,
    saveDrafts,
    saveError,
    saveMutation,
    scope,
    sections,
    selectedNovelId,
    setScope,
    setSelectedNovelId,
    setShowReconcile,
    showReconcile,
  };
}
