import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import {
  createCustomProvider,
  deleteCustomProvider,
  getAPIKeySettings,
  getProviderBalances,
  getRagSettings,
  refreshProviderBalance,
  refreshProviderModelList,
  saveAPIKeySetting,
  testLLMConnection,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import SearchableSelect from "@/components/common/SearchableSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const MODEL_BADGE_COLLAPSE_COUNT = 8;

function formatBalanceAmount(amount: number | null | undefined, currency: string | null | undefined): string {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return "-";
  }
  if (currency) {
    try {
      return new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      // Fall through to plain numeric output for unsupported currency codes.
    }
  }
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatBalanceTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("zh-CN", {
    hour12: false,
  });
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [editingProvider, setEditingProvider] = useState("");
  const [isCreatingCustomProvider, setIsCreatingCustomProvider] = useState(false);
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    displayName: "",
    key: "",
    model: "",
    baseURL: "",
  });
  const [testResult, setTestResult] = useState("");
  const [actionResult, setActionResult] = useState("");

  const apiKeySettingsQuery = useQuery({
    queryKey: queryKeys.settings.apiKeys,
    queryFn: getAPIKeySettings,
  });

  const ragSettingsQuery = useQuery({
    queryKey: queryKeys.settings.rag,
    queryFn: getRagSettings,
  });

  const providerBalancesQuery = useQuery({
    queryKey: queryKeys.settings.apiKeyBalances,
    queryFn: getProviderBalances,
  });

  const providerConfigs = useMemo(() => apiKeySettingsQuery.data?.data ?? [], [apiKeySettingsQuery.data?.data]);
  const editingConfig = useMemo(
    () => providerConfigs.find((item) => item.provider === editingProvider),
    [editingProvider, providerConfigs],
  );
  const isDialogOpen = isCreatingCustomProvider || Boolean(editingProvider);
  const isCustomDialog = isCreatingCustomProvider || editingConfig?.kind === "custom";

  const resetDialogState = () => {
    setEditingProvider("");
    setIsCreatingCustomProvider(false);
    setForm({
      displayName: "",
      key: "",
      model: "",
      baseURL: "",
    });
    setTestResult("");
  };

  const invalidateProviderQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.apiKeys }),
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.apiKeyBalances }),
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.rag }),
      queryClient.invalidateQueries({ queryKey: queryKeys.llm.providers }),
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.modelRoutes }),
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.modelRouteConnectivity }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: (payload: {
      provider: LLMProvider;
      displayName?: string;
      key?: string;
      model?: string;
      baseURL?: string;
    }) =>
      saveAPIKeySetting(payload.provider, {
        displayName: payload.displayName,
        key: payload.key,
        model: payload.model,
        baseURL: payload.baseURL,
      }),
    onSuccess: async (response) => {
      resetDialogState();
      setActionResult(response.message ?? "保存成功。");
      await invalidateProviderQueries();
    },
    onError: (error) => {
      setActionResult(error instanceof Error ? error.message : "保存失败。");
    },
  });

  const createCustomProviderMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      key?: string;
      model: string;
      baseURL: string;
    }) =>
      createCustomProvider(payload),
    onSuccess: async (response) => {
      resetDialogState();
      setActionResult(response.message ?? "自定义厂商创建成功。");
      await invalidateProviderQueries();
    },
    onError: (error) => {
      setActionResult(error instanceof Error ? error.message : "创建自定义厂商失败。");
    },
  });

  const deleteCustomProviderMutation = useMutation({
    mutationFn: (provider: LLMProvider) => deleteCustomProvider(provider),
    onSuccess: async (response) => {
      resetDialogState();
      setActionResult(response.message ?? "自定义厂商已删除。");
      await invalidateProviderQueries();
    },
    onError: (error) => {
      setActionResult(error instanceof Error ? error.message : "删除自定义厂商失败。");
    },
  });

  const testMutation = useMutation({
    mutationFn: (payload: {
      provider: LLMProvider;
      apiKey?: string;
      model?: string;
      baseURL?: string;
      probeMode?: "plain" | "structured" | "both";
    }) => testLLMConnection(payload),
    onSuccess: (response) => {
      const latency = response.data?.latency ?? 0;
      const plain = response.data?.plain;
      const structured = response.data?.structured;
      const plainText = plain
        ? plain.ok
          ? `普通连通正常${plain.latency != null ? ` (${plain.latency}ms)` : ""}`
          : `普通连通失败${plain.error ? `：${plain.error}` : ""}`
        : "普通连通未检测";
      const structuredText = structured
        ? structured.ok
          ? `结构化正常${structured.strategy ? `，策略 ${structured.strategy}` : ""}${structured.reasoningForcedOff ? "，已强制关闭 thinking" : ""}`
          : `结构化失败${structured.errorCategory ? `，分类 ${structured.errorCategory}` : ""}${structured.error ? `：${structured.error}` : ""}`
        : "结构化未检测";
      setTestResult(`连接成功，总耗时 ${latency}ms · ${plainText} · ${structuredText}`);
    },
    onError: (error) => {
      setTestResult(error instanceof Error ? error.message : "连接测试失败。");
    },
  });

  const refreshModelsMutation = useMutation({
    mutationFn: (provider: LLMProvider) => refreshProviderModelList(provider),
    onSuccess: async (response, provider) => {
      const count = response.data?.models?.length ?? 0;
      const providerName = providerConfigs.find((item) => item.provider === provider)?.name ?? provider;
      setActionResult(`${providerName} 模型列表已刷新（${count} 个）。`);
      await invalidateProviderQueries();
    },
    onError: (error) => {
      setActionResult(error instanceof Error ? error.message : "刷新模型列表失败。");
    },
  });

  const toggleReasoningMutation = useMutation({
    mutationFn: (payload: { provider: LLMProvider; reasoningEnabled: boolean }) =>
      saveAPIKeySetting(payload.provider, {
        reasoningEnabled: payload.reasoningEnabled,
      }),
    onSuccess: async (_response, variables) => {
      const providerName = providerConfigs.find((item) => item.provider === variables.provider)?.name ?? variables.provider;
      setActionResult(`${providerName} 思考功能已${variables.reasoningEnabled ? "开启" : "关闭"}。`);
      await invalidateProviderQueries();
    },
    onError: (error) => {
      setActionResult(error instanceof Error ? error.message : "更新思考开关失败。");
    },
  });

  const refreshBalanceMutation = useMutation({
    mutationFn: (provider: LLMProvider) => refreshProviderBalance(provider),
    onSuccess: async (response, provider) => {
      const providerName = providerConfigs.find((item) => item.provider === provider)?.name ?? provider;
      setActionResult(response.message ?? `${providerName} 余额已刷新。`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.apiKeyBalances });
    },
    onError: (error) => {
      setActionResult(error instanceof Error ? error.message : "刷新余额失败。");
    },
  });

  const providerBalanceMap = useMemo(
    () => new Map((providerBalancesQuery.data?.data ?? []).map((item) => [item.provider, item])),
    [providerBalancesQuery.data?.data],
  );
  const ragSettings = ragSettingsQuery.data?.data;
  const ragProvider = useMemo(
    () => ragSettings?.providers.find((item) => item.provider === ragSettings.embeddingProvider),
    [ragSettings],
  );

  const isProviderExpanded = (provider: string) => expandedProviders[provider] === true;
  const toggleProviderExpanded = (provider: string) => {
    setExpandedProviders((prev) => ({
      ...prev,
      [provider]: !prev[provider],
    }));
  };

  const openBuiltInDialog = (provider: LLMProvider) => {
    const config = providerConfigs.find((item) => item.provider === provider);
    if (!config) {
      return;
    }
    setIsCreatingCustomProvider(false);
    setEditingProvider(provider);
    setForm({
      displayName: config.displayName ?? config.name,
      key: "",
      model: config.currentModel,
      baseURL: config.currentBaseURL,
    });
    setTestResult("");
    setActionResult("");
  };

  const openCreateCustomDialog = () => {
    setEditingProvider("");
    setIsCreatingCustomProvider(true);
    setForm({
      displayName: "",
      key: "",
      model: "",
      baseURL: "",
    });
    setTestResult("");
    setActionResult("");
  };

  const canRefreshBalance = (provider: LLMProvider, kind: "builtin" | "custom", isConfigured: boolean) => {
    if (kind === "custom" || !isConfigured) {
      return false;
    }
    const balance = providerBalanceMap.get(provider);
    return Boolean(balance?.canRefresh ?? (provider === "deepseek" || provider === "siliconflow" || provider === "kimi"));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Embedding Settings Moved</CardTitle>
          <CardDescription>
            Embedding provider and model configuration now live in the knowledge module.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Current embedding provider</div>
              <div className="mt-1 font-medium">{ragProvider?.name ?? ragSettings?.embeddingProvider ?? "-"}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Current embedding model</div>
              <div className="mt-1 font-medium">{ragSettings?.embeddingModel ?? "-"}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Status</span>
            <Badge variant={ragProvider?.isConfigured ? "default" : "outline"}>
              {ragProvider?.isConfigured ? "API key ready" : "API key missing"}
            </Badge>
            <Badge variant={ragProvider?.isActive ? "default" : "outline"}>
              {ragProvider?.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <Button asChild>
            <Link to="/knowledge?tab=settings">Open knowledge settings</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>模型路由</CardTitle>
          <CardDescription>把不同写作角色分配给不同模型，建议在独立页面集中管理。</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            现在模型路由已经独立成管理页，支持按角色单独配置服务商和模型。
          </div>
          <Button asChild>
            <Link to="/settings/model-routes">进入模型路由管理</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>Model Providers</CardTitle>
            <CardDescription>
              管理内置厂商连接，也可以新增 OpenAI-compatible 自定义厂商。
            </CardDescription>
          </div>
          <Button onClick={openCreateCustomDialog}>新增自定义厂商</Button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {providerConfigs.map((item) => {
            const balance = providerBalanceMap.get(item.provider);
            const isBalanceRefreshing = refreshBalanceMutation.isPending && refreshBalanceMutation.variables === item.provider;
            const isBalanceLoading = providerBalancesQuery.isLoading && !balance;
            const refreshBalanceEnabled = canRefreshBalance(item.provider, item.kind, item.isConfigured);
            const isReasoningUpdating = toggleReasoningMutation.isPending
              && toggleReasoningMutation.variables?.provider === item.provider;
            return (
              <div
                key={item.provider}
                className={`rounded-md border p-3 transition-colors ${
                  item.isConfigured
                    ? "border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20"
                    : "border-border"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{item.name}</div>
                    {item.kind === "custom" ? <Badge variant="outline">自定义</Badge> : null}
                  </div>
                  <Badge
                    variant={item.isConfigured ? "default" : "outline"}
                    className={item.isConfigured ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}
                  >
                    {item.isConfigured ? "Configured" : "Not configured"}
                  </Badge>
                </div>
                <div className="mb-2 text-xs text-muted-foreground">Current model: {item.currentModel || "-"}</div>
                <div className="mb-2 text-xs text-muted-foreground">API URL: {item.currentBaseURL || "-"}</div>
                <div className="mb-3 flex items-center justify-between rounded-md border bg-background/60 px-3 py-2">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">思考功能</div>
                    <div className="text-xs text-muted-foreground">
                      {item.reasoningEnabled
                        ? "当前会返回并展示模型思考内容。"
                        : "当前会隐藏思考内容；MiniMax 会自动启用分离与清洗，避免 <think> 泄漏到正文。"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{item.reasoningEnabled ? "已开启" : "已关闭"}</span>
                    <Switch
                      checked={item.reasoningEnabled}
                      disabled={isReasoningUpdating}
                      onCheckedChange={(checked) => {
                        setActionResult("");
                        toggleReasoningMutation.mutate({
                          provider: item.provider,
                          reasoningEnabled: checked,
                        });
                      }}
                    />
                  </div>
                </div>
                <div className="mb-3 rounded-md border border-dashed bg-background/60 p-3">
                  {item.kind === "custom" ? (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">余额</div>
                      <div className="text-sm text-muted-foreground">
                        自定义 OpenAI-compatible 厂商暂不接入余额查询。
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="text-xs font-medium text-muted-foreground">余额</div>
                        {balance?.status === "available" ? (
                          <Badge variant="outline">最近刷新 {formatBalanceTime(balance.fetchedAt)}</Badge>
                        ) : null}
                      </div>
                      {isBalanceLoading ? (
                        <div className="text-sm text-muted-foreground">正在查询余额...</div>
                      ) : balance?.status === "available" ? (
                        <div className="space-y-2">
                          <div className="text-lg font-semibold">
                            {formatBalanceAmount(balance.availableBalance, balance.currency)}
                          </div>
                          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                            {balance.cashBalance !== null ? <div>现金余额：{formatBalanceAmount(balance.cashBalance, balance.currency)}</div> : null}
                            {balance.voucherBalance !== null ? <div>代金券余额：{formatBalanceAmount(balance.voucherBalance, balance.currency)}</div> : null}
                            {balance.chargeBalance !== null ? <div>充值余额：{formatBalanceAmount(balance.chargeBalance, balance.currency)}</div> : null}
                            {balance.toppedUpBalance !== null ? <div>累计充值：{formatBalanceAmount(balance.toppedUpBalance, balance.currency)}</div> : null}
                            {balance.grantedBalance !== null ? <div>赠送额度：{formatBalanceAmount(balance.grantedBalance, balance.currency)}</div> : null}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="text-sm text-muted-foreground">
                            {balance?.error ?? balance?.message ?? (item.isConfigured ? "当前暂未获取余额信息。" : "请先配置 API Key。")}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="mb-3 space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {(isProviderExpanded(item.provider)
                      ? item.models
                      : item.models.slice(0, MODEL_BADGE_COLLAPSE_COUNT)
                    ).map((model) => (
                      <Badge
                        key={model}
                        variant={model === item.currentModel ? "default" : "outline"}
                        className={model === item.currentModel ? "bg-primary" : ""}
                      >
                        {model}
                      </Badge>
                    ))}
                  </div>
                  {item.models.length > MODEL_BADGE_COLLAPSE_COUNT ? (
                    <button
                      type="button"
                      className="text-xs font-medium text-primary transition-opacity hover:opacity-80"
                      onClick={() => toggleProviderExpanded(item.provider)}
                    >
                      {isProviderExpanded(item.provider)
                        ? "收起模型列表"
                        : `展开全部 ${item.models.length} 个模型`}
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => openBuiltInDialog(item.provider)}>
                    {item.kind === "custom" ? "编辑" : "Configure"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setTestResult("");
                      testMutation.mutate({
                        provider: item.provider,
                        model: item.currentModel || undefined,
                        baseURL: item.currentBaseURL || undefined,
                      });
                    }}
                    disabled={testMutation.isPending}
                  >
                    Test
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setActionResult("");
                      refreshModelsMutation.mutate(item.provider);
                    }}
                    disabled={!item.isConfigured || refreshModelsMutation.isPending}
                  >
                    {refreshModelsMutation.isPending && refreshModelsMutation.variables === item.provider
                      ? "Refreshing..."
                      : "Refresh models"}
                  </Button>
                  {item.kind === "builtin" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setActionResult("");
                        refreshBalanceMutation.mutate(item.provider);
                      }}
                      disabled={!refreshBalanceEnabled || isBalanceRefreshing}
                    >
                      {isBalanceRefreshing ? "Refreshing balance..." : "刷新余额"}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {actionResult ? <div className="text-sm text-muted-foreground">{actionResult}</div> : null}

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            resetDialogState();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isCreatingCustomProvider
                ? "新增自定义厂商"
                : isCustomDialog
                  ? "编辑自定义厂商"
                  : "Configure Model Provider"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {isCustomDialog ? (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">厂商名称</div>
                <Input
                  value={form.displayName}
                  placeholder="例如：My Gateway"
                  onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
                />
              </div>
            ) : null}

            {(isCustomDialog || editingConfig?.requiresApiKey === false) ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                这一项支持本地或免密接入，API Key 可以留空；重点配置模型名和 API URL。
              </div>
            ) : null}

            <Input
              type="password"
              value={form.key}
              placeholder={editingConfig?.isConfigured ? "留空则沿用当前已保存的 API Key" : "Enter API key"}
              onChange={(event) => setForm((prev) => ({ ...prev, key: event.target.value }))}
            />

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Available models</div>
              <SearchableSelect
                value={form.model}
                onValueChange={(value) => setForm((prev) => ({ ...prev, model: value }))}
                options={(editingConfig?.models ?? []).map((model) => ({ value: model }))}
                placeholder="Select a model"
                searchPlaceholder="Search models"
                emptyText="No models available"
              />
            </div>

            <Input
              value={form.model}
              placeholder="也可以直接手动输入模型名"
              onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
            />

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">API URL</div>
              <Input
                value={form.baseURL}
                placeholder={editingConfig?.defaultBaseURL ?? "https://api.example.com/v1"}
                onChange={(event) => setForm((prev) => ({ ...prev, baseURL: event.target.value }))}
              />
              <div className="text-xs text-muted-foreground">
                本地 Ollama 常见地址是 `http://127.0.0.1:11434/v1`。留空会回退到当前默认地址。
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  if (isCreatingCustomProvider) {
                    createCustomProviderMutation.mutate({
                      name: form.displayName.trim(),
                      key: form.key.trim() ? form.key : undefined,
                      model: form.model.trim(),
                      baseURL: form.baseURL.trim(),
                    });
                    return;
                  }
                  if (!editingProvider) {
                    return;
                  }
                  saveMutation.mutate({
                    provider: editingProvider,
                    displayName: isCustomDialog ? form.displayName.trim() || undefined : undefined,
                    key: form.key.trim() ? form.key : undefined,
                    model: form.model.trim() || undefined,
                    baseURL: form.baseURL,
                  });
                }}
                disabled={
                  saveMutation.isPending
                  || createCustomProviderMutation.isPending
                  || !form.model.trim()
                  || (isCustomDialog && !form.displayName.trim())
                  || (isCreatingCustomProvider && !form.baseURL.trim())
                  || (!isCustomDialog && editingConfig?.requiresApiKey !== false && !form.key.trim() && !editingConfig?.isConfigured)
                }
              >
                {saveMutation.isPending || createCustomProviderMutation.isPending ? "Saving..." : "Save"}
              </Button>

              <Button
                variant="secondary"
                onClick={() =>
                  testMutation.mutate({
                    provider: editingProvider || "custom_preview",
                    apiKey: form.key.trim() ? form.key : undefined,
                    model: form.model.trim() || undefined,
                    baseURL: form.baseURL.trim() ? form.baseURL : undefined,
                    probeMode: "both",
                  })
                }
                disabled={testMutation.isPending || !form.model.trim() || !form.baseURL.trim()}
              >
                Test
              </Button>

              {editingConfig?.kind === "custom" ? (
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (!editingProvider) {
                      return;
                    }
                    if (!window.confirm(`确认删除自定义厂商 ${editingConfig.name} 吗？`)) {
                      return;
                    }
                    deleteCustomProviderMutation.mutate(editingProvider);
                  }}
                  disabled={deleteCustomProviderMutation.isPending}
                >
                  {deleteCustomProviderMutation.isPending ? "Deleting..." : "Delete"}
                </Button>
              ) : null}
            </div>
            {testResult ? <div className="text-sm text-muted-foreground">{testResult}</div> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
