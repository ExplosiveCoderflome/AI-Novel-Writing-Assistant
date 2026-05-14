import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAPIKeySettings, getLLMSelectionSetting, saveLLMSelectionSetting } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { resolvePreferredLLMSelection } from "@/lib/llmSelection";
import { useLLMStore } from "@/store/llmStore";

export default function LLMSelectionBootstrap() {
  const store = useLLMStore();
  const queryClient = useQueryClient();
  const selectionQuery = useQuery({
    queryKey: queryKeys.settings.llmSelection,
    queryFn: getLLMSelectionSetting,
    staleTime: 5 * 60 * 1000,
  });
  const apiKeySettingsQuery = useQuery({
    queryKey: queryKeys.settings.apiKeys,
    queryFn: getAPIKeySettings,
    staleTime: 5 * 60 * 1000,
  });

  const saveSelectionMutation = useMutation({
    mutationFn: saveLLMSelectionSetting,
    onSuccess: (response) => {
      queryClient.setQueryData(queryKeys.settings.llmSelection, response);
    },
  });

  const resolvedSelection = useMemo(() => {
    if (store.hasHydratedSelection) {
      return null;
    }
    if (!selectionQuery.isSuccess && !selectionQuery.isError) {
      return null;
    }
    const savedSelection = selectionQuery.data?.data ?? null;
    if (!apiKeySettingsQuery.isSuccess && !apiKeySettingsQuery.isError) {
      return null;
    }
    if (savedSelection && apiKeySettingsQuery.isError) {
      return savedSelection;
    }
    return resolvePreferredLLMSelection(
      savedSelection,
      apiKeySettingsQuery.data?.data ?? [],
      {
        temperature: store.temperature,
        maxTokens: store.maxTokens,
      },
    );
  }, [
    apiKeySettingsQuery.data?.data,
    apiKeySettingsQuery.isError,
    apiKeySettingsQuery.isSuccess,
    selectionQuery.data?.data,
    selectionQuery.isError,
    selectionQuery.isSuccess,
    store.hasHydratedSelection,
    store.maxTokens,
    store.temperature,
  ]);

  useEffect(() => {
    if (store.hasHydratedSelection || !resolvedSelection) {
      return;
    }
    store.setSelection(resolvedSelection);
    const savedSelection = selectionQuery.data?.data ?? null;
    if (
      !savedSelection
      || savedSelection.provider !== resolvedSelection.provider
      || savedSelection.model !== resolvedSelection.model
      || savedSelection.temperature !== resolvedSelection.temperature
      || savedSelection.maxTokens !== resolvedSelection.maxTokens
    ) {
      saveSelectionMutation.mutate(resolvedSelection);
    }
  }, [resolvedSelection, saveSelectionMutation, selectionQuery.data?.data, store]);

  return null;
}
