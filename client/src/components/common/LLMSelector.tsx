import { useCallback, useEffect, useMemo, useRef } from "react";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import {
  type APIKeyStatus,
  getAPIKeySettings,
  refreshProviderModelList,
  saveLLMSelectionSetting,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  getProviderSelectionModels,
  isRunnableProviderConfig,
  resolveModel,
} from "@/lib/llmSelection";
import { useLLMStore } from "@/store/llmStore";
import SearchableSelect from "./SearchableSelect";

const NO_PROVIDER_VALUE = "__no_runnable_provider__";

export interface LLMSelectorValue {
  provider: LLMProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

interface LLMSelectorProps {
  value?: LLMSelectorValue;
  onChange?: (value: LLMSelectorValue) => void;
  showModel?: boolean;
  showParameters?: boolean;
  compact?: boolean;
  showBadge?: boolean;
  showHelperText?: boolean;
  className?: string;
}

function clampTemperature(value: number): number {
  return Math.min(2, Math.max(0, value));
}

function clampMaxTokens(value: number): number {
  return Math.min(32768, Math.max(256, Math.floor(value)));
}

export default function LLMSelector({
  value,
  onChange,
  showModel = true,
  showParameters = false,
  compact = false,
  showBadge = true,
  showHelperText = true,
  className,
}: LLMSelectorProps) {
  const store = useLLMStore();
  const queryClient = useQueryClient();
  const latestProviderRefreshRef = useRef<LLMProvider | null>(null);
  const currentValue = value ?? {
    provider: store.provider,
    model: store.model,
    temperature: store.temperature,
    maxTokens: store.maxTokens,
  };

  const resolvedTemperature = currentValue.temperature ?? store.temperature;
  const resolvedMaxTokens = currentValue.maxTokens ?? store.maxTokens;

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

  const refreshProviderModelsMutation = useMutation({
    mutationFn: refreshProviderModelList,
    onSuccess: (response) => {
      const refreshed = response.data;
      if (!refreshed) {
        return;
      }
      queryClient.setQueryData<ApiResponse<APIKeyStatus[]>>(
        queryKeys.settings.apiKeys,
        (previous) => {
          if (!previous?.data) {
            return previous;
          }
          return {
            ...previous,
            data: previous.data.map((item) => {
              if (item.provider !== refreshed.provider) {
                return item;
              }
              return {
                ...item,
                currentModel: refreshed.currentModel,
                models: Array.from(new Set([
                  refreshed.currentModel,
                  ...refreshed.models,
                ].filter(Boolean))),
              };
            }),
          };
        },
      );
    },
  });

  const providerConfigs = useMemo(
    () => (apiKeySettingsQuery.data?.data ?? []).filter(isRunnableProviderConfig),
    [apiKeySettingsQuery.data?.data],
  );

  const providerOptions = useMemo(
    () => providerConfigs.map((item) => item.provider),
    [providerConfigs],
  );

  const providerNameMap = useMemo(
    () => new Map(providerConfigs.map((item) => [item.provider, item.displayName ?? item.name])),
    [providerConfigs],
  );

  const providerModelsMap = useMemo(() => {
    const entries = providerConfigs.map((config) => (
      [config.provider, getProviderSelectionModels(config)] as const
    ));
    return Object.fromEntries(entries) as Record<string, string[]>;
  }, [providerConfigs]);

  const hasRunnableProviders = providerOptions.length > 0;

  const effectiveProvider = useMemo(() => {
    if (providerOptions.includes(currentValue.provider)) {
      return currentValue.provider;
    }
    return providerOptions[0] ?? currentValue.provider;
  }, [currentValue.provider, providerOptions]);

  const models = useMemo(() => {
    const providerModels = providerModelsMap[effectiveProvider] ?? [];
    const currentModel = currentValue.model.trim();
    if (!currentModel || providerModels.includes(currentModel)) {
      return providerModels;
    }
    return [currentModel, ...providerModels];
  }, [currentValue.model, effectiveProvider, providerModelsMap]);

  const resolvedModel = useMemo(
    () => resolveModel(currentValue.model, models),
    [currentValue.model, models],
  );
  const providerSelectValue = hasRunnableProviders ? effectiveProvider : NO_PROVIDER_VALUE;
  const shouldWaitForGlobalHydration = !value && !onChange && !store.hasHydratedSelection;

  const updateValue = useCallback((next: LLMSelectorValue) => {
    const normalizedModel = resolveModel(next.model, providerModelsMap[next.provider] ?? []);
    const normalizedTemperature = next.temperature !== undefined
      ? clampTemperature(next.temperature)
      : undefined;
    const normalizedMaxTokens = next.maxTokens !== undefined
      ? clampMaxTokens(next.maxTokens)
      : undefined;
    const normalizedNext: LLMSelectorValue = {
      ...next,
      model: normalizedModel,
      temperature: normalizedTemperature,
      maxTokens: normalizedMaxTokens,
    };
    if (onChange) {
      onChange(normalizedNext);
      return;
    }
    store.setSelection({
      provider: normalizedNext.provider,
      model: normalizedNext.model,
      temperature: normalizedNext.temperature,
      maxTokens: normalizedNext.maxTokens,
    });
    saveSelectionMutation.mutate({
      provider: normalizedNext.provider,
      model: normalizedNext.model,
      temperature: normalizedNext.temperature ?? store.temperature,
      ...(normalizedNext.maxTokens !== undefined ? { maxTokens: normalizedNext.maxTokens } : {}),
    });
  }, [onChange, providerModelsMap, saveSelectionMutation, store]);

  useEffect(() => {
    if (shouldWaitForGlobalHydration) {
      return;
    }
    if (!hasRunnableProviders) {
      return;
    }
    if (effectiveProvider === currentValue.provider && resolvedModel === currentValue.model) {
      return;
    }
    updateValue({
      provider: effectiveProvider,
      model: resolvedModel,
      temperature: resolvedTemperature,
      maxTokens: resolvedMaxTokens,
    });
  }, [
    currentValue.model,
    currentValue.provider,
    effectiveProvider,
    hasRunnableProviders,
    resolvedMaxTokens,
    resolvedModel,
    resolvedTemperature,
    shouldWaitForGlobalHydration,
    updateValue,
  ]);

  const onProviderChange = (provider: string) => {
    if (provider === NO_PROVIDER_VALUE) {
      return;
    }
    const typedProvider = provider as LLMProvider;
    const nextModel = resolveModel("", providerModelsMap[typedProvider] ?? []);
    updateValue({
      provider: typedProvider,
      model: nextModel,
      temperature: resolvedTemperature,
      maxTokens: resolvedMaxTokens,
    });
    latestProviderRefreshRef.current = typedProvider;
    void refreshProviderModelsMutation.mutateAsync(typedProvider).then((response) => {
      if (latestProviderRefreshRef.current !== typedProvider) {
        return;
      }
      const refreshed = response.data;
      if (!refreshed?.models.length && !refreshed?.currentModel) {
        return;
      }
      updateValue({
        provider: typedProvider,
        model: resolveModel(refreshed.currentModel, refreshed.models),
        temperature: resolvedTemperature,
        maxTokens: resolvedMaxTokens,
      });
    }).catch(() => undefined);
  };

  const onModelChange = (model: string) => {
    updateValue({
      provider: effectiveProvider,
      model,
      temperature: resolvedTemperature,
      maxTokens: resolvedMaxTokens,
    });
  };

  return (
    <div className={cn("space-y-2", compact && "space-y-1", className)}>
      <div className={cn("flex min-w-0 items-center gap-2", compact ? "flex-nowrap gap-1.5" : "flex-wrap")}>
        {showBadge ? <Badge variant="secondary">模型</Badge> : null}
        <Select
          value={providerSelectValue}
          onValueChange={onProviderChange}
          disabled={!hasRunnableProviders}
        >
          <SelectTrigger className={cn(compact ? "h-9 w-[148px] lg:w-[164px]" : "w-full sm:w-[180px]")}>
            <SelectValue placeholder={hasRunnableProviders ? "选择厂商" : "请先配置可用厂商"} />
          </SelectTrigger>
          <SelectContent>
            {!hasRunnableProviders ? (
              <SelectItem value={NO_PROVIDER_VALUE} disabled>
                请先配置可用厂商
              </SelectItem>
            ) : null}
            {providerOptions.map((provider) => (
              <SelectItem key={provider} value={provider}>
                {providerNameMap.get(provider) ?? provider}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showModel ? (
          <SearchableSelect
            value={resolvedModel}
            onValueChange={onModelChange}
            options={models.map((model) => ({ value: model }))}
            placeholder={hasRunnableProviders ? "选择模型" : "暂无可用模型"}
            searchPlaceholder="搜索模型"
            emptyText="没有可用模型"
            className={cn(compact ? "w-[184px] lg:w-[220px]" : "w-full sm:w-[240px]")}
            triggerClassName={compact ? "h-9 px-2.5" : undefined}
            disabled={!hasRunnableProviders}
          />
        ) : null}
      </div>

      {showHelperText && !hasRunnableProviders && !apiKeySettingsQuery.isLoading ? (
        <div className="text-xs text-muted-foreground">
          当前没有已配置且启用的模型厂商，请先到系统设置里完成 API Key 和模型配置。
        </div>
      ) : null}

      {showParameters ? (
        <div className="grid gap-2 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">温度 (0~2)</span>
            <Input
              type="number"
              step="0.1"
              min={0}
              max={2}
              value={resolvedTemperature}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                updateValue({
                  provider: effectiveProvider,
                  model: resolvedModel,
                  temperature: parsed,
                  maxTokens: resolvedMaxTokens,
                });
              }}
              onBlur={() => {
                updateValue({
                  provider: effectiveProvider,
                  model: resolvedModel,
                  temperature: clampTemperature(resolvedTemperature),
                  maxTokens: resolvedMaxTokens,
                });
              }}
              disabled={!hasRunnableProviders}
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">最大 Tokens (留空 = 不限制)</span>
            <Input
              type="number"
              step="1"
              min={256}
              max={32768}
              value={resolvedMaxTokens ?? ""}
              disabled={!hasRunnableProviders}
              onChange={(event) => {
                if (!event.target.value.trim()) {
                  updateValue({
                    provider: effectiveProvider,
                    model: resolvedModel,
                    temperature: resolvedTemperature,
                    maxTokens: undefined,
                  });
                  return;
                }
                const parsed = Number(event.target.value);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                updateValue({
                  provider: effectiveProvider,
                  model: resolvedModel,
                  temperature: resolvedTemperature,
                  maxTokens: parsed,
                });
              }}
              onBlur={() => {
                if (resolvedMaxTokens === undefined) {
                  updateValue({
                    provider: effectiveProvider,
                    model: resolvedModel,
                    temperature: resolvedTemperature,
                    maxTokens: undefined,
                  });
                  return;
                }
                updateValue({
                  provider: effectiveProvider,
                  model: resolvedModel,
                  temperature: resolvedTemperature,
                  maxTokens: clampMaxTokens(resolvedMaxTokens),
                });
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
