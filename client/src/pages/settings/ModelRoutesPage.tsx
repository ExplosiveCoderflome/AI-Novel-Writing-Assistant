import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  APIKeyStatus,
  ModelRouteConnectivityStatus,
  StructuredFallbackSettings,
} from "@/api/settings";
import {
  getAPIKeySettings,
  getModelRoutes,
  getStructuredFallbackConfig,
  saveModelRoute,
  saveStructuredFallbackConfig,
  testModelRouteConnectivity,
} from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import SearchableSelect from "@/components/common/SearchableSelect";
import { MODEL_ROUTE_LABELS } from "./modelRouteLabels";
import type { ModelRouteTaskType } from "@ai-novel/shared/types/novel";

interface RouteDraft {
  provider: string;
  model: string;
  temperature: string;
  maxTokens: string;
}

interface StructuredFallbackDraft {
  enabled: boolean;
  provider: string;
  model: string;
  temperature: string;
  maxTokens: string;
}

type ConnectivityState = "idle" | "checking" | "healthy" | "failed";

function getProviderConfig(providerConfigs: APIKeyStatus[], provider: string) {
  return providerConfigs.find((item) => item.provider === provider);
}

function getModelOptions(providerConfigs: APIKeyStatus[], provider: string, currentModel: string): string[] {
  const config = getProviderConfig(providerConfigs, provider);
  const models = config?.models ?? [];
  return [...new Set([currentModel, ...models].filter(Boolean))];
}

function formatStructuredStatus(status: ModelRouteConnectivityStatus["structured"]): string {
  if (!status) {
    return "结构化诊断：未执行";
  }
  if (status.ok) {
    return `结构化正常 · ${status.strategy ?? "prompt_json"}${status.reasoningForcedOff ? " · 已强制关闭 thinking" : ""}`;
  }
  return `结构化异常 · ${status.errorCategory ?? "unknown"} · ${status.error ?? "未知错误"}`;
}

function formatConnectivityStatus(status?: ModelRouteConnectivityStatus | null): string {
  if (!status) {
    return "尚未检测当前生效路由。";
  }
  const parts: string[] = [];
  if (status.plain) {
    parts.push(
      status.plain.ok
        ? `普通连通正常${status.plain.latency != null ? ` · ${status.plain.latency}ms` : ""}`
        : `普通连通失败 · ${status.plain.error ?? "未知错误"}`,
    );
  }
  parts.push(formatStructuredStatus(status.structured));
  return `${status.provider} / ${status.model} · ${parts.join(" · ")}`;
}

