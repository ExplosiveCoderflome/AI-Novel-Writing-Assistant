import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryKeys } from "@/api/queryKeys";
import {
  type EmbeddingProvider,
  getAPIKeySettings,
  getRagSettings,
  refreshProviderModelList,
  saveAPIKeySetting,
  saveRagSettings,
  testLLMConnection,
} from "@/api/settings";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [editingProvider, setEditingProvider] = useState<LLMProvider | "">("");
  const [form, setForm] = useState({
    key: "",
    model: "",
  });
  const [ragForm, setRagForm] = useState<{
    embeddingProvider: EmbeddingProvider;
    embeddingModel: string;
  }>({
    embeddingProvider: "openai",
    embeddingModel: "text-embedding-3-small",
  });
  const [testResult, setTestResult] = useState<string>("");
  const [actionResult, setActionResult] = useState<string>("");

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
      setActionResult(response.message ?? "配置保存成功。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.apiKeys });
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.rag });
    },
  });

  const saveRagMutation = useMutation({
    mutationFn: saveRagSettings,
    onSuccess: async (response) => {
      setActionResult(response.message ?? "Embedding 设置已保存。");
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.rag });
    },
  });

  const testMutation = useMutation({
    mutationFn: (payload: { provider: LLMProvider; apiKey?: string; model?: string }) =>
      testLLMConnection(payload),
    onSuccess: (response) => {
      const latency = response.data?.latency ?? 0;
      setTestResult(`连接成功，延迟 ${latency}ms`);
    },
    onError: () => {
      setTestResult("连接失败，请检查 API Key 与模型配置。");
    },
  });

  const refreshModelsMutation = useMutation({
    mutationFn: (provider: LLMProvider) => refreshProviderModelList(provider),
    onSuccess: async (response, provider) => {
      const count = response.data?.models?.length ?? 0;
      const providerName = providerConfigs.find((item) => item.provider === provider)?.name ?? provider;
      setActionResult(`${providerName} 模型列表已更新（${count} 个）。`);
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.apiKeys });
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.rag });
      await queryClient.invalidateQueries({ queryKey: queryKeys.llm.providers });
    },
    onError: (error) => {
      setActionResult(error instanceof Error ? error.message : "刷新模型列表失败。");
    },
  });

  const providerConfigs = useMemo(() => apiKeySettingsQuery.data?.data ?? [], [apiKeySettingsQuery.data?.data]);
  const ragProviderConfigs = useMemo(
    () => ragSettingsQuery.data?.data?.providers ?? [],
    [ragSettingsQuery.data?.data?.providers],
  );
  const editingConfig = useMemo(
    () => providerConfigs.find((item) => item.provider === editingProvider),
    [providerConfigs, editingProvider],
  );
  const selectedRagProvider = useMemo(
    () => ragProviderConfigs.find((item) => item.provider === ragForm.embeddingProvider),
    [ragProviderConfigs, ragForm.embeddingProvider],
  );

  useEffect(() => {
    const data = ragSettingsQuery.data?.data;
    if (!data) {
      return;
    }
    setRagForm({
      embeddingProvider: data.embeddingProvider,
      embeddingModel: data.embeddingModel,
    });
  }, [ragSettingsQuery.data?.data]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Embedding 配置</CardTitle>
          <CardDescription>控制向量检索使用的嵌入 Provider 与模型。保存后立即生效，无需重启服务。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Embedding Provider</div>
              <Select
                value={ragForm.embeddingProvider}
                onValueChange={(value) =>
                  setRagForm((prev) => ({ ...prev, embeddingProvider: value as EmbeddingProvider }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择 Embedding Provider" />
                </SelectTrigger>
                <SelectContent>
                  {ragProviderConfigs.map((item) => (
                    <SelectItem key={item.provider} value={item.provider}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Embedding Model</div>
              <Input
                value={ragForm.embeddingModel}
                placeholder="例如 text-embedding-3-small"
                onChange={(event) => setRagForm((prev) => ({ ...prev, embeddingModel: event.target.value }))}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>当前 Provider：</span>
            <Badge variant="outline">{selectedRagProvider?.name ?? ragForm.embeddingProvider}</Badge>
            <Badge
              variant={selectedRagProvider?.isConfigured ? "default" : "outline"}
              className={selectedRagProvider?.isConfigured ? "bg-emerald-600 text-white hover:bg-emerald-600" : ""}
            >
              {selectedRagProvider?.isConfigured ? "API Key 已配置" : "API Key 未配置"}
            </Badge>
            <Badge variant={selectedRagProvider?.isActive ? "default" : "outline"}>
              {selectedRagProvider?.isActive ? "已启用" : "未启用"}
            </Badge>
          </div>
          {!selectedRagProvider?.isConfigured ? (
            <div className="text-sm text-amber-600">
              当前 Provider 还没有可用 API Key。先在下方“模型配置”里配置对应的 OpenAI 或 SiliconFlow Key。
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button
              onClick={() =>
                saveRagMutation.mutate({
                  embeddingProvider: ragForm.embeddingProvider,
                  embeddingModel: ragForm.embeddingModel.trim(),
                })
              }
              disabled={saveRagMutation.isPending || !ragForm.embeddingModel.trim()}
            >
              {saveRagMutation.isPending ? "保存中..." : "保存 Embedding 设置"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>模型配置</CardTitle>
          <CardDescription>管理各 Provider 的 API Key 与默认模型。</CardDescription>
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
                  {item.isConfigured ? "已配置" : "未配置"}
                </Badge>
              </div>
              <div className="mb-2 text-xs text-muted-foreground">
                当前模型：{item.currentModel}
              </div>
              <div className="mb-3 flex flex-wrap gap-1">
                {item.models.map((model) => (
                  <Badge
                    key={model}
                    variant={model === item.currentModel ? "default" : "outline"}
                    className={model === item.currentModel ? "bg-primary" : ""}
                  >
                    {model}
                  </Badge>
                ))}
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
                  配置
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
                  测试连接
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
                    ? "刷新中..."
                    : "刷新模型"}
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
            <DialogTitle>配置 API Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="password"
              value={form.key}
              placeholder="请输入 API Key"
              onChange={(event) => setForm((prev) => ({ ...prev, key: event.target.value }))}
            />
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">可调用模型</div>
              <Select
                value={form.model}
                onValueChange={(value) => setForm((prev) => ({ ...prev, model: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="请选择模型" />
                </SelectTrigger>
                <SelectContent>
                  {(editingConfig?.models ?? []).map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                {saveMutation.isPending ? "保存中..." : "保存"}
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
                测试连接
              </Button>
            </div>
            {testResult ? <div className="text-sm text-muted-foreground">{testResult}</div> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
