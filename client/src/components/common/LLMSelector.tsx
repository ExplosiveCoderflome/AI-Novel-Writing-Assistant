import { useMemo } from "react";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getLLMProviders } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { providerModelMap, useLLMStore } from "@/store/llmStore";

interface LLMSelectorValue {
  provider: LLMProvider;
  model: string;
}

interface LLMSelectorProps {
  value?: LLMSelectorValue;
  onChange?: (value: LLMSelectorValue) => void;
  showModel?: boolean;
}

type ProviderResponse = Record<
  string,
  {
    name: string;
    models: string[];
    defaultModel: string;
  }
>;

export default function LLMSelector({ value, onChange, showModel = true }: LLMSelectorProps) {
  const store = useLLMStore();
  const currentValue = value ?? {
    provider: store.provider,
    model: store.model,
  };

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
  };

  const onProviderChange = (provider: string) => {
    const typedProvider = provider as LLMProvider;
    const nextModel = (data?.[typedProvider]?.models?.[0] ?? providerModelMap[typedProvider]?.[0]) ?? "";
    updateValue({
      provider: typedProvider,
      model: nextModel,
    });
  };

  const onModelChange = (model: string) => {
    updateValue({
      provider: currentValue.provider,
      model,
    });
  };

  return (
    <div className="flex items-center gap-2">
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
  );
}