function RouteStatusDot({ state }: { state: ConnectivityState }) {
  const colorClass = state === "healthy"
    ? "bg-emerald-500"
    : state === "failed"
      ? "bg-red-500"
      : state === "checking"
        ? "bg-amber-400"
        : "bg-slate-300";

  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorClass}`} aria-hidden="true" />;
}

function resolveConnectivityState(
  status: ModelRouteConnectivityStatus | undefined,
  checking: boolean,
): ConnectivityState {
  if (checking) {
    return "checking";
  }
  if (!status) {
    return "idle";
  }
  if ((status.plain && !status.plain.ok) || (status.structured && !status.structured.ok)) {
    return "failed";
  }
  if (status.plain?.ok || status.structured?.ok) {
    return "healthy";
  }
  return "idle";
}

export default function ModelRoutesPage() {
  const queryClient = useQueryClient();
  const [actionResult, setActionResult] = useState("");
  const [routeDrafts, setRouteDrafts] = useState<Record<string, RouteDraft>>({});
  const [structuredFallbackDraft, setStructuredFallbackDraft] = useState<StructuredFallbackDraft | null>(null);

  const apiKeySettingsQuery = useQuery({
    queryKey: queryKeys.settings.apiKeys,
    queryFn: getAPIKeySettings,
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

  const structuredFallbackQuery = useQuery({
    queryKey: queryKeys.settings.structuredFallback,
    queryFn: getStructuredFallbackConfig,
    refetchOnWindowFocus: false,
  });

  const saveModelRouteMutation = useMutation({
    mutationFn: (payload: {
      taskType: ModelRouteTaskType;
      provider: string;
      model: string;
      temperature: number;
      maxTokens?: number | null;
    }) => saveModelRoute(payload),
    onSuccess: async () => {
      setActionResult("模型路由已更新。");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.modelRoutes }),
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.modelRouteConnectivity }),
      ]);
    },
  });

  const saveStructuredFallbackMutation = useMutation({
    mutationFn: (payload: Partial<StructuredFallbackSettings>) => saveStructuredFallbackConfig(payload),
    onSuccess: async () => {
      setActionResult("结构化备用模型配置已更新。");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.structuredFallback }),
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.modelRouteConnectivity }),
      ]);
    },
  });

  const providerConfigs = useMemo(() => apiKeySettingsQuery.data?.data ?? [], [apiKeySettingsQuery.data?.data]);
  const modelRoutes = modelRoutesQuery.data?.data;
  const modelRouteConnectivity = modelRouteConnectivityQuery.data?.data;
  const structuredFallback = structuredFallbackQuery.data?.data;
  const providerOptions = useMemo(() => providerConfigs.map((item) => item.provider), [providerConfigs]);
  const routeMap = useMemo(() => new Map((modelRoutes?.routes ?? []).map((item) => [item.taskType, item])), [modelRoutes?.routes]);
  const connectivityMap = useMemo(
    () => new Map((modelRouteConnectivity?.statuses ?? []).map((item) => [item.taskType, item])),
    [modelRouteConnectivity?.statuses],
  );
  const connectivitySummary = useMemo(() => {
    const statuses = modelRouteConnectivity?.statuses ?? [];
    return {
      total: statuses.length,
      healthy: statuses.filter((item) => (item.plain?.ok ?? true) && (item.structured?.ok ?? true)).length,
      failed: statuses.filter((item) => (item.plain && !item.plain.ok) || (item.structured && !item.structured.ok)).length,
      testedAt: modelRouteConnectivity?.testedAt ?? "",
    };
  }, [modelRouteConnectivity?.statuses, modelRouteConnectivity?.testedAt]);

  function getRouteDraft(taskType: ModelRouteTaskType): RouteDraft {
    const existing = routeDrafts[taskType];
    if (existing) {
      return existing;
    }
    const route = routeMap.get(taskType);
    return {
      provider: route?.provider ?? "deepseek",
      model: route?.model ?? "",
      temperature: route?.temperature != null ? String(route.temperature) : "0.7",
      maxTokens: route?.maxTokens != null ? String(route.maxTokens) : "",
    };
  }

  function patchDraft(taskType: ModelRouteTaskType, patch: Partial<RouteDraft>) {
    const current = getRouteDraft(taskType);
    setRouteDrafts((prev) => ({
      ...prev,
      [taskType]: {
        ...current,
        ...patch,
      },
    }));
  }

  function getStructuredFallbackDraft(): StructuredFallbackDraft {
    if (structuredFallbackDraft) {
      return structuredFallbackDraft;
    }
    return {
      enabled: structuredFallback?.enabled ?? false,
      provider: structuredFallback?.provider ?? "deepseek",
      model: structuredFallback?.model ?? "deepseek-chat",
      temperature: structuredFallback != null ? String(structuredFallback.temperature) : "0.2",
      maxTokens: structuredFallback?.maxTokens != null ? String(structuredFallback.maxTokens) : "",
    };
  }

  function patchStructuredFallbackDraft(patch: Partial<StructuredFallbackDraft>) {
    const current = getStructuredFallbackDraft();
    setStructuredFallbackDraft({
      ...current,
      ...patch,
    });
  }

  const fallbackDraft = getStructuredFallbackDraft();
  const fallbackModelOptions = getModelOptions(providerConfigs, fallbackDraft.provider, fallbackDraft.model);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>模型路由管理</CardTitle>
          <CardDescription>
            把不同任务分配给不同模型，并单独观察结构化输出稳定性。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2 text-sm text-muted-foreground">
            <div>当前会同时检测普通连通性和结构化输出兼容性。未保存的表单修改不会参与检测。</div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-2">
                <RouteStatusDot
                  state={modelRouteConnectivityQuery.isPending || modelRouteConnectivityQuery.isFetching
                    ? "checking"
                    : connectivitySummary.failed > 0
                      ? "failed"
                      : connectivitySummary.total > 0
                        ? "healthy"
                        : "idle"}
                />
                {modelRouteConnectivityQuery.isPending || modelRouteConnectivityQuery.isFetching
                  ? "正在检测当前生效路由..."
                  : connectivitySummary.total > 0
                    ? `已检测 ${connectivitySummary.total} 条路由，全部健康 ${connectivitySummary.healthy}，异常 ${connectivitySummary.failed}`
                    : "尚未执行模型兼容性检测"}
              </span>
              {connectivitySummary.testedAt ? (
                <span>检测时间：{new Date(connectivitySummary.testedAt).toLocaleString()}</span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void modelRouteConnectivityQuery.refetch()}
              disabled={modelRouteConnectivityQuery.isFetching || !modelRoutesQuery.isSuccess}
            >
              {modelRouteConnectivityQuery.isFetching ? "检测中..." : "重新检测"}
            </Button>
            <Button asChild variant="outline">
              <Link to="/settings">返回系统设置</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>结构化备用模型</CardTitle>
          <CardDescription>
            当前模型普通对话可用但 JSON 不稳时，可在所有结构化任务上统一启用备用模型。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="font-medium">启用全局结构化回退</div>
              <div className="text-sm text-muted-foreground">
                只有当前模型的结构化策略全部失败后，才会切到这套备用模型。
              </div>
            </div>
            <Switch
              checked={fallbackDraft.enabled}
              onCheckedChange={(checked) => patchStructuredFallbackDraft({ enabled: checked })}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">服务商</div>
              <Select
                value={fallbackDraft.provider}
                onValueChange={(value) => {
                  const nextModel = getProviderConfig(providerConfigs, value)?.currentModel ?? "";
                  patchStructuredFallbackDraft({
                    provider: value,
                    model: nextModel || fallbackDraft.model,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择服务商" />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {getProviderConfig(providerConfigs, provider)?.name ?? provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">模型</div>
              <SearchableSelect
                value={fallbackDraft.model || undefined}
                onValueChange={(value) => patchStructuredFallbackDraft({ model: value })}
                options={fallbackModelOptions.map((model) => ({ value: model }))}
                placeholder="选择模型"
                searchPlaceholder="搜索模型"
                emptyText="当前服务商暂无可选模型"
              />
              <Input
                value={fallbackDraft.model}
                placeholder="也可以手动输入模型名"
                onChange={(event) => patchStructuredFallbackDraft({ model: event.target.value })}
              />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">温度</div>
              <Input
                value={fallbackDraft.temperature}
                placeholder="0.2"
                onChange={(event) => patchStructuredFallbackDraft({ temperature: event.target.value })}
              />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">最大输出长度</div>
              <Input
                value={fallbackDraft.maxTokens}
                placeholder="留空则使用系统默认"
                onChange={(event) => patchStructuredFallbackDraft({ maxTokens: event.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              size="sm"
              onClick={() => saveStructuredFallbackMutation.mutate({
                enabled: fallbackDraft.enabled,
                provider: fallbackDraft.provider,
                model: fallbackDraft.model,
                temperature: Number(fallbackDraft.temperature || 0.2),
                maxTokens: fallbackDraft.maxTokens.trim() ? Number(fallbackDraft.maxTokens) : null,
              })}
              disabled={saveStructuredFallbackMutation.isPending || !fallbackDraft.provider.trim() || !fallbackDraft.model.trim()}
            >
              {saveStructuredFallbackMutation.isPending ? "保存中..." : "保存备用模型"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {(modelRoutes?.taskTypes ?? []).map((taskType) => {
        const draft = getRouteDraft(taskType);
        const modelOptions = getModelOptions(providerConfigs, draft.provider, draft.model);
        const label = MODEL_ROUTE_LABELS[taskType];
        const providerName = getProviderConfig(providerConfigs, draft.provider)?.name ?? draft.provider;
        const connectivity = connectivityMap.get(taskType);
        const connectivityState = resolveConnectivityState(
          connectivity,
          modelRouteConnectivityQuery.isPending || modelRouteConnectivityQuery.isFetching,
        );
        const hasUnsavedRouteDiff = connectivity != null
          && (draft.provider !== connectivity.provider || (draft.model.trim().length > 0 && draft.model !== connectivity.model));

        return (
          <Card key={taskType}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span>{label.title}</span>
                <span className="inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                  <RouteStatusDot state={connectivityState} />
                  {connectivityState === "healthy"
                    ? "兼容性正常"
                    : connectivityState === "failed"
                      ? "存在异常"
                      : connectivityState === "checking"
                        ? "检测中"
                        : "未检测"}
                </span>
              </CardTitle>
              <CardDescription>
                {label.description}
                <span className="ml-2 text-xs">标识：{taskType}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">服务商</div>
                  <Select
                    value={draft.provider}
                    onValueChange={(value) => {
                      const fallbackModel = getProviderConfig(providerConfigs, value)?.currentModel ?? "";
                      patchDraft(taskType, {
                        provider: value,
                        model: fallbackModel,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择服务商" />
                    </SelectTrigger>
                    <SelectContent>
                      {providerOptions.map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          {getProviderConfig(providerConfigs, provider)?.name ?? provider}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">模型</div>
                  <SearchableSelect
                    value={draft.model || undefined}
                    onValueChange={(value) => patchDraft(taskType, { model: value })}
                    options={modelOptions.map((model) => ({ value: model }))}
                    placeholder="选择模型"
                    searchPlaceholder="搜索模型"
                    emptyText="当前服务商暂无可选模型"
                  />
                  <Input
                    value={draft.model}
                    placeholder="也可以直接手动输入模型名"
                    onChange={(event) => patchDraft(taskType, { model: event.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">温度</div>
                  <Input
                    value={draft.temperature}
                    placeholder="0.7"
                    onChange={(event) => patchDraft(taskType, { temperature: event.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">最大输出长度</div>
                  <Input
                    value={draft.maxTokens}
                    placeholder="留空则回退默认"
                    onChange={(event) => patchDraft(taskType, { maxTokens: event.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>表单当前选择：{providerName}。未填写字段会回退到系统默认路由。</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <RouteStatusDot state={connectivityState} />
                    <span>{formatConnectivityStatus(connectivity)}</span>
                  </div>
                  {connectivity?.structured ? (
                    <div>
                      结构化策略：{connectivity.structured.strategy ?? "无"}，
                      {connectivity.structured.reasoningForcedOff ? "已强制关闭 thinking" : "未强制关闭 thinking"}，
                      {connectivity.structured.fallbackAvailable ? "已配置备用模型" : "未配置备用模型"}
                    </div>
                  ) : null}
                  {hasUnsavedRouteDiff ? (
                    <div>当前检测基于已生效路由；保存后会自动重新检测。</div>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  onClick={() => saveModelRouteMutation.mutate({
                    taskType,
                    provider: draft.provider,
                    model: draft.model,
                    temperature: Number(draft.temperature || 0.7),
                    maxTokens: draft.maxTokens.trim() ? Number(draft.maxTokens) : null,
                  })}
                  disabled={saveModelRouteMutation.isPending || !draft.provider.trim() || !draft.model.trim()}
                >
                  保存路由
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {actionResult ? <div className="text-sm text-muted-foreground">{actionResult}</div> : null}
    </div>
  );
}
