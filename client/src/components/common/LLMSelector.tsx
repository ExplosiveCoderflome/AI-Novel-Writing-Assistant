import { useEffect, useMemo } from "react";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { useQuery } from "@tanstack/react-query";
import { getAPIKeySettings, type APIKeyStatus } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLLMStore } from "@/store/llmStore";
import SearchableSelect from "./SearchableSelect";

interface LLMSelectorValue {
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
}

function sanitizeModelList(models: unknown): string[] {
  if (!Array.isArray(models)) {
    return [];
  }
  return Array.from(
    new Set(
      models
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function resolveModel(currentModel: string, models: string[]): string {
  const normalizedCurrent = currentModel.trim();
  if (normalizedCurrent) {
    return normalizedCurrent;
  }
  return models[0] ?? "";
}

function clampTemperature(value: number): number {
  return Math.min(2, Math.max(0, value));
}

function clampMaxTokens(value: number): number {
  return Math.min(32768, Math.max(256, Math.floor(value)));
}

function isRunnableProvider(config: APIKeyStatus): boolean {
  const models = sanitizeModelList([config.currentModel, ...(config.models ?? [])]);
  return config.isConfigured && config.isActive && models.length > 0;
}

export default function LLMSelector({
  value,
  onChange,
  showModel = true,
  showParameters = false,
}: LLMSelectorProps) {
  const store = useLLMStore();
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

  const providerConfigs = useMemo(
    () => (apiKeySettingsQuery.data?.data ?? []).filter(isRunnableProvider),
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
      [config.provider, sanitizeModelList([config.currentModel, ...config.models])] as const
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

  const updateValue = (next: LLMSelectorValue) => {
    const normalizedModel = resolveModel(next.model, providerModelsMap[next.provider] ?? []);
    const normalizedNext: LLMSelectorValue = {
      ...next,
      model: normalizedModel,
    };
    if (onChange) {
      onChange(normalizedNext);
      return;
    }
    if (store.provider !== normalizedNext.provider) {
      store.setProvider(normalizedNext.provider);
    }
    store.setModel(normalizedNext.model);
    if (normalizedNext.temperature !== undefined) {
      store.setTemperature(clampTemperature(normalizedNext.temperature));
    }
    store.setMaxTokens(
      normalizedNext.maxTokens !== undefined ? clampMaxTokens(normalizedNext.maxTokens) : undefined,
    );
  };

  useEffect(() => {
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
  ]);

  const onProviderChange = (provider: string) => {
    const typedProvider = provider as LLMProvider;
    const nextModel = resolveModel("", providerModelsMap[typedProvider] ?? []);
    updateValue({
      provider: typedProvider,
      model: nextModel,
      temperature: resolvedTemperature,
      maxTokens: resolvedMaxTokens,
    });
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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">模型</Badge>
        <Select
          value={hasRunnableProviders ? effectiveProvider : undefined}
          onValueChange={onProviderChange}
          disabled={!hasRunnableProviders}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={hasRunnableProviders ? "选择厂商" : "请先配置可用厂商"} />
          </SelectTrigger>
          <SelectContent>
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
            className="w-[240px]"
            disabled={!hasRunnableProviders}
          />
        ) : null}
      </div>

      {!hasRunnableProviders && !apiKeySettingsQuery.isLoading ? (
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
