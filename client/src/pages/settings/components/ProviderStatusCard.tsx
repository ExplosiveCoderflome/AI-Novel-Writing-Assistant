import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { APIKeyStatus, ProviderBalanceStatus } from "@/api/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import { ProviderRequestLimitSummary } from "./ProviderRequestLimitFields";
import { formatBalanceAmount, formatBalanceTime } from "../settingsFormatters";

export interface ProviderCardViewModel {
  provider: APIKeyStatus;
  balance?: ProviderBalanceStatus;
  isBalanceLoading: boolean;
  isBalanceRefreshing: boolean;
  canRefreshBalance: boolean;
  isReasoningUpdating: boolean;
  isTesting: boolean;
  testResult?: string;
}

function getBalanceSummary(input: {
  provider: APIKeyStatus;
  balance?: ProviderBalanceStatus;
  isBalanceLoading: boolean;
}) {
  const { provider, balance, isBalanceLoading } = input;
  if (provider.kind === "custom") {
    return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  if (isBalanceLoading) {
    return "Checking balance...";
  }
  if (balance?.status === "available") {
    return `余额 ${formatBalanceAmount(balance.availableBalance, balance.currency)}`;
  }
  return balance?.error ?? balance?.message ?? (provider.isConfigured ? "Balance information is currently not available." : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.");
}

export default function ProviderStatusCard(props: {
  item: ProviderCardViewModel;
  onOpenConfig: (provider: LLMProvider) => void;
  onTest: (provider: APIKeyStatus) => void;
  onRefreshModels: (provider: LLMProvider) => void;
  onRefreshBalance: (provider: LLMProvider) => void;
  onToggleReasoning: (provider: LLMProvider, reasoningEnabled: boolean) => void;
  isRefreshingModels: boolean;
}) {
  const {
    item,
    onOpenConfig,
    onTest,
    onRefreshModels,
    onRefreshBalance,
    onToggleReasoning,
    isRefreshingModels,
  } = props;
  const { provider, balance } = item;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const imageModelLabel = provider.supportsImageGeneration
    ? provider.currentImageModel || provider.defaultImageModel || "not set"
    : "Image generation is not supported";
  const visibleModels = modelsOpen ? provider.models : provider.models.slice(0, 8);
  const canUseProvider = provider.isConfigured && provider.isActive && Boolean(provider.currentModel);
  const testDisabledReason = provider.isConfigured ? "" : "After configuring the API Key, you can test the connection.";
  const refreshDisabledReason = provider.isConfigured ? "" : "After configuring the API Key, you can refresh the model list.";

  return (
    <div
      className={cn(
        "min-w-0 rounded-md border p-3 transition-colors",
        canUseProvider ? "border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-border",
      )}
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className={`font-medium ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{provider.name}</div>
            {provider.kind === "custom" ? <Badge variant="outline">Customize</Badge> : null}
          </div>
          <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {canUseProvider ? "Can be used for creative tasks." : "After completing the configuration, it can be used for creative tasks."}
          </div>
        </div>
        <Badge
          variant={canUseProvider ? "default" : "outline"}
          className={canUseProvider ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}
        >
          {canUseProvider ? "Available" : provider.isConfigured ? "configured" : "Not configured"}
        </Badge>
      </div>

      <div className="mb-3 grid min-w-0 gap-2 text-sm md:grid-cols-2">
        <div className="min-w-0 rounded-md border bg-background/70 p-2">
          <div className="text-xs text-muted-foreground">text model</div>
          <div className={`mt-1 font-medium ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {provider.currentModel || "-"}
          </div>
        </div>
        <div className="min-w-0 rounded-md border bg-background/70 p-2">
          <div className="text-xs text-muted-foreground">image model</div>
          <div className={`mt-1 font-medium ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {imageModelLabel}
          </div>
        </div>
      </div>

      <div className={`mb-3 rounded-md border border-dashed bg-background/70 p-3 text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
        {getBalanceSummary({
          provider,
          balance,
          isBalanceLoading: item.isBalanceLoading,
        })}
      </div>

      {item.testResult ? (
        <div className={`mb-3 rounded-md border bg-background/70 p-3 text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
          {item.testResult}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button size="sm" className="w-full sm:w-auto" onClick={() => onOpenConfig(provider.provider)}>
          {provider.kind === "custom" ? "edit" : "Configuration"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="w-full sm:w-auto"
          title={testDisabledReason}
          onClick={() => onTest(provider)}
          disabled={!provider.isConfigured || item.isTesting}
        >
          {item.isTesting ? "Testing..." : "test connection"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="w-full sm:w-auto"
          title={refreshDisabledReason}
          onClick={() => onRefreshModels(provider.provider)}
          disabled={!provider.isConfigured || isRefreshingModels}
        >
          {isRefreshingModels ? "Refreshing..." : "刷新模型"}
        </Button>
        {provider.kind === "builtin" ? (
          <Button
            size="sm"
            variant="outline"
            className="w-full sm:w-auto"
            title={item.canRefreshBalance ? "" : "Currently, manufacturers cannot directly refresh the balance."}
            onClick={() => onRefreshBalance(provider.provider)}
            disabled={!item.canRefreshBalance || item.isBalanceRefreshing}
          >
            {item.isBalanceRefreshing ? "Balance is being refreshed..." : "Refresh balance"}
          </Button>
        ) : null}
      </div>

      <div className="mt-3 border-t pt-3">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium text-primary"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((prev) => !prev)}
        >
          <span>Advanced details</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", advancedOpen ? "rotate-180" : "")} />
        </button>
      </div>

      {advancedOpen ? (
        <div className="mt-3 space-y-3">
          <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            API address:{provider.currentBaseURL || "-"}
          </div>
          <ProviderRequestLimitSummary
            concurrencyLimit={provider.concurrencyLimit}
            requestIntervalMs={provider.requestIntervalMs}
          />
          <div className="flex flex-col gap-3 rounded-md border bg-background/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="text-xs font-medium text-muted-foreground">thinking function</div>
              <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                {provider.reasoningEnabled
                  ? "Currently returns and displays the model thinking content."
                  : "The thinking content is currently hidden; MiniMax will automatically clean the thinking content in the text."}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-xs text-muted-foreground">{provider.reasoningEnabled ? "Already turned on" : "Closed"}</span>
              <Switch
                checked={provider.reasoningEnabled}
                disabled={item.isReasoningUpdating}
                onCheckedChange={(checked) => onToggleReasoning(provider.provider, checked)}
              />
            </div>
          </div>

          <div className="rounded-md border border-dashed bg-background/60 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-medium text-muted-foreground">Balance details</div>
              {balance?.status === "available" ? (
                <Badge variant="outline">Recently refreshed {formatBalanceTime(balance.fetchedAt)}</Badge>
              ) : null}
            </div>
            {provider.kind === "custom" ? (
              <div className={`text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                Customized OpenAI compatible manufacturers are not currently connected to balance query.
                                            </div>
            ) : balance?.status === "available" ? (
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                {balance.cashBalance !== null ? <div>Cash balance:{formatBalanceAmount(balance.cashBalance, balance.currency)}</div> : null}
                {balance.voucherBalance !== null ? <div>Voucher balance:{formatBalanceAmount(balance.voucherBalance, balance.currency)}</div> : null}
                {balance.chargeBalance !== null ? <div>Recharge balance:{formatBalanceAmount(balance.chargeBalance, balance.currency)}</div> : null}
                {balance.toppedUpBalance !== null ? <div>Accumulated recharge:{formatBalanceAmount(balance.toppedUpBalance, balance.currency)}</div> : null}
                {balance.grantedBalance !== null ? <div>Gift amount:{formatBalanceAmount(balance.grantedBalance, balance.currency)}</div> : null}
              </div>
            ) : (
              <div className={`text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                {balance?.error ?? balance?.message ?? (provider.isConfigured ? "Balance information is currently not available." : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.")}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex min-w-0 flex-wrap gap-1">
              {visibleModels.map((model) => (
                <Badge
                  key={model}
                  variant={model === provider.currentModel ? "default" : "outline"}
                  className={model === provider.currentModel
                    ? "max-w-full whitespace-normal break-words bg-primary text-left [overflow-wrap:anywhere]"
                    : "max-w-full whitespace-normal break-words text-left [overflow-wrap:anywhere]"}
                >
                  {model}
                </Badge>
              ))}
            </div>
            {provider.models.length > 8 ? (
              <button
                type="button"
                className="text-xs font-medium text-primary transition-opacity hover:opacity-80"
                onClick={() => setModelsOpen((prev) => !prev)}
              >
                {modelsOpen ? "Collapse model list" : `展开全部 ${provider.models.length} 个模型`}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
