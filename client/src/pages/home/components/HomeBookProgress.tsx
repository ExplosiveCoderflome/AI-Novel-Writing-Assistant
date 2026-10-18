import type {NovelBookProgress} from "@ai-novel/shared/types/director/bookProgress";

export default function HomeBookProgress({progress}: {progress: NovelBookProgress}) {
  const {writtenChapters: written, targetChapters: target} = progress;
  const percent = target ? Math.min(100, Math.floor(written / target * 100)) : null;
  return <section className="mt-7" aria-label="正文进度">
    <div className="mb-3 flex items-center justify-between gap-4">
      <div><div className="text-sm font-semibold">正文进度</div>
        <p className="mt-1 text-xs text-muted-foreground">已保存 {written} 章正文{target ? `，全书目标 ${target} 章` : "，可到导演台确定全书目标"}。</p></div>
      {percent !== null ? <span className="text-lg font-semibold tabular-nums">{percent}%</span> : null}
    </div>
    {percent !== null ? <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className="h-full bg-primary" style={{width: `${percent}%`}} />
    </div> : null}
    <p className="mt-3 text-xs text-muted-foreground">到导演台查看章节检查、质量提醒和后续创作范围。</p>
  </section>;
}
