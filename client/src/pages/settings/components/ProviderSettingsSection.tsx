import i18next from "i18next";
import { useMemo, useState } from "react";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { APIKeyStatus, ProviderBalanceStatus } from "@/api/settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  onOpenConfig: (provider: LLMProvider) => void;
  onTest: (provider: APIKeyStatus) => void;
  onRefreshModels: (provider: LLMProvider) => void;
  onRefreshBalance: (provider: LLMProvider) => void;
  onToggleReasoning: (provider: LLMProvider, reasoningEnabled: boolean) => void;
  defaultShowConfiguredOnly?: boolean;
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
    onOpenConfig,
    onTest,
    onRefreshModels,
    onRefreshBalance,
    onToggleReasoning,
    defaultShowConfiguredOnly = false,
  } = props;
  const [showAllProviders, setShowAllProviders] = useState(!defaultShowConfiguredOnly);
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
    () => showAllProviders ? viewModels : viewModels.filter(({ provider }) => provider.isConfigured && provider.isActive),
    [showAllProviders, viewModels],
  );
  const hiddenProviderCount = viewModels.length - visibleViewModels.length;

  return (
    <Card id="settings-provider-section" className="min-w-0 scroll-mt-20 overflow-hidden">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle>{i18next.t("dict.gen_b51bd70b")}</CardTitle>
          <CardDescription className={AUTO_DIRECTOR_MOBILE_CLASSES.wrapText}>{i18next.t("settings.providerSettingsSection.w9cae9")}</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {defaultShowConfiguredOnly && hiddenProviderCount > 0 ? (
            <Button variant="outline" onClick={() => setShowAllProviders((current) => !current)}>
              {showAllProviders ? "收起其他厂商" : i18next.t("settings.providerSettingsSection.fxqv5k", { val1: (hiddenProviderCount) })}
            </Button>
          ) : null}
          <Button className={AUTO_DIRECTOR_MOBILE_CLASSES.fullWidthAction} onClick={onCreateCustomProvider}>{i18next.t("dict.gen_86fc689e")}</Button>
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3 md:grid-cols-2">
        {visibleViewModels.map((item) => (
          <ProviderStatusCard
            key={item.provider.provider}
            item={item}
            onOpenConfig={onOpenConfig}
            onTest={onTest}
            onRefreshModels={onRefreshModels}
            onRefreshBalance={onRefreshBalance}
            onToggleReasoning={onToggleReasoning}
            isRefreshingModels={refreshingModelProvider === item.provider.provider}
          />
        ))}
        {!visibleViewModels.length ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground md:col-span-2">{i18next.t("settings.providerSettingsSection.xc6pwg")}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
