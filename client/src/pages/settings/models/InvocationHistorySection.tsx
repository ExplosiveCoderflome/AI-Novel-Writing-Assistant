import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InvocationHistorySettings } from "@ai-novel/shared/types/llmUsage";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";

export function InvocationHistorySection() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<InvocationHistorySettings>();
  const queryKey = ["invocation-history-settings"];
  const query = useQuery({ queryKey, queryFn: async () => (await apiClient.get<{ data: InvocationHistorySettings }>("/settings/llm-history")).data.data });
  const save = useMutation({ mutationFn: (value: InvocationHistorySettings) => apiClient.put("/settings/llm-history", value),
    onSuccess: () => { setDraft(undefined); void queryClient.invalidateQueries({ queryKey }); } });
  const value = draft ?? query.data;
  return <section className="space-y-3 border-t border-border/60 pt-5">
    <h2 className="font-semibold">AI 提示词与回答历史</h2>
    <p className="text-sm text-muted-foreground">保存创作消息和模型回答，可在小说的“AI 用量与调用日志”中查看。内容可能包含完整正文；请按需开启。耗时统计持续记录。</p>
    {value ? <form className="flex flex-wrap items-end gap-4 text-sm" onSubmit={event => { event.preventDefault(); save.mutate(value); }}>
      <label className="flex items-center gap-2 py-2"><input type="checkbox" checked={value.enabled} onChange={event => setDraft({ ...value, enabled: event.target.checked })} />保存提示词与回答</label>
      <label className="space-y-1"><span className="block text-xs text-muted-foreground">保留天数</span><input className="w-24 rounded-md border border-input bg-background p-2" type="number" required min={1} max={365} value={value.retentionDays} onChange={event => setDraft({ ...value, retentionDays: event.target.valueAsNumber })} /></label>
      <label className="space-y-1"><span className="block text-xs text-muted-foreground">压缩后容量上限（MB）</span><input className="w-28 rounded-md border border-input bg-background p-2" type="number" required min={1} max={4096} value={value.maxMb} onChange={event => setDraft({ ...value, maxMb: event.target.valueAsNumber })} /></label>
      <Button type="submit" disabled={save.isPending}>保存历史设置</Button>
    </form> : query.isPending ? <p className="text-sm">正在读取设置…</p> : null}
    <p className="text-xs text-muted-foreground">每 15 分钟清理过期或超出容量的历史内容，优先移除最早记录。关闭后停止保存新内容，已有内容按保留设置清理；调用用量保留。</p>
    {save.isSuccess ? <p role="status" className="text-sm">历史设置已保存。</p> : null}
    {query.isError || save.isError ? <p role="alert" className="text-sm text-destructive">历史设置读取或保存失败，请重试。</p> : null}
  </section>;
}
