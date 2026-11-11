import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { OutlineFeedbackSettings } from "@ai-novel/shared/types/outlineFeedback";
import { saveOutlineFeedbackSettings } from "@/api/outlineFeedback";
import { Button } from "@/components/ui/button";
import { feedbackSettingsInput } from "./feedbackModel";

export function FeedbackSettings({ projectId, settings }: { projectId: string; settings: OutlineFeedbackSettings }) {
  const client = useQueryClient();
  const [mode, setMode] = useState(settings.mode);
  const [everyN, setEveryN] = useState(String(settings.everyN));
  const input = feedbackSettingsInput(settings, mode, everyN);
  const save = useMutation({ mutationFn: () => saveOutlineFeedbackSettings(projectId, input!), onSuccess: () => client.invalidateQueries({ queryKey: ["outline-feedback", projectId] }) });
  return <form className="space-y-3 border-b border-border/50 pb-4" aria-label="正文反馈触发设置" onSubmit={event => { event.preventDefault(); if (input) save.mutate(); }}>
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-40 flex-1 space-y-1 text-sm"><span>自动分析频率</span><select className="h-9 w-full rounded-md border border-input bg-background px-2" value={mode} onChange={event => { setMode(event.target.value as typeof mode); save.reset(); }}><option value="chapter">每章（默认）</option><option value="every_n">每 N 章</option><option value="volume">每卷</option><option value="off">关闭</option></select></label>
      {mode === "every_n" ? <label className="space-y-1 text-sm"><span>间隔章数</span><input aria-describedby={!input ? "feedback-frequency-error" : undefined} aria-invalid={!input} type="number" min={1} max={100} step={1} className="block h-9 w-24 rounded-md border border-input bg-background px-2" value={everyN} onChange={event => { setEveryN(event.target.value); save.reset(); }}/></label> : null}
      <Button size="sm" variant="secondary" disabled={!input || save.isPending} type="submit">{save.isPending ? "保存中…" : "保存频率"}</Button>
    </div>
    {!input ? <p id="feedback-frequency-error" role="alert" className="text-xs text-destructive">请输入 1–100 的整数章数。</p> : null}
    <p className="text-xs leading-6 text-muted-foreground">保存章节摘要后按此频率分析；建议待确认时仍可继续写下一章。</p>
    {save.isError ? <p role="alert" className="text-sm text-destructive">频率保存失败，请重试。{save.error.message}</p> : save.isSuccess ? <p role="status" className="text-xs">反馈频率已保存。</p> : null}
  </form>;
}
