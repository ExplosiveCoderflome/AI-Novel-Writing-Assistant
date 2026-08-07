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
        <div className="text-xs text-muted-foreground">service provider</div>
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
            <SelectValue placeholder="Choose a service provider" />
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
        <div className="text-xs text-muted-foreground">Model</div>
        <SearchableSelect
          value={draft.model || undefined}
          onValueChange={(value) => onPatch({ model: value })}
          options={modelOptions.map((model) => ({ value: model }))}
          placeholder="Select model"
          searchPlaceholder="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
          emptyText={modelEmptyText}
        />
        <Input
          value={draft.model}
          placeholder={manualModelPlaceholder}
          onChange={(event) => onPatch({ model: event.target.value })}
        />
      </div>

      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">temperature</div>
        <Input
          value={draft.temperature}
          placeholder={temperaturePlaceholder}
          onChange={(event) => onPatch({ temperature: event.target.value })}
        />
      </div>

      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">Maximum output length</div>
        <Input
          value={draft.maxTokens}
          placeholder={maxTokensPlaceholder}
          onChange={(event) => onPatch({ maxTokens: event.target.value })}
        />
      </div>

      {showProtocolFields ? (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">request protocol</div>
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
              <SelectValue placeholder="automatic selection" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">automatic selection</SelectItem>
              <SelectItem value="openai_compatible">OpenAI compatible</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {showProtocolFields ? (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">structured format</div>
          <Select
            value={draft.structuredResponseFormat}
            onValueChange={(value) => onPatch({
              structuredResponseFormat: value as ModelRouteStructuredResponseFormat,
            })}
          >
            <SelectTrigger>
              <SelectValue placeholder="automatic selection" />
            </SelectTrigger>
            <SelectContent>
              {getStructuredResponseFormatOptions(draft.requestProtocol).map((format) => (
                <SelectItem key={format} value={format}>
                  {format === "auto" ? "Auto-select" : format}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
