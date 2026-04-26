import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import {
  createCustomProvider,
  deleteCustomProvider,
  getAPIKeySettings,
  getProviderBalances,
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
import DesktopLegacyDataImportCard from "@/components/layout/DesktopLegacyDataImportCard";
import DesktopUpdateCard from "@/components/layout/DesktopUpdateCard";
import AutoDirectorSettingsSection from "./AutoDirectorSettingsSection";
import SettingsNavigationCards from "./components/SettingsNavigationCards";
import StyleEngineRuntimeSettingsCard from "./components/StyleEngineRuntimeSettingsCard";
import SettingsActionResult from "./SettingsActionResult";
import { formatBalanceAmount, formatBalanceTime } from "./settingsFormatters";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

const MODEL_BADGE_COLLAPSE_COUNT = 8;

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [editingProvider, setEditingProvider] = useState("");
  const [isCreatingCustomProvider, setIsCreatingCustomProvider] = useState(false);
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    displayName: "",
    key: "",
    model: "",
    imageModel: "",
    baseURL: "",
  });
  const [testResult, setTestResult] = useState("");
  const [actionResult, setActionResult] = useState("");

  const apiKeySettingsQuery = useQuery({
    queryKey: queryKeys.settings.apiKeys,
    queryFn: getAPIKeySettings,
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
      imageModel: "",
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
      imageModel?: string;
      baseURL?: string;
    }) =>
      saveAPIKeySetting(payload.provider, {
        displayName: payload.displayName,
        key: payload.key,
        model: payload.model,
        imageModel: payload.imageModel,
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
  const modelOptions = editingConfig?.models ?? [];
  const canSelectListedModels = !isCreatingCustomProvider && modelOptions.length > 0;
  const primaryModelLabel = isCustomDialog ? "Default model name" : "Model name";

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
      imageModel: config.currentImageModel ?? config.defaultImageModel ?? "",
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
      imageModel: "",
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
    <div className={AUTO_DIRECTOR_MOBILE_CLASSES.settingsPageRoot}>
      <DesktopUpdateCard />
      <DesktopLegacyDataImportCard forceVisible />

      <SettingsNavigationCards />
      <StyleEngineRuntimeSettingsCard />

      <AutoDirectorSettingsSection onActionResult={setActionResult} />

      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <CardTitle>Model Providers</CardTitle>
            <CardDescription className="break-words [overflow-wrap:anywhere]">
              管理内置厂商连接，也可以新增 OpenAI-compatible 自定义厂商。
            </CardDescription>
          </div>
          <Button className="w-full sm:w-auto" onClick={openCreateCustomDialog}>新增自定义厂商</Button>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-3 md:grid-cols-2">
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
                className={`min-w-0 rounded-md border p-3 transition-colors ${
                  item.isConfigured
                    ? "border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20"
                    : "border-border"
                }`}
              >
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <div className="break-words font-medium [overflow-wrap:anywhere]">{item.name}</div>
                    {item.kind === "custom" ? <Badge variant="outline">自定义</Badge> : null}
                  </div>
                  <Badge
                    variant={item.isConfigured ? "default" : "outline"}
                    className={item.isConfigured ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}
                  >
                    {item.isConfigured ? "Configured" : "Not configured"}
                  </Badge>
                </div>
                <div className="mb-2 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">Current model: {item.currentModel || "-"}</div>
                {item.supportsImageGeneration ? (
                  <div className="mb-2 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    Image model: {item.currentImageModel || item.defaultImageModel || "-"}
                  </div>
                ) : null}
                <div className="mb-2 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">API URL: {item.currentBaseURL || "-"}</div>
                <div className="mb-3 flex flex-col gap-3 rounded-md border bg-background/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">思考功能</div>
                    <div className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {item.reasoningEnabled
                        ? "当前会返回并展示模型思考内容。"
                        : "当前会隐藏思考内容；MiniMax 会自动启用分离与清洗，避免 <think> 泄漏到正文。"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
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
                    <div className="space-y-1 break-words [overflow-wrap:anywhere]">
                      <div className="text-xs font-medium text-muted-foreground">余额</div>
                      <div className="text-sm text-muted-foreground">
                        自定义 OpenAI-compatible 厂商暂不接入余额查询。
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
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
                          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 break-words [overflow-wrap:anywhere]">
                            {balance.cashBalance !== null ? <div>现金余额：{formatBalanceAmount(balance.cashBalance, balance.currency)}</div> : null}
                            {balance.voucherBalance !== null ? <div>代金券余额：{formatBalanceAmount(balance.voucherBalance, balance.currency)}</div> : null}
                            {balance.chargeBalance !== null ? <div>充值余额：{formatBalanceAmount(balance.chargeBalance, balance.currency)}</div> : null}
                            {balance.toppedUpBalance !== null ? <div>累计充值：{formatBalanceAmount(balance.toppedUpBalance, balance.currency)}</div> : null}
                            {balance.grantedBalance !== null ? <div>赠送额度：{formatBalanceAmount(balance.grantedBalance, balance.currency)}</div> : null}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                            {balance?.error ?? balance?.message ?? (item.isConfigured ? "当前暂未获取余额信息。" : "请先配置 API Key。")}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="mb-3 space-y-2">
                  <div className="flex min-w-0 flex-wrap gap-1">
                    {(isProviderExpanded(item.provider)
                      ? item.models
                      : item.models.slice(0, MODEL_BADGE_COLLAPSE_COUNT)
                    ).map((model) => (
                      <Badge
                        key={model}
                        variant={model === item.currentModel ? "default" : "outline"}
                        className={model === item.currentModel
                          ? "max-w-full whitespace-normal break-words bg-primary text-left [overflow-wrap:anywhere]"
                          : "max-w-full whitespace-normal break-words text-left [overflow-wrap:anywhere]"}
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
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <Button size="sm" className="w-full sm:w-auto" onClick={() => openBuiltInDialog(item.provider)}>
                    {item.kind === "custom" ? "编辑" : "Configure"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full sm:w-auto"
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
                    className="w-full sm:w-auto"
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
                      className="w-full sm:w-auto"
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

      <SettingsActionResult message={actionResult} />

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            resetDialogState();
          }
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto">
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

            {canSelectListedModels ? (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Available models</div>
                <SearchableSelect
                  value={form.model}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, model: value }))}
                  options={modelOptions.map((model) => ({ value: model }))}
                  placeholder="Select a model"
                  searchPlaceholder="Search models"
                  emptyText="No models available"
                />
              </div>
            ) : null}

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">{primaryModelLabel}</div>
              {isCreatingCustomProvider ? (
                <div className="text-xs text-muted-foreground">
                  New custom providers do not have a model list yet. Enter one working default model name first,
                  then save and use "Refresh models" on the provider card afterwards.
                </div>
              ) : editingConfig?.kind === "custom" && !canSelectListedModels ? (
                <div className="text-xs text-muted-foreground">
                  No remote model list is available yet. You can keep editing the default model name manually and
                  refresh the model list later from the provider card.
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  You can also type a model name manually if it is not listed above.
                </div>
              )}
            </div>
            <Input
              value={form.model}
              placeholder="也可以直接手动输入模型名"
              onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
            />

            {editingConfig?.supportsImageGeneration ? (
              <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Image model</div>
                  <SearchableSelect
                    value={form.imageModel}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, imageModel: value }))}
                    options={(editingConfig.imageModels ?? []).map((model) => ({ value: model }))}
                    placeholder="Select an image model"
                    searchPlaceholder="Search image models"
                    emptyText="No image models available"
                  />
                </div>
                <Input
                  value={form.imageModel}
                  placeholder={editingConfig.defaultImageModel ?? "Enter image model"}
                  onChange={(event) => setForm((prev) => ({ ...prev, imageModel: event.target.value }))}
                />
                <div className="text-xs text-muted-foreground">
                  Used by the built-in image generation flow for this provider.
                </div>
              </div>
            ) : null}

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

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Button
                className="w-full sm:w-auto"
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
                    imageModel: editingConfig?.supportsImageGeneration
                      ? (form.imageModel.trim() || undefined)
                      : undefined,
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
                {saveMutation.isPending || createCustomProviderMutation.isPending
                  ? "Saving..."
                  : isCreatingCustomProvider
                    ? "Create provider"
                    : "Save"}
              </Button>

              <Button
                variant="secondary"
                className="w-full sm:w-auto"
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
                  className="col-span-2 w-full sm:col-span-1 sm:w-auto"
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
            {testResult ? <div className="break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{testResult}</div> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
