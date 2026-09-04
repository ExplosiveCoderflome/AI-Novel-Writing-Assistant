import { useState } from "react";
import { Bot, ChevronDown, Image, RefreshCw, RotateCcw, Trash2, WalletCards, X } from "lucide-react";
import type { LLMProvider, ReasoningEffort } from "@ai-novel/shared/types/llm";
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
    return "自定义厂商暂不接入余额查询。";
  }
  if (isBalanceLoading) {
    return "正在查询余额...";
  }
  if (balance?.status === "available") {
    return `余额 ${formatBalanceAmount(balance.availableBalance, balance.currency)}`;
  }
  return balance?.error ?? balance?.message ?? (provider.isConfigured ? "当前暂未获取余额信息。" : "请先配置 API Key。");
}

export default function ProviderStatusCard(props: {
  item: ProviderCardViewModel;
  onOpenConfig: (provider: LLMProvider) => void;
  onTest: (provider: APIKeyStatus) => void;
  onRefreshModels: (provider: LLMProvider) => void;
  onRefreshBalance: (provider: LLMProvider) => void;
  onSetReasoning: (provider: LLMProvider, reasoningEnabled: boolean, reasoningEffort?: ReasoningEffort) => void;
  onSetHiddenModels: (provider: LLMProvider, hiddenModels: string[], message: string) => void;
  onRemove: () => void;
  isRemoving: boolean;
  isRefreshingModels: boolean;
}) {
  const {
    item,
    onOpenConfig,
    onTest,
    onRefreshModels,
    onRefreshBalance,
    onSetReasoning,
    onSetHiddenModels,
    onRemove,
    isRemoving,
    isRefreshingModels,
  } = props;
  const { provider, balance } = item;
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const imageModelLabel = provider.supportsImageGeneration
    ? provider.currentImageModel || provider.defaultImageModel || "未设置"
    : "不支持图像生成";
  const visibleModels = modelsOpen ? provider.models : provider.models.slice(0, 8);
  const canUseProvider = provider.isConfigured && provider.isActive && Boolean(provider.currentModel);
  const testDisabledReason = provider.isConfigured ? "" : "配置 API Key 后可以测试连接。";
  const refreshDisabledReason = provider.isConfigured ? "" : "配置 API Key 后可以刷新模型列表。";

  return (
    <div
      className={cn(
        "min-w-0 rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md",
        canUseProvider ? "border-primary/25 hover:border-primary/45" : "border-border",
      )}
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className={`font-semibold ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>{provider.name}</div>
            {provider.kind === "custom" ? <Badge variant="outline">自定义</Badge> : null}
          </div>
          <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {canUseProvider ? "可用于创作任务。" : "完成配置后可用于创作任务。"}
          </div>
        </div>
        <Badge
          variant={canUseProvider ? "default" : "outline"}
          className={canUseProvider ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}
        >
          {canUseProvider ? "可用" : provider.isConfigured ? "已配置" : "未配置"}
        </Badge>
      </div>

      <div className="mb-3 grid min-w-0 gap-2 text-sm md:grid-cols-2">
        <div className="min-w-0 rounded-lg border bg-muted/25 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Bot className="h-3.5 w-3.5" /> 文本模型</div>
          <div className={`mt-1 font-medium ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {provider.currentModel || "-"}
          </div>
        </div>
        <div className="min-w-0 rounded-lg border bg-muted/25 p-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Image className="h-3.5 w-3.5" /> 图像模型</div>
          <div className={`mt-1 font-medium ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            {imageModelLabel}
          </div>
        </div>
      </div>

      <div className={`mb-3 flex items-center gap-2 rounded-lg bg-muted/35 px-3 py-2.5 text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
        <WalletCards className="h-4 w-4 shrink-0 text-primary" />
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

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onOpenConfig(provider.provider)}>
          {provider.kind === "custom" ? "管理连接" : "配置连接"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          title={testDisabledReason}
          onClick={() => onTest(provider)}
          disabled={!provider.isConfigured || item.isTesting}
        >
          {item.isTesting ? "测试中..." : "测试连接"}
        </Button>
      </div>

      <div className="mt-3 border-t pt-3">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium text-primary"
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((prev) => !prev)}
        >
          <span>高级详情与维护</span>
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", advancedOpen ? "rotate-180" : "")} />
        </button>
      </div>

      {advancedOpen ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 border-b pb-3">
            <Button
              size="sm"
              variant="outline"
              title={refreshDisabledReason}
              onClick={() => onRefreshModels(provider.provider)}
              disabled={!provider.isConfigured || isRefreshingModels}
            >
              <RefreshCw className="h-3.5 w-3.5" /> {isRefreshingModels ? "刷新中..." : "刷新模型"}
            </Button>
            {provider.kind === "builtin" ? (
              <Button
                size="sm"
                variant="outline"
                title={item.canRefreshBalance ? "" : "当前厂商不能直接刷新余额。"}
                onClick={() => onRefreshBalance(provider.provider)}
                disabled={!item.canRefreshBalance || item.isBalanceRefreshing}
              >
                <WalletCards className="h-3.5 w-3.5" /> {item.isBalanceRefreshing ? "余额刷新中..." : "刷新余额"}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={onRemove}
              disabled={isRemoving}
            >
              <Trash2 className="h-3.5 w-3.5" /> {isRemoving ? "移除中..." : provider.kind === "builtin" ? "从列表移除" : "删除"}
            </Button>
          </div>
          <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
            API 地址：{provider.currentBaseURL || "-"}
          </div>
          <ProviderRequestLimitSummary
            concurrencyLimit={provider.concurrencyLimit}
            requestIntervalMs={provider.requestIntervalMs}
          />
          <div className="flex flex-col gap-3 bg-background/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="text-xs font-medium text-muted-foreground">思考功能</div>
              <div className={`text-xs text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                {provider.reasoningEnabled
                  ? "创作请求会启用模型思考；结构化任务会优先保证输出稳定。"
                  : "当前会隐藏思考内容；MiniMax 会自动清洗正文里的 thinking 内容。"}
              </div>
            </div>
            {provider.supportsReasoningEffort ? (
              <select
                className="h-9 shrink-0 rounded-md border border-input bg-background px-3 text-sm"
                aria-label="思考深度"
                disabled={item.isReasoningUpdating}
                value={provider.reasoningEnabled ? provider.reasoningEffort ?? "high" : "off"}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "off") {
                    onSetReasoning(provider.provider, false);
                    return;
                  }
                  onSetReasoning(provider.provider, true, value as ReasoningEffort);
                }}
              >
                <option value="off">关闭</option>
                <option value="low">低</option>
                <option value="high">高</option>
                <option value="max">最大</option>
              </select>
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-muted-foreground">{provider.reasoningEnabled ? "已开启" : "已关闭"}</span>
              <Switch
                checked={provider.reasoningEnabled}
                disabled={item.isReasoningUpdating}
                  onCheckedChange={(checked) => onSetReasoning(provider.provider, checked)}
              />
              </div>
            )}
          </div>

          <div className="rounded-md border border-dashed bg-background/60 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-medium text-muted-foreground">余额明细</div>
              {balance?.status === "available" ? (
                <Badge variant="outline">最近刷新 {formatBalanceTime(balance.fetchedAt)}</Badge>
              ) : null}
            </div>
            {provider.kind === "custom" ? (
              <div className={`text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                自定义 OpenAI 兼容厂商暂不接入余额查询。
              </div>
            ) : balance?.status === "available" ? (
              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                {balance.cashBalance !== null ? <div>现金余额：{formatBalanceAmount(balance.cashBalance, balance.currency)}</div> : null}
                {balance.voucherBalance !== null ? <div>代金券余额：{formatBalanceAmount(balance.voucherBalance, balance.currency)}</div> : null}
                {balance.chargeBalance !== null ? <div>充值余额：{formatBalanceAmount(balance.chargeBalance, balance.currency)}</div> : null}
                {balance.toppedUpBalance !== null ? <div>累计充值：{formatBalanceAmount(balance.toppedUpBalance, balance.currency)}</div> : null}
                {balance.grantedBalance !== null ? <div>赠送额度：{formatBalanceAmount(balance.grantedBalance, balance.currency)}</div> : null}
              </div>
            ) : (
              <div className={`text-sm text-muted-foreground ${AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}`}>
                {balance?.error ?? balance?.message ?? (provider.isConfigured ? "当前暂未获取余额信息。" : "请先配置 API Key。")}
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
                  <span>{model}</span>
                  <button
                    type="button"
                    className="ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-background/30 disabled:cursor-not-allowed disabled:opacity-45"
                    aria-label={`隐藏模型 ${model}`}
                    title={model === provider.currentModel ? "当前使用模型，请先切换后再隐藏。" : `隐藏 ${model}`}
                    disabled={model === provider.currentModel || item.isReasoningUpdating}
                    onClick={() => onSetHiddenModels(
                      provider.provider,
                      [...provider.hiddenModels, model],
                      `已隐藏模型 ${model}。`,
                    )}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            {provider.models.length > 8 ? (
              <button
                type="button"
                className="text-xs font-medium text-primary transition-opacity hover:opacity-80"
                onClick={() => setModelsOpen((prev) => !prev)}
              >
                {modelsOpen ? "收起模型列表" : `展开全部 ${provider.models.length} 个模型`}
              </button>
            ) : null}
          </div>
          {provider.hiddenModels.length ? (
            <div className="space-y-2 border-t pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-medium text-muted-foreground">已隐藏模型</div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={item.isReasoningUpdating}
                  onClick={() => onSetHiddenModels(provider.provider, [], "全部隐藏模型已恢复。")}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> 全部恢复
                </Button>
              </div>
              <div className="flex min-w-0 flex-wrap gap-1">
                {provider.hiddenModels.map((model) => (
                  <button
                    key={model}
                    type="button"
                    className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                    disabled={item.isReasoningUpdating}
                    onClick={() => onSetHiddenModels(
                      provider.provider,
                      provider.hiddenModels.filter((itemModel) => itemModel !== model),
                      `已恢复模型 ${model}。`,
                    )}
                  >
                    <RotateCcw className="h-3 w-3 shrink-0" />
                    <span className="break-all">{model}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
