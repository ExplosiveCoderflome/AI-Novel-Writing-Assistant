import { Link } from "react-router-dom";
import { BookOpen, ClipboardList, History, ShieldAlert } from "lucide-react";
import type { DashboardView, DirectorTimelineEvent } from "@/api/directorNext";
import DirectorBadge from "./DirectorBadge";
import DirectorGate from "./DirectorGate";
import DirectorDriveSwitch from "./DirectorDriveSwitch";
import type {ReactNode} from "react";

interface DirectorPanelProps {
  view: DashboardView;
  novelId: string;
  timeline?: DirectorTimelineEvent[];
  preview?: boolean;
  startForm?: ReactNode;
}

function actionGuidance(view: DashboardView): string {
  if (view.availableActions.some((action) => action.kind === "navigate" && action.primary)) {
    return "请先查看需要确认的内容，再回到这里继续。";
  }
  if (view.availableActions.some((action) => action.command === "resume" && action.primary)) {
    return "保存的创作内容仍然保留，确认上下文后可以继续推进。";
  }
  if (view.availableActions.some((action) => action.command === "open_run" && action.primary)) {
    return "可以从已保存内容重新开始一个授权范围，已有正文会继续受到保护。";
  }
  if (view.availableActions.length === 0) {
    return view.mode === "completed" ? "当前授权范围已完成，可以回到小说工作区查看结果。" : "当前不需要你操作。";
  }
  return "导演会按照当前授权范围继续推进。";
}

function formatEvent(event: DirectorTimelineEvent): string {
  const label: Record<string, string> = {
    command_accepted: "已接收创作命令",
    step_started: "开始处理阶段",
    step_finished: "阶段处理完成",
    quality_debt_recorded: "记录质量提醒",
    stop_signal: "记录暂停原因",
    token_usage: "完成一次 AI 调用",
  };
  return label[event.type] ?? "更新创作记录";
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : date.toLocaleString();
}

export default function DirectorPanel({ view, novelId, timeline = [], preview = false, startForm }: DirectorPanelProps) {
  const chapterText = view.debts.chapterOrders.length > 0
    ? `第 ${view.debts.chapterOrders.join("、")} 章`
    : "暂时没有需要回收的章节";

  return (
    <aside className="flex min-h-0 flex-col gap-0 bg-background lg:sticky lg:top-0 lg:max-h-[calc(100dvh-6rem)]" aria-label="小说导演台">
      <DirectorBadge view={view} novelId={novelId} preview={preview} />
      {!preview && view.mode === "waiting_gate" ? <DirectorGate runId={view.runId} novelId={novelId} expectedVersion={view.sourceTrace.controlVersion}/>:null}
      {!preview && view.mode === "waiting_gate" ? <DirectorDriveSwitch runId={view.runId} novelId={novelId} expectedVersion={view.sourceTrace.controlVersion} toDriver={view.driver === "auto" ? "assisted" : "auto"}/>:null}
      {!preview && ["completed","cancelled","failed"].includes(view.mode) ? startForm : null}

      <section className="border-t border-border/60 py-4" aria-labelledby="director-current-work">
        <div className="flex items-center gap-2 text-sm font-semibold" id="director-current-work">
          <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          正在做什么
        </div>
        <p className="mt-2 text-sm leading-6 text-foreground">{view.headline}</p>
        <div className="mt-3" role="progressbar" aria-valuemin={0} aria-valuemax={view.progress.total} aria-valuenow={view.progress.done} aria-label="导演阶段进度">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>创作进度</span>
            <span>{view.progress.done}/{view.progress.total}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${view.progress.total > 0 ? Math.min(100, (view.progress.done / view.progress.total) * 100) : 0}%` }} />
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 py-4" aria-labelledby="director-next-action">
        <div className="flex items-center gap-2 text-sm font-semibold" id="director-next-action">
          <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          需要你做什么
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{actionGuidance(view)}</p>
        {view.detail ? <p className="mt-2 text-sm leading-6 text-destructive">{view.detail}</p> : null}
        {view.availableActions.some((action) => action.kind === "navigate") ? (
          <Link className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline" to={view.availableActions.find((action) => action.kind === "navigate")?.target ?? `/novels/${encodeURIComponent(novelId)}/edit`}>
            打开小说工作区
          </Link>
        ) : null}
      </section>

      <section className="border-t border-border/60 py-4" aria-labelledby="director-quality-debt">
        <div className="flex items-center gap-2 text-sm font-semibold" id="director-quality-debt">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          质量债
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {view.debts.count > 0 ? `已记录 ${view.debts.count} 项质量提醒，${chapterText}。` : chapterText}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">质量提醒不会替代全书状态，后续可在来源页处理。</p>
      </section>

      <section className="border-t border-border/60 py-4" aria-labelledby="director-timeline">
        <div className="flex items-center gap-2 text-sm font-semibold" id="director-timeline">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          时间线
        </div>
        {timeline.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">暂时没有可展示的时间线。</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {timeline.slice(-8).reverse().map((event) => (
              <li key={`${event.seq}-${event.type}`} className="flex gap-3 text-xs">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden="true" />
                <span className="min-w-0 text-muted-foreground">
                  <span className="block text-foreground">{formatEvent(event)}</span>
                  <span className="block mt-0.5">{formatTime(event.createdAt)}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <details className="border-t border-border/60 py-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">查看运行诊断</summary>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
          <dt>运行方式</dt><dd className="text-foreground">{view.driver === "auto" ? "自动推进" : "辅助推进"}</dd>
          <dt>计划版本</dt><dd className="break-all text-foreground">{view.sourceTrace.planVersion}</dd>
          <dt>状态版本</dt><dd className="text-foreground">{view.sourceTrace.controlVersion}</dd>
        </dl>
      </details>
    </aside>
  );
}
