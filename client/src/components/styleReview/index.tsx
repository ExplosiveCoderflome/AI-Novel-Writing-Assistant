import { isStyleIssueRewritable, type StyleDetectionReport, type StyleRewriteGuard } from "@ai-novel/shared/types/styleEngine";

const layerLabels = { surface: "句子表达", discourse: "段落衔接", narrative: "叙事建议" };

export function StyleRiskReport({ report }: { report: StyleDetectionReport }) {
  return <section aria-label="写法检查结果" className="space-y-4 text-sm">
    <div className="space-y-1">
      <div className="font-medium text-foreground">表达风险参考分：{report.riskScore}</div>
      <p className="leading-6 text-muted-foreground">{report.summary}</p>
    </div>
    {report.violations.length ? <div className="divide-y divide-border/40">
      {report.violations.map((issue, index) => <article key={`${issue.ruleId}-${index}`} className="space-y-2 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h4 className="font-medium text-foreground">{issue.ruleName}</h4>
          <span className="text-xs text-muted-foreground">{issue.layer ? layerLabels[issue.layer] : "写法提醒"} · {isStyleIssueRewritable(issue) ? "可局部修订" : "仅提供建议"}</span>
        </div>
        <p className="leading-6 text-muted-foreground">{issue.reason}</p>
        <blockquote className="whitespace-pre-wrap rounded-md bg-muted/30 px-3 py-2 leading-6 text-foreground">{issue.excerpt}</blockquote>
        <p className="leading-6 text-muted-foreground">建议：{issue.suggestion}</p>
        {issue.layer === "narrative" ? <p className="text-xs leading-5 text-muted-foreground">先让 AI 拟修改方案，确认后再调整剧情。</p> : null}
      </article>)}
    </div> : <p className="text-muted-foreground">未发现需要修订的表达问题，可以保留原稿。</p>}
  </section>;
}

export function StyleRewriteProtection({ guard, retainedOriginal }: { guard?: StyleRewriteGuard; retainedOriginal?: boolean }) {
  const blocked = guard?.checks.filter(check => check.status === "blocked") ?? [];
  return <div role="status" className={`space-y-1 rounded-md px-3 py-2 text-sm leading-6 ${blocked.length ? "bg-amber-500/10 text-foreground" : "bg-muted/30 text-muted-foreground"}`}>
    <p className="font-medium">{retainedOriginal ? "保留原稿" : "局部修订预览"}</p>
    {blocked.map(check => <p key={check.code}>{check.reason}</p>)}
    {!blocked.length ? <p>{retainedOriginal ? "没有需要安全替换的表达，原文保持不变。" : "比较人物口吻、动作和信息，再采用需要的修改。"}</p> : null}
    {guard?.checks.some(check => check.code === "semantic_facts" && check.status === "not_checked") && !retainedOriginal
      ? <p className="text-xs">请结合本书的人物与设定核对预览。</p> : null}
  </div>;
}
