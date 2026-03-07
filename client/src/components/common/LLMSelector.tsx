import { useMemo } from "react";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getLLMProviders } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { providerModelMap, useLLMStore } from "@/store/llmStore";

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
    if (!data || Object.keys(data).length === 0) {
      return Object.keys(providerModelMap) as LLMProvider[];
    }
    return Object.keys(data) as LLMProvider[];
  }, [data]);

  const models = useMemo(() => {
    const providerData = data?.[currentValue.provider];
    if (providerData?.models?.length) {
      return providerData.models;
    }
    return providerModelMap[currentValue.provider] ?? [];
  }, [currentValue.provider, data]);

  const updateValue = (next: LLMSelectorValue) => {
    if (onChange) {
      onChange(next);
      return;
    }
    store.setProvider(next.provider);
    store.setModel(next.model);
    if (next.temperature !== undefined) {
      store.setTemperature(clampTemperature(next.temperature));
    }
    if (next.maxTokens !== undefined) {
      store.setMaxTokens(clampMaxTokens(next.maxTokens));
    }
  };

  const onProviderChange = (provider: string) => {
    const typedProvider = provider as LLMProvider;
    const nextModel = (data?.[typedProvider]?.models?.[0] ?? providerModelMap[typedProvider]?.[0]) ?? "";
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
          <SelectTrigger className="w-[150px]">
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
          <Select value={currentValue.model} onValueChange={onModelChange}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="选择模型" />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <span className="text-muted-foreground">最大 Tokens (256~32768)</span>
            <Input
              type="number"
              step="1"
              min={256}
              max={32768}
              value={resolvedMaxTokens}
              onChange={(event) => {
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
