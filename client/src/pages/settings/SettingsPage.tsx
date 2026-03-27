import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SearchableSelect from "@/components/common/SearchableSelect";
import { queryKeys } from "@/api/queryKeys";
import {
  getAPIKeySettings,
  getRagSettings,
  refreshProviderModelList,
  saveAPIKeySetting,
  testLLMConnection,
} from "@/api/settings";

const MODEL_BADGE_COLLAPSE_COUNT = 8;

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [editingProvider, setEditingProvider] = useState<LLMProvider | "">("");
  const [expandedProviders, setExpandedProviders] = useState<Partial<Record<LLMProvider, boolean>>>({});
  const [form, setForm] = useState({
    key: "",
    model: "",
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

  const saveMutation = useMutation({
    mutationFn: (payload: { provider: LLMProvider; key: string; model?: string }) =>
      saveAPIKeySetting(payload.provider, {
        key: payload.key,
        model: payload.model,
      }),
    onSuccess: async (response) => {
      setEditingProvider("");
      setForm({ key: "", model: "" });
      setActionResult(response.message ?? "Saved.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.apiKeys });
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.rag });
    },
  });

  const testMutation = useMutation({
    mutationFn: (payload: { provider: LLMProvider; apiKey?: string; model?: string }) =>
      testLLMConnection(payload),
    onSuccess: (response) => {
      const latency = response.data?.latency ?? 0;
      setTestResult(`Connection ok, latency ${latency}ms`);
    },
    onError: () => {
      setTestResult("Connection failed. Check the API key and model.");
    },
  });

  const refreshModelsMutation = useMutation({
    mutationFn: (provider: LLMProvider) => refreshProviderModelList(provider),
    onSuccess: async (response, provider) => {
      const count = response.data?.models?.length ?? 0;
      const providerName = providerConfigs.find((item) => item.provider === provider)?.name ?? provider;
      setActionResult(`${providerName} models refreshed (${count}).`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.apiKeys });
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.rag });
      await queryClient.invalidateQueries({ queryKey: queryKeys.llm.providers });
    },
    onError: (error) => {
      setActionResult(error instanceof Error ? error.message : "Failed to refresh models.");
    },
  });

  const providerConfigs = useMemo(() => apiKeySettingsQuery.data?.data ?? [], [apiKeySettingsQuery.data?.data]);
  const editingConfig = useMemo(
    () => providerConfigs.find((item) => item.provider === editingProvider),
    [providerConfigs, editingProvider],
  );
  const ragSettings = ragSettingsQuery.data?.data;
  const ragProvider = useMemo(
    () => ragSettings?.providers.find((item) => item.provider === ragSettings.embeddingProvider),
    [ragSettings],
  );
  const isProviderExpanded = (provider: LLMProvider) => expandedProviders[provider] === true;
  const toggleProviderExpanded = (provider: LLMProvider) => {
    setExpandedProviders((prev) => ({
      ...prev,
      [provider]: !prev[provider],
    }));
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
          <CardDescription>把不同写作角色交给不同模型，建议在独立页面集中管理。</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            现在模型路由已经独立成管理台，支持按角色单独配置服务商和模型下拉选择。
          </div>
          <Button asChild>
            <Link to="/settings/model-routes">进入模型路由管理</Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Model Providers</CardTitle>
          <CardDescription>Manage provider API keys, default models, and connectivity tests.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {providerConfigs.map((item) => (
            <div
              key={item.provider}
              className={`rounded-md border p-3 transition-colors ${
                item.isConfigured
                  ? "border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20"
                  : "border-border"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="font-medium">{item.name}</div>
                <Badge
                  variant={item.isConfigured ? "default" : "outline"}
                  className={item.isConfigured ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}
                >
                  {item.isConfigured ? "Configured" : "Not configured"}
                </Badge>
              </div>
              <div className="mb-2 text-xs text-muted-foreground">Current model: {item.currentModel}</div>
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
                      ? `收起模型列表`
                      : `展开全部 ${item.models.length} 个模型`}
                  </button>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingProvider(item.provider);
                    setForm({
                      key: "",
                      model: item.currentModel,
                    });
                    setTestResult("");
                    setActionResult("");
                  }}
                >
                  Configure
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setTestResult("");
                    testMutation.mutate({
                      provider: item.provider,
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
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {actionResult ? <div className="text-sm text-muted-foreground">{actionResult}</div> : null}

      <Dialog open={Boolean(editingProvider)} onOpenChange={(open) => !open && setEditingProvider("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure API Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="password"
              value={form.key}
              placeholder="Enter API key"
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
            <div className="flex gap-2">
              <Button
                onClick={() =>
                  editingProvider &&
                  saveMutation.mutate({
                    provider: editingProvider,
                    key: form.key,
                    model: form.model || undefined,
                  })
                }
                disabled={saveMutation.isPending || !form.key.trim() || !form.model.trim()}
              >
                {saveMutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  editingProvider &&
                  testMutation.mutate({
                    provider: editingProvider,
                    apiKey: form.key || undefined,
                    model: form.model || undefined,
                  })
                }
                disabled={testMutation.isPending}
              >
                Test
              </Button>
            </div>
            {testResult ? <div className="text-sm text-muted-foreground">{testResult}</div> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
