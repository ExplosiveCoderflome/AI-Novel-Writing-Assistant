import type { ShortStoryReferenceView } from "@ai-novel/shared/types/shortStoryReference";
import { Link } from "react-router-dom";

export function ShortStoryReferenceSummary({ reference, confirmed = true }: { reference: ShortStoryReferenceView; confirmed?: boolean }) {
  return (
    <section className="rounded-xl bg-muted/35 p-4 text-sm leading-6" aria-label="短篇参考依据">
      <div className="font-medium">参考小说：<Link className="text-primary underline-offset-4 hover:underline" to={`/book-analysis/${reference.analysisId}`}>{reference.sourceTitle}</Link></div>
      <p className="mt-1 text-xs text-muted-foreground">文档版本 {reference.documentVersionNumber} · 借鉴结构、节奏与写法，创作新的故事</p>
      <p className="mt-2">{reference.goal}</p>
      {reference.sourceState !== "available" ? <p className="mt-2 text-amber-700 dark:text-amber-400">
        {confirmed
          ? reference.sourceState === "updated" ? "参考分析有新的内容。作品使用确认时保存的参考依据。" : "参考来源暂不可用。作品保留确认时保存的参考依据。"
          : reference.sourceState === "updated" ? "参考分析有新的内容，请重新读取并核对方向。" : "参考来源暂不可用，请选择可用的参考小说。"}
      </p> : null}
      <details className="mt-3 text-muted-foreground">
        <summary className="cursor-pointer">查看借鉴内容与原创约束</summary>
        {[
          ["结构", reference.structureLessons], ["节奏", reference.pacingLessons],
          ["写法", reference.styleLessons], ["结尾兑现", reference.endingLessons], ["原创约束", reference.originalityConstraints],
        ].map(([label, items]) => <div className="mt-3" key={String(label)}>
          <div className="font-medium text-foreground">{label}</div>
          <ul className="list-disc pl-5">{(items as string[]).map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>)}
        {reference.endingEvidence === "not_available" ? <p className="mt-2">所选结论未提供完整结局依据，创作将安排新的完整结局。</p> : null}
      </details>
    </section>
  );
}
