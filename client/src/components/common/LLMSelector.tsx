import { useEffect, useMemo } from "react";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { useQuery } from "@tanstack/react-query";
import { getLLMProviders } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getProviderFallbackModels, providerModelMap, useLLMStore } from "@/store/llmStore";
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

type ProviderResponse = Record<
  string,
  {
    name: string;
    models: string[];
    defaultModel: string;
  }
>;

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

function resolveModel(provider: LLMProvider, currentModel: string, models: string[]): string {
  const normalizedCurrent = currentModel.trim();
  if (normalizedCurrent) {
    return normalizedCurrent;
  }
  return models[0] ?? getProviderFallbackModels(provider)[0] ?? "";
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

  const { data } = useQuery({
    queryKey: queryKeys.llm.providers,
    queryFn: async () => {
      const response = await getLLMProviders();
      return (response.data ?? {}) as ProviderResponse;
    },
    staleTime: 5 * 60 * 1000,
  });

  const providerOptions = useMemo(() => {
    const builtInProviders = Object.keys(providerModelMap);
    const apiProviders = data ? Object.keys(data) : [];
    return Array.from(
      new Set([currentValue.provider, ...apiProviders, ...builtInProviders].filter((provider) => {
        return typeof provider === "string" && provider.trim().length > 0;
      })),
    ) as LLMProvider[];
  }, [currentValue.provider, data]);

  const providerModelsMap = useMemo(() => {
    const entries = providerOptions.map((provider) => {
      const providerData = data?.[provider] as ProviderResponse[string] | undefined;
      const fromApi = sanitizeModelList(providerData?.models);
      const fallbackModels = getProviderFallbackModels(provider);
      const mergedModels = fromApi.length > 0
        ? fromApi
        : sanitizeModelList([
          providerData?.defaultModel ?? "",
          ...fallbackModels,
        ]);
      return [provider, mergedModels] as const;
    });
    return Object.fromEntries(entries) as Record<string, string[]>;
  }, [data, providerOptions]);

  const models = useMemo(() => {
    const providerModels = providerModelsMap[currentValue.provider] ?? [];
    const currentModel = currentValue.model.trim();
    if (!currentModel || providerModels.includes(currentModel)) {
      return providerModels;
    }
    return [currentModel, ...providerModels];
  }, [currentValue.model, currentValue.provider, providerModelsMap]);

  const resolvedModel = useMemo(
    () => resolveModel(currentValue.provider, currentValue.model, models),
    [currentValue.model, currentValue.provider, models],
  );

  const updateValue = (next: LLMSelectorValue) => {
    const normalizedModel = resolveModel(
      next.provider,
      next.model,
      providerModelsMap[next.provider] ?? getProviderFallbackModels(next.provider),
    );
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
    if (resolvedModel === currentValue.model) {
      return;
    }
    updateValue({
      provider: currentValue.provider,
      model: resolvedModel,
      temperature: resolvedTemperature,
      maxTokens: resolvedMaxTokens,
    });
  }, [
    currentValue.model,
    currentValue.provider,
    resolvedMaxTokens,
    resolvedModel,
    resolvedTemperature,
  ]);

  const onProviderChange = (provider: string) => {
    const typedProvider = provider as LLMProvider;
    const nextModels = providerModelsMap[typedProvider] ?? getProviderFallbackModels(typedProvider);
    const nextModel = resolveModel(typedProvider, currentValue.model, nextModels);
    updateValue({
      provider: typedProvider,
      model: nextModel,
      temperature: resolvedTemperature,
      maxTokens: resolvedMaxTokens,
    });
  };

  const onModelChange = (model: string) => {
    updateValue({
      provider: currentValue.provider,
      model,
      temperature: resolvedTemperature,
      maxTokens: resolvedMaxTokens,
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">模型</Badge>
        <Select value={currentValue.provider} onValueChange={onProviderChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="选择 Provider" />
          </SelectTrigger>
          <SelectContent>
            {providerOptions.map((provider) => (
              <SelectItem key={provider} value={provider}>
                {data?.[provider]?.name ?? provider}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {showModel ? (
          <SearchableSelect
            value={resolvedModel}
            onValueChange={onModelChange}
            options={models.map((model) => ({ value: model }))}
            placeholder="选择模型"
            searchPlaceholder="搜索模型"
            emptyText="没有匹配的模型"
            className="w-[240px]"
          />
        ) : null}
      </div>

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
                  provider: currentValue.provider,
                  model: currentValue.model,
                  temperature: parsed,
                  maxTokens: resolvedMaxTokens,
                });
              }}
              onBlur={() => {
                updateValue({
                  provider: currentValue.provider,
                  model: currentValue.model,
                  temperature: clampTemperature(resolvedTemperature),
                  maxTokens: resolvedMaxTokens,
                });
              }}
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
              onChange={(event) => {
                if (!event.target.value.trim()) {
                  updateValue({
                    provider: currentValue.provider,
                    model: currentValue.model,
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
                  provider: currentValue.provider,
                  model: currentValue.model,
                  temperature: resolvedTemperature,
                  maxTokens: parsed,
                });
              }}
              onBlur={() => {
                if (resolvedMaxTokens === undefined) {
                  updateValue({
                    provider: currentValue.provider,
                    model: currentValue.model,
                    temperature: resolvedTemperature,
                    maxTokens: undefined,
                  });
                  return;
                }
                updateValue({
                  provider: currentValue.provider,
                  model: currentValue.model,
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
