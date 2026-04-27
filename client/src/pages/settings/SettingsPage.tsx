import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import {
  createCustomProvider,
  deleteCustomProvider,
  getAPIKeySettings,
  getProviderBalances,
  previewCustomProviderModels,
  refreshProviderBalance,
  refreshProviderModelList,
  saveAPIKeySetting,
  testLLMConnection,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import DesktopLegacyDataImportCard from "@/components/layout/DesktopLegacyDataImportCard";
import DesktopUpdateCard from "@/components/layout/DesktopUpdateCard";
import AutoDirectorSettingsSection from "./AutoDirectorSettingsSection";
import SettingsNavigationCards from "./components/SettingsNavigationCards";
import ProviderConfigDialog, { type ProviderFormState } from "./components/ProviderConfigDialog";
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
  const [form, setForm] = useState<ProviderFormState>({
    displayName: "",
    key: "",
    model: "",
    imageModel: "",
    baseURL: "",
  });
  const [testResult, setTestResult] = useState("");
  const [actionResult, setActionResult] = useState("");
  const [previewModels, setPreviewModels] = useState<string[]>([]);
  const [previewModelsResult, setPreviewModelsResult] = useState("");

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
    setPreviewModels([]);
    setPreviewModelsResult("");
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
      model?: string;
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

  const previewCustomProviderModelsMutation = useMutation({
    mutationFn: (payload: { key?: string; baseURL: string }) => previewCustomProviderModels(payload),
    onSuccess: (response) => {
      const models = response.data?.models ?? [];
      setPreviewModels(models);
      setPreviewModelsResult(response.message ?? `已获取 ${models.length} 个模型。`);
      setForm((prev) => ({
        ...prev,
        model: prev.model.trim() || models[0] || "",
      }));
    },
    onError: (error) => {
      setPreviewModels([]);
      setPreviewModelsResult(error instanceof Error ? error.message : "获取模型列表失败。");
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
  const selectableModels = isCreatingCustomProvider ? previewModels : modelOptions;

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
    setPreviewModels([]);
    setPreviewModelsResult("");
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
    setPreviewModels([]);
    setPreviewModelsResult("");
  };

  const canRefreshBalance = (provider: LLMProvider, kind: "builtin" | "custom", isConfigured: boolean) => {
    if (kind === "custom" || !isConfigured) {
      return false;
    }
    const balance = providerBalanceMap.get(provider);
    return Boolean(balance?.canRefresh ?? (provider === "deepseek" || provider === "siliconflow" || provider === "kimi"));
  };

  const clearPreviewModels = () => {
    setPreviewModels([]);
    setPreviewModelsResult("");
  };

  const handlePreviewCustomModels = () => {
    setPreviewModelsResult("");
    previewCustomProviderModelsMutation.mutate({
      key: form.key.trim() ? form.key : undefined,
      baseURL: form.baseURL.trim(),
    });
  };

  const handleSubmitProviderDialog = () => {
    if (isCreatingCustomProvider) {
      createCustomProviderMutation.mutate({
        name: form.displayName.trim(),
        key: form.key.trim() ? form.key : undefined,
        model: form.model.trim() || undefined,
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
      imageModel: editingConfig?.supportsImageGeneration ? (form.imageModel.trim() || undefined) : undefined,
      baseURL: form.baseURL,
    });
  };

  const handleTestProviderDialog = () => {
    testMutation.mutate({
      provider: editingProvider || "custom_preview",
      apiKey: form.key.trim() ? form.key : undefined,
      model: form.model.trim() || undefined,
      baseURL: form.baseURL.trim() ? form.baseURL : undefined,
      probeMode: "both",
    });
  };

  const handleDeleteCustomProvider = () => {
    if (!editingProvider || !editingConfig) {
      return;
    }
    if (!window.confirm(`确认删除自定义厂商 ${editingConfig.name} 吗？`)) {
      return;
    }
    deleteCustomProviderMutation.mutate(editingProvider);
  };

  const isSavingProvider = saveMutation.isPending || createCustomProviderMutation.isPending;
  const providerSubmitDisabled = isSavingProvider
    || previewCustomProviderModelsMutation.isPending
    || (!isCreatingCustomProvider && !form.model.trim())
    || (isCustomDialog && !form.displayName.trim())
    || (isCreatingCustomProvider && !form.baseURL.trim())
    || (!isCustomDialog && editingConfig?.requiresApiKey !== false && !form.key.trim() && !editingConfig?.isConfigured);
  const providerSubmitLabel = isSavingProvider ? "保存中..." : isCreatingCustomProvider ? "创建厂商" : "保存";

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
            <CardTitle>模型厂商</CardTitle>
            <CardDescription className="break-words [overflow-wrap:anywhere]">
              管理内置厂商连接，也可以新增 OpenAI 兼容的自定义厂商。
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
                    {item.isConfigured ? "已配置" : "未配置"}
                  </Badge>
                </div>
                <div className="mb-2 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">模型：{item.currentModel || "-"}</div>
                {item.supportsImageGeneration ? (
                  <div className="mb-2 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    图像模型：{item.currentImageModel || item.defaultImageModel || "-"}
                  </div>
                ) : null}
                <div className="mb-2 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">API 地址：{item.currentBaseURL || "-"}</div>
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
                        自定义 OpenAI 兼容厂商暂不接入余额查询。
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
                    {item.kind === "custom" ? "编辑" : "配置"}
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
                    测试连接
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
                      ? "刷新中..."
                      : "刷新模型"}
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
                      {isBalanceRefreshing ? "余额刷新中..." : "刷新余额"}
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <SettingsActionResult message={actionResult} />

      <ProviderConfigDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            resetDialogState();
          }
        }}
        isCreatingCustomProvider={isCreatingCustomProvider}
        isCustomDialog={isCustomDialog}
        editingConfig={editingConfig}
        form={form}
        setForm={setForm}
        selectableModels={selectableModels}
        previewModelsResult={previewModelsResult}
        isPreviewingModels={previewCustomProviderModelsMutation.isPending}
        onClearPreviewModels={clearPreviewModels}
        onPreviewModels={handlePreviewCustomModels}
        onSubmit={handleSubmitProviderDialog}
        submitDisabled={providerSubmitDisabled}
        submitLabel={providerSubmitLabel}
        onTest={handleTestProviderDialog}
        testDisabled={testMutation.isPending || !form.model.trim() || !form.baseURL.trim()}
        testResult={testResult}
        onDeleteCustomProvider={handleDeleteCustomProvider}
        deleteDisabled={deleteCustomProviderMutation.isPending}
        deleteLabel={deleteCustomProviderMutation.isPending ? "删除中..." : "删除"}
      />
    </div>
  );
}
