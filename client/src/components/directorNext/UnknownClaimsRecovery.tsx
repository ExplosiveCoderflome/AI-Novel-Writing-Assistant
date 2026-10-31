import {useState} from "react";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import type {DirectorUnknownClaimsView} from "@ai-novel/shared/types/director/unknownClaims";
import {createDirectorCommandKey, submitDirectorCommand} from "@/api/directorNext";
import {queryKeys} from "@/api/queryKeys";
import {Button} from "@/components/ui/button";

export default function UnknownClaimsRecovery({claims, runId, novelId, expectedVersion, disabled = false}: {
  claims: DirectorUnknownClaimsView; runId: string; novelId: string; expectedVersion: number; disabled?: boolean;
}) {
  const [checked, setChecked] = useState(false);
  const [commandKey, setCommandKey] = useState(createDirectorCommandKey);
  const [deferred, setDeferred] = useState(false);
  const queries = useQueryClient();
  const mutation = useMutation({mutationFn: () => {
    if (!checked) throw new Error("请先打开本章检查正文，再确认重新执行。");
    return submitDirectorCommand({type: "resume", runId, expectedVersion, idempotencyKey: commandKey,
      resolveUnknownClaims: {chapterId: claims.chapterId}});
  }, onSuccess: async () => {
    await Promise.all([
      queries.invalidateQueries({queryKey: queryKeys.directorNext.summary(novelId)}),
      queries.invalidateQueries({queryKey: queryKeys.directorNext.detail(novelId)}),
      queries.invalidateQueries({queryKey: queryKeys.directorNext.runs(false)}),
      queries.invalidateQueries({queryKey: queryKeys.directorNext.runs(true)}),
    ]);
  }});
  const busy = disabled || mutation.isPending || mutation.isSuccess;
  if (deferred) return <section id="director-unknown-claims" className="space-y-3 py-4" role="status">
    <p className="text-xs leading-5 text-muted-foreground">第 {claims.chapterOrder} 章保持暂停，进度已保存。检查正文后可随时回来确认。</p>
    <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setDeferred(false)}>查看待确认步骤</Button>
  </section>;
  return <section id="director-unknown-claims" aria-labelledby="unknown-claims-title" className="scroll-mt-4 space-y-3 border-t border-border/60 py-4">
    <h3 id="unknown-claims-title" className="text-sm font-semibold">第 {claims.chapterOrder} 章有一步结果待确认</h3>
    <p role="status" className="text-xs leading-5 text-muted-foreground">创作中断时，这一步的结果没能保存下来，也无法确认当时是否执行完成。为避免重复执行，创作停在这里等待你确认。</p>
    <p className="text-xs leading-5 text-muted-foreground">请从左侧目录打开第 {claims.chapterOrder} 章检查正文：正文完整无误时，勾选下方确认，AI 会重新执行这一步并继续创作；正文有缺失或异常时，请先不要确认，保留暂停状态。</p>
    <label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" className="mt-1" checked={checked} disabled={busy}
      onChange={event => {setChecked(event.target.checked); setCommandKey(createDirectorCommandKey());}}/>我已检查第 {claims.chapterOrder} 章正文，确认正文完整无误</label>
    <Button className="w-full" disabled={busy || !checked} onClick={() => mutation.mutate()}>{mutation.isPending ? "正在提交…" : mutation.isSuccess ? "已提交，正在恢复…" : "确认并重新执行这一步"}</Button>
    <Button className="w-full" variant="ghost" disabled={busy} onClick={() => setDeferred(true)}>保持暂停</Button>
    {mutation.isError ? <p role="alert" className="text-xs text-destructive">{mutation.error.message}</p> : null}
  </section>;
}
