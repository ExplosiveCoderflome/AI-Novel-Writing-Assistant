import type { NovelUsagePage, NovelUsageSummary } from "@ai-novel/shared/types/llmUsage";
import { formatUsageTokens, usageCoverageNotes, usageTime } from "../presentation";

export function UsageOverview({ data }: { data: NovelUsagePage }) {
  const summary = data.summary;
  return <section aria-label="全书已记录用量" className="space-y-5 border-b border-border/60 pb-6">
    <h2 className="text-sm font-semibold">全书已记录用量</h2>
    <dl className="grid grid-cols-2 gap-x-8 gap-y-5 lg:grid-cols-4">
      <Metric label="累计 Tokens" value={summary.totalTokens} />
      <div><Metric label="输入 Tokens" value={summary.promptTokens} /><div className="mt-2 space-y-1 text-xs text-muted-foreground tabular-nums">
        <p>缓存命中 {formatUsageTokens(summary.cacheHitTokens)}</p>
        <p>缓存未命中 {formatUsageTokens(summary.cacheMissTokens)}</p>
      </div></div>
      <Metric label="输出 Tokens" value={summary.completionTokens} />
      <div><dt className="text-xs text-muted-foreground">已记录调用</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{summary.recordedCallCount.toLocaleString()} 次</dd><p className="mt-2 text-xs text-muted-foreground">调用失败 {summary.failedCallCount} 次 · 部分返回 {summary.partialCallCount} 次</p></div>
    </dl>
    <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
      <p>累计 Tokens 包含输入和输出；缓存命中与未命中属于输入，不另加到累计用量。</p>
      <p>日志记录已结束的调用；生成中的消耗在本次调用结束后更新。</p>
      <p>{data.firstRecordedAt ? `最早调用记录：${usageTime(data.firstRecordedAt)}。` : "本书没有逐次调用记录。"}未记录的历史调用无法补算；厂商未返回的用量显示“未提供”。</p>
      {usageCoverageNotes(summary).map(note => <p key={note}>{note}</p>)}
    </div>
    {data.chapterBreakdown.length ? <details className="pt-2">
      <summary className="cursor-pointer text-sm font-medium">按章节查看用量</summary>
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs tabular-nums"><thead className="text-muted-foreground"><tr><th className="py-2 font-normal">章节 / 范围</th><th className="px-3 font-normal">调用</th><th className="px-3 font-normal">输入</th><th className="px-3 font-normal">输出</th><th className="px-3 font-normal">累计 Tokens</th></tr></thead><tbody className="divide-y divide-border/50">{data.chapterBreakdown.map(row => <tr key={row.chapterId ?? "book"}><td className="py-3">{row.label}{row.unknownUsageCallCount || row.partialCallCount ? <span className="ml-2 text-muted-foreground">统计不完整</span> : null}</td><td className="px-3">{row.recordedCallCount}</td><td className="px-3">{formatUsageTokens(row.promptTokens)}</td><td className="px-3">{formatUsageTokens(row.completionTokens)}</td><td className="px-3">{formatUsageTokens(row.totalTokens)}</td></tr>)}</tbody></table></div>
    </details> : null}
  </section>;
}

function Metric({label, value}: {label: string; value: NovelUsageSummary["totalTokens"]}) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-2 text-2xl font-semibold tabular-nums">{formatUsageTokens(value)}</dd></div>;
}
