import {useState} from "react";
import {useMutation, useQueryClient} from "@tanstack/react-query";
import {Link} from "react-router-dom";
import type {DirectorChapterBudgetView} from "@ai-novel/shared/types/director/chapterBudget";
import {createDirectorCommandKey, submitDirectorCommand} from "@/api/directorNext";
import {queryKeys} from "@/api/queryKeys";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";

const stages = {draft: "写作", review: "章节验收", repair: "修文", artifact_sync: "资料同步"};
const format = (value: number) => value.toLocaleString("zh-CN");

export default function ChapterBudgetRecovery({budget, runId, novelId, expectedVersion, disabled = false}: {
  budget: DirectorChapterBudgetView; runId: string; novelId: string; expectedVersion: number; disabled?: boolean;
}) {
  const [limit, setLimit] = useState(String(budget.recommendedLimit));
  const [commandKey, setCommandKey] = useState(createDirectorCommandKey);
  const queries = useQueryClient();
  const minimum = Math.max(budget.tokenLimit, budget.usedTokens + budget.reserveTokens) + 1;
  const valid = limit.trim() !== "" && Number.isSafeInteger(Number(limit)) && Number(limit) >= minimum && Number(limit) <= 10_000_000;
  const updateLimit = (value: string) => {setLimit(value); setCommandKey(createDirectorCommandKey());};
  const mutation = useMutation({mutationFn: () => {
    if (!valid) throw new Error(`本章新上限至少为 ${format(minimum)} Tokens。`);
    return submitDirectorCommand({type: "resume", runId, expectedVersion, idempotencyKey: commandKey,
      chapterBudget: {jobId: budget.jobId, chapterId: budget.chapterId, metric: budget.metric, tokenLimit: Number(limit)}});
  }, onSuccess: async () => {
    await Promise.all([
      queries.invalidateQueries({queryKey: queryKeys.directorNext.summary(novelId)}),
      queries.invalidateQueries({queryKey: queryKeys.directorNext.detail(novelId)}),
      queries.invalidateQueries({queryKey: queryKeys.directorNext.runs(false)}),
      queries.invalidateQueries({queryKey: queryKeys.directorNext.runs(true)}),
    ]);
  }});
  const busy = disabled || mutation.isPending || mutation.isSuccess;
  return <section id="director-chapter-budget" aria-labelledby="chapter-budget-title" className="scroll-mt-4 space-y-3 border-t border-border/60 py-4">
    <h3 id="chapter-budget-title" className="text-sm font-semibold">第 {budget.chapterOrder} 章用量与额度</h3>
    <p className="text-xs leading-5 text-muted-foreground">本章用量与下一步预留达到上限，创作已暂停。确认后从保存进度继续，已有正文和累计用量会保留。</p>
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
      <dt className="text-muted-foreground">本章已用</dt><dd>{format(budget.usedTokens)} {budget.metric === "uncached_tokens_v1" ? "有效 Tokens" : "Tokens"}</dd>
      <dt className="text-muted-foreground">本章上限</dt><dd>{format(budget.tokenLimit)} Tokens</dd>
      <dt className="text-muted-foreground">{budget.stage ? stages[budget.stage] : "下一步"}预留</dt><dd>{format(budget.reserveTokens)} Tokens</dd>
    </dl>
    {budget.metric === "uncached_tokens_v1" ? <div className="space-y-1 text-xs leading-5 text-muted-foreground">
      <p>有效用量按“未命中输入 + 输出”计算，两者各计 1 倍。</p>
      <p>输入 {format(budget.promptTokens ?? 0)} · 缓存命中 {format(budget.cacheHitTokens ?? 0)} · 输出 {format(budget.completionTokens ?? 0)}</p>
      {budget.unclassifiedTokens ? <p>接口另报告 {format(budget.unclassifiedTokens)} Tokens，未提供输入输出拆分，保守计入本章用量。</p> : null}
      <p>原始累计 {format(budget.rawTokens)} Tokens；有效用量用于本章额度保护。</p>
    </div> : <p className="text-xs leading-5 text-muted-foreground">本任务按原始累计 Tokens 计量，历史用量保持原口径。</p>}
    <label className="block space-y-2 text-xs">本章新上限
      <Input type="number" min={minimum} max={10_000_000} step={1} value={limit} disabled={busy}
        aria-invalid={!valid} onChange={event => updateLimit(event.target.value)}/>
    </label>
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => updateLimit(String(budget.recommendedLimit))}>使用建议额度 {format(budget.recommendedLimit)}</Button>
      <Button asChild size="sm" variant="ghost"><Link to={`/novels/${encodeURIComponent(novelId)}/ai-usage`}>查看调用明细</Link></Button>
    </div>
    {!valid ? <p className="text-xs text-destructive">请输入 {format(minimum)} 至 10,000,000 之间的整数额度。</p> : null}
    <p className="text-xs leading-5 text-muted-foreground">点击下方按钮授权继续消耗本章额度；其他章节的上限保持原值。如需保持暂停，可暂不操作。</p>
    <Button className="w-full" disabled={busy || !valid} onClick={() => mutation.mutate()}>{mutation.isPending ? "正在提交…" : mutation.isSuccess ? "已提交，正在恢复…" : "追加额度并继续本章"}</Button>
    {mutation.isError ? <p role="alert" className="text-xs text-destructive">{mutation.error.message}</p> : null}
  </section>;
}
