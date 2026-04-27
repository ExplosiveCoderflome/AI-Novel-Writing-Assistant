import type { APIKeyStatus } from "@/api/settings";
import SearchableSelect from "@/components/common/SearchableSelect";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getModelOptions,
  getPreferredModel,
  getProviderConfig,
  getProviderDisplayName,
  getStructuredResponseFormatOptions,
  type RouteDraft,
} from "./modelRoutes.utils";
import type {
  ModelRouteRequestProtocol,
  ModelRouteStructuredResponseFormat,
} from "@ai-novel/shared/types/novel";

interface ModelRouteFieldsProps {
  draft: RouteDraft;
  providerConfigs: APIKeyStatus[];
  providerOptions: string[];
  onPatch: (patch: Partial<RouteDraft>) => void;
  temperaturePlaceholder: string;
  maxTokensPlaceholder: string;
  modelEmptyText: string;
  manualModelPlaceholder: string;
  showProtocolFields?: boolean;
}

export default function ModelRouteFields({
  draft,
  providerConfigs,
  providerOptions,
  onPatch,
  temperaturePlaceholder,
  maxTokensPlaceholder,
  modelEmptyText,
  manualModelPlaceholder,
  showProtocolFields = true,
}: ModelRouteFieldsProps) {
  const modelOptions = getModelOptions(providerConfigs, draft.provider, draft.model);

  return (
    <div className={`grid gap-3 ${showProtocolFields ? "md:grid-cols-6" : "md:grid-cols-4"}`}>
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">服务商</div>
        <Select
          value={draft.provider}
          onValueChange={(value) => {
            const nextModel = getPreferredModel(getProviderConfig(providerConfigs, value));
            onPatch({
              provider: value,
              model: nextModel || draft.model,
            });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择服务商" />
          </SelectTrigger>
          <SelectContent>
            {providerOptions.map((provider) => (
              <SelectItem key={provider} value={provider}>
                {getProviderDisplayName(providerConfigs, provider)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">模型</div>
        <SearchableSelect
          value={draft.model || undefined}
          onValueChange={(value) => onPatch({ model: value })}
          options={modelOptions.map((model) => ({ value: model }))}
          placeholder="选择模型"
          searchPlaceholder="搜索模型"
          emptyText={modelEmptyText}
        />
        <Input
          value={draft.model}
          placeholder={manualModelPlaceholder}
          onChange={(event) => onPatch({ model: event.target.value })}
        />
      </div>

      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">温度</div>
        <Input
          value={draft.temperature}
          placeholder={temperaturePlaceholder}
          onChange={(event) => onPatch({ temperature: event.target.value })}
        />
      </div>

      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">最大输出长度</div>
        <Input
          value={draft.maxTokens}
          placeholder={maxTokensPlaceholder}
          onChange={(event) => onPatch({ maxTokens: event.target.value })}
        />
      </div>

      {showProtocolFields ? (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">请求协议</div>
          <Select
            value={draft.requestProtocol}
            onValueChange={(value) => {
              const nextProtocol = value as ModelRouteRequestProtocol;
              onPatch({
                requestProtocol: nextProtocol,
                ...(nextProtocol === "anthropic"
                  ? { structuredResponseFormat: "prompt_json" as ModelRouteStructuredResponseFormat }
                  : {}),
              });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="自动选择" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">自动选择</SelectItem>
              <SelectItem value="openai_compatible">OpenAI 兼容</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {showProtocolFields ? (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">结构化格式</div>
          <Select
            value={draft.structuredResponseFormat}
            onValueChange={(value) => onPatch({
              structuredResponseFormat: value as ModelRouteStructuredResponseFormat,
            })}
          >
            <SelectTrigger>
              <SelectValue placeholder="自动选择" />
            </SelectTrigger>
            <SelectContent>
              {getStructuredResponseFormatOptions(draft.requestProtocol).map((format) => (
                <SelectItem key={format} value={format}>
                  {format === "auto" ? "自动选择" : format}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
