import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import {
  type APIKeyStatus,
  createCustomProvider,
  deleteCustomProvider,
  getAPIKeySettings,
  getModelRoutes,
  getProviderBalances,
  getRagSettings,
  getStyleEngineRuntimeSettings,
  previewCustomProviderModels,
  refreshProviderBalance,
  refreshProviderModelList,
  saveAPIKeySetting,
  testLLMConnection,
  testModelRouteConnectivity,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import AutoDirectorSettingsSection from "./AutoDirectorSettingsSection";
import ProviderConfigDialog, { type ProviderFormState } from "./components/ProviderConfigDialog";
import ProviderSettingsSection from "./components/ProviderSettingsSection";
import SettingsMaintenanceSection from "./components/SettingsMaintenanceSection";
import SettingsNavigationCards from "./components/SettingsNavigationCards";
import SettingsReadinessCard, { buildSettingsReadinessItems } from "./components/SettingsReadinessCard";
import SettingsSectionGroup from "./components/SettingsSectionGroup";
import StyleEngineRuntimeSettingsCard from "./components/StyleEngineRuntimeSettingsCard";
import SettingsActionResult from "./SettingsActionResult";
import { AUTO_DIRECTOR_MOBILE_CLASSES } from "@/mobile/autoDirector";

function formatConnectionTestResult(response: Awaited<ReturnType<typeof testLLMConnection>>): string {
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
  return `连接成功，总耗时 ${latency}ms · ${plainText} · ${structuredText}`;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [editingProvider, setEditingProvider] = useState("");
  const [isCreatingCustomProvider, setIsCreatingCustomProvider] = useState(false);
  const [form, setForm] = useState<ProviderFormState>({
    displayName: "",
    key: "",
    model: "",
    imageModel: "",
    baseURL: "",
    concurrencyLimit: "0",
    requestIntervalMs: "0",
  });
  const [dialogTestResult, setDialogTestResult] = useState("");
  const [providerTestResults, setProviderTestResults] = useState<Record<string, string>>({});
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

  const ragSettingsQuery = useQuery({
    queryKey: queryKeys.settings.rag,
    queryFn: getRagSettings,
  });

  const styleEngineRuntimeQuery = useQuery({
    queryKey: queryKeys.settings.styleEngineRuntime,
    queryFn: getStyleEngineRuntimeSettings,
  });

  const modelRoutesQuery = useQuery({
    queryKey: queryKeys.settings.modelRoutes,
    queryFn: getModelRoutes,
  });

  const modelRouteConnectivityQuery = useQuery({
    queryKey: queryKeys.settings.modelRouteConnectivity,
    queryFn: testModelRouteConnectivity,
    enabled: modelRoutesQuery.isSuccess,
    refetchOnWindowFocus: false,
  });

  const providerConfigs = useMemo(() => apiKeySettingsQuery.data?.data ?? [], [apiKeySettingsQuery.data?.data]);
  const editingConfig = useMemo(
    () => providerConfigs.find((item) => item.provider === editingProvider),
    [editingProvider, providerConfigs],
  );
  const isDialogOpen = isCreatingCustomProvider || Boolean(editingProvider);
  const isCustomDialog = isCreatingCustomProvider || editingConfig?.kind === "custom";
  const modelOptions = editingConfig?.models ?? [];
  const selectableModels = isCreatingCustomProvider ? previewModels : modelOptions;
  const readinessItems = useMemo(
    () => buildSettingsReadinessItems({
      providers: providerConfigs,
      ragSettings: ragSettingsQuery.data?.data,
      styleSettings: styleEngineRuntimeQuery.data?.data,
      modelRoutes: modelRoutesQuery.data?.data,
      modelRouteConnectivity: modelRouteConnectivityQuery.data?.data,
      isModelRoutesChecking: modelRouteConnectivityQuery.isPending || modelRouteConnectivityQuery.isFetching,
      isStyleSettingsLoaded: styleEngineRuntimeQuery.isSuccess,
    }),
    [
      providerConfigs,
      ragSettingsQuery.data?.data,
      styleEngineRuntimeQuery.data?.data,
      styleEngineRuntimeQuery.isSuccess,
      modelRoutesQuery.data?.data,
      modelRouteConnectivityQuery.data?.data,
      modelRouteConnectivityQuery.isPending,
      modelRouteConnectivityQuery.isFetching,
    ],
  );

  const resetDialogState = () => {
    setEditingProvider("");
    setIsCreatingCustomProvider(false);
    setForm({
      displayName: "",
      key: "",
      model: "",
      imageModel: "",
      baseURL: "",
      concurrencyLimit: "0",
      requestIntervalMs: "0",
    });
    setDialogTestResult("");
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

  const updateProviderModelsInCache = (provider: string, models: string[], currentModel: string) => {
    queryClient.setQueryData<ApiResponse<APIKeyStatus[]>>(queryKeys.settings.apiKeys, (previous) => {
      if (!previous?.data) {
        return previous;
      }
      return {
        ...previous,
        data: previous.data.map((item) => item.provider === provider
          ? {
            ...item,
            models,
            currentModel,
          }
          : item),
      };
    });
  };

  const invalidateProviderAuxiliaryQueries = async () => {
    await Promise.all([
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
      concurrencyLimit?: number;
      requestIntervalMs?: number;
    }) =>
      saveAPIKeySetting(payload.provider, {
        displayName: payload.displayName,
        key: payload.key,
        model: payload.model,
        imageModel: payload.imageModel,
        baseURL: payload.baseURL,
        concurrencyLimit: payload.concurrencyLimit,
        requestIntervalMs: payload.requestIntervalMs,
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
      imageModel?: string;
      baseURL: string;
      concurrencyLimit?: number;
      requestIntervalMs?: number;
    }) => createCustomProvider(payload),
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
    mutationFn: testLLMConnection,
  });

  const refreshModelsMutation = useMutation({
    mutationFn: (provider: LLMProvider) => refreshProviderModelList(provider),
    onSuccess: async (response, provider) => {
      const count = response.data?.models?.length ?? 0;
      const providerName = providerConfigs.find((item) => item.provider === provider)?.name ?? provider;
      if (response.data) {
        updateProviderModelsInCache(response.data.provider, response.data.models, response.data.currentModel);
      }
      setActionResult(`${providerName} 模型列表已刷新（${count} 个）。`);
      await invalidateProviderAuxiliaryQueries();
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
      concurrencyLimit: String(config.concurrencyLimit ?? 0),
      requestIntervalMs: String(config.requestIntervalMs ?? 0),
    });
    setDialogTestResult("");
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
      concurrencyLimit: "0",
      requestIntervalMs: "0",
    });
    setDialogTestResult("");
    setActionResult("");
    setPreviewModels([]);
    setPreviewModelsResult("");
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
        imageModel: form.imageModel.trim(),
        baseURL: form.baseURL.trim(),
        concurrencyLimit: Number.parseInt(form.concurrencyLimit, 10) || 0,
        requestIntervalMs: Number.parseInt(form.requestIntervalMs, 10) || 0,
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
      imageModel: form.imageModel.trim(),
      baseURL: form.baseURL,
      concurrencyLimit: Number.parseInt(form.concurrencyLimit, 10) || 0,
      requestIntervalMs: Number.parseInt(form.requestIntervalMs, 10) || 0,
    });
  };

  const handleProviderCardTest = (provider: APIKeyStatus) => {
    setProviderTestResults((prev) => ({
      ...prev,
      [provider.provider]: "",
    }));
    testMutation.mutate(
      {
        provider: provider.provider,
        model: provider.currentModel || undefined,
        baseURL: provider.currentBaseURL || undefined,
      },
      {
        onSuccess: (response) => {
          setProviderTestResults((prev) => ({
            ...prev,
            [provider.provider]: formatConnectionTestResult(response),
          }));
        },
        onError: (error) => {
          setProviderTestResults((prev) => ({
            ...prev,
            [provider.provider]: error instanceof Error ? error.message : "连接测试失败。",
          }));
        },
      },
    );
  };

  const handleTestProviderDialog = () => {
    testMutation.mutate(
      {
        provider: editingProvider || "custom_preview",
        apiKey: form.key.trim() ? form.key : undefined,
        model: form.model.trim() || undefined,
        baseURL: form.baseURL.trim() ? form.baseURL : undefined,
        probeMode: "both",
      },
      {
        onSuccess: (response) => {
          setDialogTestResult(formatConnectionTestResult(response));
        },
        onError: (error) => {
          setDialogTestResult(error instanceof Error ? error.message : "连接测试失败。");
        },
      },
    );
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
      <SettingsSectionGroup
        title="开始创作必需"
        description="先让模型和任务路由可用，新手就能进入自动导演、开书和章节生产。"
        status="required"
      >
        <SettingsReadinessCard items={readinessItems} />
        <ProviderSettingsSection
          providers={providerConfigs}
          balances={providerBalancesQuery.data?.data ?? []}
          isBalanceLoading={providerBalancesQuery.isLoading}
          testingProvider={testMutation.variables?.provider}
          providerTestResults={providerTestResults}
          refreshingModelProvider={refreshModelsMutation.variables}
          refreshingBalanceProvider={refreshBalanceMutation.variables}
          reasoningProvider={toggleReasoningMutation.variables?.provider}
          onCreateCustomProvider={openCreateCustomDialog}
          onOpenConfig={openBuiltInDialog}
          onTest={handleProviderCardTest}
          onRefreshModels={(provider) => {
            setActionResult("");
            refreshModelsMutation.mutate(provider);
          }}
          onRefreshBalance={(provider) => {
            setActionResult("");
            refreshBalanceMutation.mutate(provider);
          }}
          onToggleReasoning={(provider, reasoningEnabled) => {
            setActionResult("");
            toggleReasoningMutation.mutate({
              provider,
              reasoningEnabled,
            });
          }}
        />
        <SettingsNavigationCards mode="routes" />
      </SettingsSectionGroup>

      <SettingsSectionGroup
        title="写作质量增强"
        description="这些设置会提高长篇连续性、资料召回和写法学习效果；不影响你先开始创作。"
        status="enhancement"
      >
        <SettingsNavigationCards mode="knowledge" />
        <StyleEngineRuntimeSettingsCard />
      </SettingsSectionGroup>

      <SettingsSectionGroup
        title="自动导演高级"
        description="需要自动确认审批点或接入钉钉、企业微信跟进时，再展开这里配置。"
        status="advanced"
      >
        <AutoDirectorSettingsSection onActionResult={setActionResult} />
      </SettingsSectionGroup>

      <SettingsSectionGroup
        title="系统维护"
        description="桌面更新和旧数据导入放在这里，避免打断日常创作配置。"
        status="maintenance"
      >
        <SettingsMaintenanceSection />
      </SettingsSectionGroup>

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
        testResult={dialogTestResult}
        onDeleteCustomProvider={handleDeleteCustomProvider}
        deleteDisabled={deleteCustomProviderMutation.isPending}
        deleteLabel={deleteCustomProviderMutation.isPending ? "删除中..." : "删除"}
      />
    </div>
  );
}
