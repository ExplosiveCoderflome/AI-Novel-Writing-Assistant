import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { APIKeyStatus } from "@/api/settings";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

interface CapabilityResult {
  profile: { structuredModes: string[]; failedModes: string[]; thinkingToggle: { supported: boolean; control: string; effort: boolean }; source: string; probedAt?: string; maxOutputTokens?: number };
  status: { state: string; checkedAt?: string; message?: string };
  autoProbe: boolean;
}
export default function ModelCompatibilitySection({ provider }: { provider: APIKeyStatus }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [mode, setMode] = useState("");
  const [control, setControl] = useState("");
  const [outputLimit, setOutputLimit] = useState<string | null>(null);
  const key = ["model-compat", provider.provider, provider.currentModel, provider.currentBaseURL];
  const url = `/settings/model-compat/${provider.provider}`;
  const query = useQuery({ queryKey: key, queryFn: async () => (await apiClient.get<{ data: CapabilityResult }>(url)).data.data,
    enabled: provider.isConfigured, refetchInterval: (query) => query.state.data?.status.state === "running" ? 1500 : false });
  const probe = useMutation({ mutationFn: () => apiClient.post(url + "/probe", { model: provider.currentModel, baseURL: provider.currentBaseURL, allowNetwork: true }),
    onSuccess: () => { setError(""); void queryClient.invalidateQueries({ queryKey: key }); }, onError: () => setError("无法启动探测，请检查连接后重试。") });
  const consent = useMutation({ mutationFn: (autoProbe: boolean) => apiClient.put(url, { autoProbe }),
    onSuccess: () => { setError(""); void queryClient.invalidateQueries({ queryKey: key }); }, onError: () => setError("探测设置保存失败，请重试。") });
  const override = useMutation({ mutationFn: () => {
    const profile = query.data!.profile;
    const selectedMode = mode || profile.structuredModes[0];
    const selectedControl = control || profile.thinkingToggle.control;
    const ordered = ["json_schema", "json_object", "tool_calling", "prompt_only"];
    return apiClient.put(url, { override: { ...profile, source: "user_override", failedModes: [],
      structuredModes: ordered.slice(ordered.indexOf(selectedMode)),
      thinkingToggle: { ...profile.thinkingToggle, supported: selectedControl !== "none", control: selectedControl } } });
  }, onSuccess: () => { setError(""); void queryClient.invalidateQueries({ queryKey: key }); }, onError: () => setError("指定能力保存失败，请重试。") });
  const data = query.data;
  const saveOutputLimit = useMutation({ mutationFn: () => apiClient.put(url, {
    override: { ...data!.profile, source: "user_override", maxOutputTokens: (outputLimit ?? data!.profile.maxOutputTokens ?? "") === "" ? undefined : Number(outputLimit ?? data!.profile.maxOutputTokens) },
  }), onSuccess: () => { setError(""); setOutputLimit(null); void queryClient.invalidateQueries({ queryKey: key }); },
    onError: () => setError("输出上限保存失败，请重试。") });
  const labels: Record<string, string> = { json_schema: "严格 JSON", json_object: "JSON", tool_calling: "工具调用", prompt_only: "提示约束 JSON" };
  return <section className="space-y-2 border-t pt-3 text-sm">
    <div className="font-medium">模型兼容性</div>
    {data ? <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); saveOutputLimit.mutate(); }}>
      <label className="flex flex-wrap items-center gap-2">当前模型输出上限（Token）
        <Input type="number" min={1} max={1048576} step={1} className="w-40" placeholder="使用任务预算"
          value={outputLimit ?? data.profile.maxOutputTokens ?? ""} onChange={(event) => setOutputLimit(event.target.value)} />
      </label>
      <p className="text-xs text-muted-foreground">为 {provider.currentModel} 设置单次输出额度，适用于正文与结构化生成；留空使用任务预算。切换模型可分别设置。</p>
      <Button size="sm" variant="outline" type="submit" disabled={saveOutputLimit.isPending}>保存输出上限</Button>
    </form> : null}
    <p className="text-xs text-muted-foreground">探测会发送少量付费请求，帮助选择可用的输出方式和思考开关。</p>
    <label className="flex items-center gap-2"><Switch checked={data?.autoProbe ?? false} disabled={!data || consent.isPending} onCheckedChange={(value) => consent.mutate(value)} />保存或切换模型时自动探测</label>
    <Button size="sm" variant="outline" disabled={!provider.isConfigured || probe.isPending || data?.status.state === "running"} onClick={() => probe.mutate()}>{data?.status.state === "running" ? "探测中…" : "重新探测"}</Button>
    {data ? <div className="space-y-1 text-xs text-muted-foreground" role="status">
      <div>{data.status.message ?? "可手动探测模型兼容性。"} {data.status.checkedAt ? new Date(data.status.checkedAt).toLocaleString() : ""}</div>
      <div>输出方式：{data.profile.structuredModes.filter((mode) => !data.profile.failedModes.includes(mode)).map((mode) => labels[mode]).join(" → ")}</div>
      <div>关闭思考：{data.profile.thinkingToggle.supported ? "支持" : "未确认支持"}{data.profile.probedAt ? ` · 上次结果 ${new Date(data.profile.probedAt).toLocaleString()}` : " · 使用默认能力"}</div>
    </div> : null}
    {provider.kind === "custom" && data ? <details className="text-xs">
      <summary className="cursor-pointer">指定自定义服务能力</summary>
      <div className="mt-2 space-y-2">
        <label className="flex items-center gap-2">优先输出方式<select className="rounded border bg-background p-1" value={mode || data.profile.structuredModes[0]} onChange={(event) => setMode(event.target.value)}>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="flex items-center gap-2">思考控制参数<select className="rounded border bg-background p-1" value={control || data.profile.thinkingToggle.control} onChange={(event) => setControl(event.target.value)}>{["none", "thinking", "thinking_boolean", "enable_thinking", "reasoning_effort"].map((value) => <option key={value} value={value}>{value === "none" ? "不指定" : value}</option>)}</select></label>
        <Button size="sm" variant="outline" disabled={override.isPending} onClick={() => override.mutate()}>保存指定能力</Button>
        <p className="text-muted-foreground">指定能力优先于探测结果，适用于服务商提供了明确参数说明的连接。</p>
      </div>
    </details> : null}
    {query.isError || error ? <p role="alert" className="text-xs text-destructive">{error || "兼容性信息读取失败。"}</p> : null}
  </section>;
}
