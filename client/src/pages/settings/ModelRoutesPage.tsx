import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { APIKeyStatus } from "@/api/settings";
import { getAPIKeySettings, getModelRoutes, saveModelRoute } from "@/api/settings";
import { queryKeys } from "@/api/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MODEL_ROUTE_LABELS } from "./modelRouteLabels";
import type { ModelRouteTaskType } from "@ai-novel/shared/types/novel";

interface RouteDraft {
  provider: string;
  model: string;
  temperature: string;
  maxTokens: string;
}

function getProviderConfig(providerConfigs: APIKeyStatus[], provider: string) {
  return providerConfigs.find((item) => item.provider === provider);
}

function getModelOptions(providerConfigs: APIKeyStatus[], provider: string, currentModel: string): string[] {
  const config = getProviderConfig(providerConfigs, provider);
  const models = config?.models ?? [];
  return [...new Set([currentModel, ...models].filter(Boolean))];
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.modelRoutes });
    },
  });

  const providerConfigs = useMemo(() => apiKeySettingsQuery.data?.data ?? [], [apiKeySettingsQuery.data?.data]);
  const modelRoutes = modelRoutesQuery.data?.data;
  const routeMap = useMemo(() => new Map((modelRoutes?.routes ?? []).map((item) => [item.taskType, item])), [modelRoutes?.routes]);

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
        <CardContent className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            `服务商` 和 `模型` 已改为下拉选择，减少手填错误。温度和最大输出长度仍可按任务单独调节。
          </div>
          <Button asChild variant="outline">
            <Link to="/settings">返回系统设置</Link>
          </Button>
        </CardContent>
      </Card>

      {(modelRoutes?.taskTypes ?? []).map((taskType) => {
        const draft = getRouteDraft(taskType);
        const providerOptions = providerConfigs.map((item) => item.provider);
        const modelOptions = getModelOptions(providerConfigs, draft.provider, draft.model);
        const label = MODEL_ROUTE_LABELS[taskType];
        const providerName = getProviderConfig(providerConfigs, draft.provider)?.name ?? draft.provider;

        return (
          <Card key={taskType}>
            <CardHeader>
              <CardTitle>{label.title}</CardTitle>
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
                  <Select
                    value={draft.model || undefined}
                    onValueChange={(value) => patchDraft(taskType, { model: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择模型" />
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions.length > 0 ? modelOptions.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      )) : (
                        <SelectItem value="__empty__" disabled>
                          当前服务商暂无可选模型
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
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
                <div className="text-xs text-muted-foreground">
                  当前服务商：{providerName}。未填写的字段会回退到系统默认路由。
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
