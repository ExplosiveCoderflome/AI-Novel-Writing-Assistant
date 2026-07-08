import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  applyOfficialSlots,
  deleteSlotOverride,
  keepMySlots,
  saveSlotOverride,
  type PromptCatalogItem,
  type PromptSlotOverrideScope,
} from "@/api/promptWorkbench";
import { queryKeys } from "@/api/queryKeys";

interface UsePromptSlotPersistenceInput {
  prompt: PromptCatalogItem | null;
  scope: PromptSlotOverrideScope;
  activeNovelId: string;
  overrideParamsKey: string;
  reconcileParamsKey: string;
  onSaved?: () => void;
  onReset?: () => void;
}

export function buildOverrideParamsKey(promptId: string, novelId: string): string {
  return JSON.stringify({ promptId, novelId: novelId || undefined });
}

export function buildReconcileParamsKey(
  promptId: string,
  scope: PromptSlotOverrideScope,
  novelId: string,
): string {
  return JSON.stringify({ promptId, scope, novelId: novelId || undefined });
}

export function usePromptSlotPersistence(input: UsePromptSlotPersistenceInput) {
  const queryClient = useQueryClient();
  const {
    activeNovelId,
    overrideParamsKey,
    prompt,
    reconcileParamsKey,
    scope,
    onReset,
    onSaved,
  } = input;

  const invalidateOverride = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.promptWorkbench.slotOverrides(overrideParamsKey),
    });
  }, [overrideParamsKey, queryClient]);

  const invalidateReconcile = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.promptWorkbench.slotReconcile(reconcileParamsKey),
    });
  }, [queryClient, reconcileParamsKey]);

  const saveMutation = useMutation({
    mutationFn: (updates: Record<string, unknown>) => {
      if (!prompt) {
        throw new Error("请选择提示词后再保存。");
      }
      return saveSlotOverride({
        scope,
        novelId: scope === "novel" ? activeNovelId : null,
        promptId: prompt.id,
        slotUpdates: updates,
      });
    },
    onSuccess: () => {
      onSaved?.();
      invalidateOverride();
      invalidateReconcile();
    },
  });

  const resetMutation = useMutation({
    mutationFn: (slotKeys: string[]) => {
      if (!prompt) {
        throw new Error("请选择提示词后再重置。");
      }
      return deleteSlotOverride({
        scope,
        novelId: scope === "novel" ? activeNovelId : null,
        promptId: prompt.id,
        slotKeys,
      });
    },
    onSuccess: () => {
      onReset?.();
      invalidateOverride();
      invalidateReconcile();
    },
  });

  const adoptMutation = useMutation({
    mutationFn: (slotKeys: string[]) => {
      if (!prompt) {
        throw new Error("请选择提示词后再处理更新。");
      }
      return applyOfficialSlots({
        promptId: prompt.id,
        scope,
        novelId: scope === "novel" ? activeNovelId : null,
        slotKeys,
      });
    },
    onSuccess: () => {
      invalidateOverride();
      invalidateReconcile();
    },
  });

  const keepMutation = useMutation({
    mutationFn: (slotKeys: string[]) => {
      if (!prompt) {
        throw new Error("请选择提示词后再处理更新。");
      }
      return keepMySlots({
        promptId: prompt.id,
        scope,
        novelId: scope === "novel" ? activeNovelId : null,
        slotKeys,
      });
    },
    onSuccess: () => {
      invalidateOverride();
      invalidateReconcile();
    },
  });

  return {
    saveMutation,
    resetMutation,
    adoptMutation,
    keepMutation,
    invalidateOverride,
    invalidateReconcile,
  };
}
