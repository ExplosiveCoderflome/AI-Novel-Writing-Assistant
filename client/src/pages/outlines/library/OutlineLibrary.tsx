import { ArrowRight, BookMarked, NotebookPen } from "lucide-react";
import { Link } from "react-router-dom";
import type { OutlineProject } from "@/api/outlines";
import { Button } from "@/components/ui/button";
import { useIsMobileViewport } from "@/components/layout/mobile/useIsMobileViewport";
import { featureFlags } from "@/config/featureFlags";

const dayFormat = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" });
const clockFormat = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function updatedDay(item: OutlineProject) {
  return dayFormat.format(new Date(item.updatedAt));
}

function OutlineEntry({ item, latest, feedback }: { item: OutlineProject; latest?: boolean; feedback: boolean }) {
  const clock = clockFormat.format(new Date(item.updatedAt));
  const summary = item.summary?.trim();
  const Title = latest ? "h3" : "h4";
  return <div className={latest ? "outline-catalog-entry is-latest" : "outline-catalog-entry"}>
    <Link to={`/outlines/${item.id}`} className="outline-catalog-link">
      {latest && <span className="outline-folio-mark" aria-hidden="true"><NotebookPen /></span>}
      <div className="outline-catalog-description">
        {latest && <span className="outline-recent-label">最近编辑</span>}
        <Title>{item.title}</Title>
        {summary && <p>{summary}</p>}
      </div>
      <div className="outline-catalog-meta">
        {item.boundNovelId && <span className="outline-bound"><BookMarked size={13} aria-hidden="true" />已开书</span>}
        <span>修订 v{item.currentVersion}</span>
        <time dateTime={item.updatedAt} title={`${updatedDay(item)} ${clock} 更新`}>
          {latest ? `${updatedDay(item)} ${clock}` : clock}
        </time>
      </div>
      <span className="outline-catalog-open">{latest && "继续编辑"}<ArrowRight size={16} aria-hidden="true" /></span>
    </Link>
    {feedback && <Button asChild size="sm" variant="ghost" className="outline-feedback-link">
      <Link to={`/outlines/${item.id}#outline-feedback-panel`}>章节反馈</Link></Button>}
  </div>;
}

export function OutlineLibrary({ projects }: { projects: OutlineProject[] }) {
  const isMobileViewport = useIsMobileViewport();
  const [latest, ...others] = projects;
  const days = new Map<string, OutlineProject[]>();
  for (const item of others) {
    const day = updatedDay(item);
    const group = days.get(day);
    if (group) group.push(item);
    else days.set(day, [item]);
  }
  const hasFeedback = (item: OutlineProject) => Boolean(featureFlags.outlineFeedbackEnabled && !isMobileViewport && item.boundNovelId);
  return <section aria-labelledby="outline-library-title" className="outline-library">
    <div className="outline-library-heading">
      <h2 id="outline-library-title">我的大纲</h2><span>{projects.length} 份</span>
    </div>
    {latest && <OutlineEntry item={latest} latest feedback={hasFeedback(latest)} />}
    {Array.from(days, ([day, items]) => <div className="outline-day" key={day}>
      <h3 className="outline-day-title">{day}</h3>
      <ul aria-label={`${day}更新的大纲`}>{items.map(item => <li key={item.id}>
        <OutlineEntry item={item} feedback={hasFeedback(item)} />
      </li>)}</ul>
    </div>)}
  </section>;
}

export function OutlineSamplePage() {
  return <div className="outline-sample" aria-hidden="true">
    <div className="outline-sample-page">
      <strong>故事总纲</strong>
      <span>第一卷</span>
      <span>第一章</span>
    </div>
  </div>;
}
