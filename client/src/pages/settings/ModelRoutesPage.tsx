import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { APIKeyStatus, ModelRouteConnectivityStatus } from "@/api/settings";
import { getAPIKeySettings, getModelRoutes, saveModelRoute, testModelRouteConnectivity } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SearchableSelect from "@/components/common/SearchableSelect";
import { MODEL_ROUTE_LABELS } from "./modelRouteLabels";
import type { ModelRouteTaskType } from "@ai-novel/shared/types/novel";

interface RouteDraft {
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

function formatConnectivityStatus(status?: ModelRouteConnectivityStatus | null): string {
  if (!status) {
    return "尚未检测当前生效路由。";
  }
  if (status.ok) {
    return `连接正常：${status.provider} / ${status.model}${status.latency != null ? ` · ${status.latency}ms` : ""}`;
  }
  return `连接失败：${status.provider} / ${status.model} · ${status.error ?? "未知错误"}`;
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

export default function ModelRoutesPage() {
  const queryClient = useQueryClient();
  const [actionResult, setActionResult] = useState("");
  const [routeDrafts, setRouteDrafts] = useState<Record<string, RouteDraft>>({});

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

  const providerConfigs = useMemo(() => apiKeySettingsQuery.data?.data ?? [], [apiKeySettingsQuery.data?.data]);
  const modelRoutes = modelRoutesQuery.data?.data;
  const modelRouteConnectivity = modelRouteConnectivityQuery.data?.data;
  const routeMap = useMemo(() => new Map((modelRoutes?.routes ?? []).map((item) => [item.taskType, item])), [modelRoutes?.routes]);
  const connectivityMap = useMemo(
    () => new Map((modelRouteConnectivity?.statuses ?? []).map((item) => [item.taskType, item])),
    [modelRouteConnectivity?.statuses],
  );
  const connectivitySummary = useMemo(() => {
    const statuses = modelRouteConnectivity?.statuses ?? [];
    return {
      total: statuses.length,
      healthy: statuses.filter((item) => item.ok).length,
      failed: statuses.filter((item) => !item.ok).length,
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>模型路由管理台</CardTitle>
          <CardDescription>把不同的写作角色分配给不同模型，避免所有任务共用一套配置。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2 text-sm text-muted-foreground">
            <div>
              `服务商` 和 `模型` 已改为下拉选择，减少手填错误。温度和最大输出长度仍可按任务单独调节。
            </div>
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
                    ? `已检测 ${connectivitySummary.total} 个 Agent，正常 ${connectivitySummary.healthy}，异常 ${connectivitySummary.failed}`
                    : "尚未执行模型连通性检测"}
              </span>
              {connectivitySummary.testedAt ? (
                <span>检测时间：{new Date(connectivitySummary.testedAt).toLocaleString()}</span>
              ) : null}
              <span>未保存的表单修改不会参与连通性检测。</span>
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

      {(modelRoutes?.taskTypes ?? []).map((taskType) => {
        const draft = getRouteDraft(taskType);
        const providerOptions = providerConfigs.map((item) => item.provider);
        const modelOptions = getModelOptions(providerConfigs, draft.provider, draft.model);
        const label = MODEL_ROUTE_LABELS[taskType];
        const providerName = getProviderConfig(providerConfigs, draft.provider)?.name ?? draft.provider;
        const connectivity = connectivityMap.get(taskType);
        const connectivityState: ConnectivityState = modelRouteConnectivityQuery.isPending || modelRouteConnectivityQuery.isFetching
          ? "checking"
          : connectivity?.ok === true
            ? "healthy"
            : connectivity?.ok === false
              ? "failed"
              : "idle";
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
                    ? "连接正常"
                    : connectivityState === "failed"
                      ? "连接异常"
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
                  <div>表单当前选择：{providerName}。未填写的字段会回退到系统默认路由。</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <RouteStatusDot state={connectivityState} />
                    <span>{formatConnectivityStatus(connectivity)}</span>
                  </div>
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
