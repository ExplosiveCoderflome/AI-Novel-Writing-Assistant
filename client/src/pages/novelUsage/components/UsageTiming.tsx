import type { NovelUsagePage } from "@ai-novel/shared/types/llmUsage";
import { formatUsageDuration, usageStageLabel } from "../presentation";

const colors = ["bg-primary", "bg-sky-500", "bg-amber-500", "bg-violet-500", "bg-emerald-500"];
export function UsageTiming({ data, onJump }: { data: NovelUsagePage; onJump: (id: string) => void }) {
  const timing = data.timing;
  return <section aria-label="调用耗时" className="space-y-4 border-b border-border/60 pb-5">
    <div className="flex flex-wrap gap-6 text-sm"><p>平均调用耗时 <strong className="tabular-nums">{formatUsageDuration(timing.averageMs)}</strong></p><p>最慢调用 {timing.slowest ? <button type="button" className="text-primary underline underline-offset-4" onClick={() => onJump(timing.slowest!.invocationId)}>{formatUsageDuration(timing.slowest.durationMs)} · 查看调用</button> : "未提供"}</p></div>
    <p className="text-xs text-muted-foreground">耗时与步骤统计覆盖当前筛选的全部已计时调用。步骤累计包含重试；并行调用的耗时会相加，不等于章节创作等待时间。</p>
    <details><summary className="cursor-pointer text-sm font-medium">按章节查看步骤耗时</summary>
      <div className="mt-4 space-y-5">{timing.chapters.map(row => {
        const total = row.steps.reduce((sum, step) => sum + step.durationMs, 0), chapter = data.facets.chapters.find(ch => ch.id === row.chapterId);
        return <div key={row.chapterId ?? "book"} className="space-y-2 text-xs"><p>{chapter ? `第 ${chapter.order} 章 · ${chapter.title}` : "书级 / 未归属章节"}{row.steps[0] ? <span className="ml-3 text-muted-foreground">最慢步骤：{usageStageLabel(row.steps[0].stage)} · {formatUsageDuration(row.steps[0].durationMs)}</span> : null}</p>
          <div className="flex h-3 overflow-hidden rounded bg-muted" role="img" aria-label={row.steps.map(step => `${usageStageLabel(step.stage)} ${formatUsageDuration(step.durationMs)}`).join("；")}>{row.steps.map((step, index) => <div key={step.stage ?? "unknown"} className={colors[index % colors.length]} style={{ width: `${total ? step.durationMs / total * 100 : 0}%` }} title={`${usageStageLabel(step.stage)} ${formatUsageDuration(step.durationMs)}`} />)}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">{row.steps.map((step, index) => <span key={step.stage ?? "unknown"}><span className={`mr-1 inline-block h-2 w-2 rounded-full ${colors[index % colors.length]}`} />{usageStageLabel(step.stage)} {formatUsageDuration(step.durationMs)}</span>)}</div>
        </div>;
      })}</div>
    </details>
  </section>;
}
