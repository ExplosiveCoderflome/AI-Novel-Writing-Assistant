import { useMemo, useState } from "react";
import { Plus, PlugZap, ServerCog, Sparkles } from "lucide-react";
import type { LLMProvider, ReasoningEffort } from "@ai-novel/shared/types/llm";
import type { APIKeyStatus, ProviderBalanceStatus } from "@/api/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";
import ProviderStatusCard, { type ProviderCardViewModel } from "./ProviderStatusCard";

export default function ProviderSettingsSection(props: {
  providers: APIKeyStatus[];
  balances: ProviderBalanceStatus[];
  isBalanceLoading: boolean;
  testingProvider?: string;
  providerTestResults: Record<string, string>;
  refreshingModelProvider?: string;
  refreshingBalanceProvider?: string;
  reasoningProvider?: string;
  onCreateCustomProvider: () => void;
  onRemoveProvider: (provider: APIKeyStatus) => void;
  onOpenConfig: (provider: LLMProvider) => void;
  onTest: (provider: APIKeyStatus) => void;
  onRefreshModels: (provider: LLMProvider) => void;
  onRefreshBalance: (provider: LLMProvider) => void;
  onSetReasoning: (provider: LLMProvider, reasoningEnabled: boolean, reasoningEffort?: ReasoningEffort) => void;
  onSetHiddenModels: (provider: LLMProvider, hiddenModels: string[], message: string) => void;
  removingProvider?: string;
}) {
  const {
    providers,
    balances,
    isBalanceLoading,
    testingProvider,
    providerTestResults,
    refreshingModelProvider,
    refreshingBalanceProvider,
    reasoningProvider,
    onCreateCustomProvider,
    onRemoveProvider,
    onOpenConfig,
    onTest,
    onRefreshModels,
    onRefreshBalance,
    onSetReasoning,
    onSetHiddenModels,
    removingProvider,
  } = props;
  const [isAddProviderOpen, setIsAddProviderOpen] = useState(false);
  const balanceMap = new Map(balances.map((item) => [item.provider, item]));
  const viewModels: ProviderCardViewModel[] = providers.map((provider) => {
    const balance = balanceMap.get(provider.provider);
    const canRefreshBalance = Boolean(
      provider.kind === "builtin"
      && provider.isConfigured
      && (balance?.canRefresh ?? (provider.provider === "deepseek" || provider.provider === "siliconflow" || provider.provider === "kimi")),
    );
    return {
      provider,
      balance,
      isBalanceLoading: isBalanceLoading && !balance,
      isBalanceRefreshing: refreshingBalanceProvider === provider.provider,
      canRefreshBalance,
      isReasoningUpdating: reasoningProvider === provider.provider,
      isTesting: testingProvider === provider.provider,
      testResult: providerTestResults[provider.provider],
    };
  });
  const visibleViewModels = useMemo(
    () => viewModels.filter(({ provider }) => provider.isConfigured && provider.isActive),
    [viewModels],
  );
  const addableBuiltIns = providers.filter((provider) => provider.kind === "builtin" && (!provider.isConfigured || !provider.isActive));

  return (
    <Card id="settings-provider-section" className="min-w-0 scroll-mt-20 overflow-hidden border-primary/10 bg-gradient-to-b from-primary/[0.035] to-background shadow-sm">
      <CardHeader className="flex flex-col gap-4 border-b bg-background/60 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>模型厂商</CardTitle>
              <Badge variant={visibleViewModels.length ? "default" : "outline"}>{visibleViewModels.length} 个可用连接</Badge>
            </div>
          <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>
              添加一个可用文本模型后就能开始创作；路由和高级参数可按需再设置。
          </CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction} onClick={() => setIsAddProviderOpen(true)}>
            <Plus className="h-4 w-4" /> 添加厂商
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4 pt-5 md:grid-cols-2">
        {visibleViewModels.map((item) => (
          <ProviderStatusCard
            key={item.provider.provider}
            item={item}
            onOpenConfig={onOpenConfig}
            onTest={onTest}
            onRefreshModels={onRefreshModels}
            onRefreshBalance={onRefreshBalance}
            onSetReasoning={onSetReasoning}
            onSetHiddenModels={onSetHiddenModels}
            onRemove={() => onRemoveProvider(item.provider)}
            isRemoving={removingProvider === item.provider.provider}
            isRefreshingModels={refreshingModelProvider === item.provider.provider}
          />
        ))}
        {!visibleViewModels.length ? (
          <div className="rounded-xl border border-dashed bg-background/70 p-6 text-center text-sm text-muted-foreground md:col-span-2">
            <PlugZap className="mx-auto mb-3 h-6 w-6 text-primary" />
            <div className="font-medium text-foreground">还没有可用的模型连接</div>
            <div className="mt-1">添加内置厂商或自定义服务后，即可配置第一个文本模型。</div>
          </div>
        ) : null}
      </CardContent>
      <Dialog open={isAddProviderOpen} onOpenChange={setIsAddProviderOpen}>
        <AppDialogContent
          title="添加模型厂商"
          description="选择一个内置厂商模板，或添加你自己的 OpenAI 兼容服务。"
          className="max-w-2xl"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {addableBuiltIns.map((provider) => (
              <button
                key={provider.provider}
                type="button"
                className="rounded-xl border bg-background p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 hover:shadow-sm"
                onClick={() => {
                  setIsAddProviderOpen(false);
                  onOpenConfig(provider.provider);
                }}
              >
                <div className="flex items-center gap-2 font-medium"><PlugZap className="h-4 w-4 text-primary" /> {provider.name}</div>
                <div className="mt-2 text-xs text-muted-foreground">推荐模型：{provider.defaultModel}</div>
              </button>
            ))}
            <button
              type="button"
              className="rounded-xl border border-dashed bg-background p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 hover:shadow-sm"
              onClick={() => {
                setIsAddProviderOpen(false);
                onCreateCustomProvider();
              }}
            >
              <div className="flex items-center gap-2 font-medium"><ServerCog className="h-4 w-4 text-primary" /> 自定义厂商</div>
              <div className="mt-2 text-xs text-muted-foreground">连接任意 OpenAI 兼容服务。</div>
            </button>
          </div>
          {!addableBuiltIns.length ? (
            <div className="mt-3 text-sm text-muted-foreground">所有内置厂商都已添加；你仍可以添加自定义厂商。</div>
          ) : null}
        </AppDialogContent>
      </Dialog>
    </Card>
  );
}
