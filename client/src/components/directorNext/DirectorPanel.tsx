import {InvocationUsageList} from "./usage";
import { Link } from "react-router-dom";
import { BookOpen, ClipboardList, History, ShieldAlert } from "lucide-react";
import type { DashboardView, DirectorTimelineEvent } from "@/api/directorNext";
import DirectorBadge, { directorDriverLabel } from "./DirectorBadge";
import DirectorGate from "./DirectorGate";
import DirectorDriveSwitch from "./DirectorDriveSwitch";
import type {ReactNode} from "react";
import DirectorCharacterCandidates, {useDirectorCharacterCandidates} from "./characters/DirectorCharacterCandidates";

interface DirectorPanelProps {
  view: DashboardView;
  novelId: string;
  timeline?: DirectorTimelineEvent[];
  preview?: boolean;
  startForm?: ReactNode | ((range: DashboardView["nextLaunchRange"], driver: DashboardView["driver"]) => ReactNode);
  reviewTarget?:string;
  reviewReady?:boolean;
  reviewRunId?:string;
  reviewVersion?:number;
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

export default function DirectorPanel({ view, novelId, timeline = [], preview = false, startForm, reviewTarget, reviewReady = false, reviewRunId, reviewVersion }: DirectorPanelProps) {
  const candidates = useDirectorCharacterCandidates(view.runId, !preview);
  const candidatePage = candidates.data?.data;
  const reviewingCharacters = candidatePage?.reviews.some(r => r.blocking) ?? false;
  const badgeView = reviewingCharacters ? {...view, headline: "请确认本章人物后继续", availableActions: view.availableActions.filter(a => a.command !== "resume")} : view;
  const reviewingCurrentGate=reviewReady && reviewRunId===view.runId && reviewVersion===view.sourceTrace.controlVersion && view.availableActions.some(action=>action.id.startsWith("review:") && action.kind==="navigate" && action.target===reviewTarget);
  const navigationAction = view.availableActions.find(action => action.kind === "navigate" && action.target !== reviewTarget);
  const driveSwitch = view.availableActions.find(action => action.command === "handoff" && action.toDriver);
  const chapterText = view.debts.chapterOrders.length > 0
    ? `第 ${view.debts.chapterOrders.join("、")} 章`
    : "本次没有记录章节质量问题";
  const chapterProgress = view.chapterProgress;
  const progress = chapterProgress ?? view.progress;

  return (
    <aside className="flex min-h-0 flex-col gap-0 bg-background" aria-label="小说导演台">
      <DirectorBadge view={badgeView} novelId={novelId} preview={preview} currentNavigationTarget={reviewTarget} />
      {!preview ? <DirectorCharacterCandidates page={candidatePage} runId={view.runId} novelId={novelId}/> : null}
      {candidates.isError ? <p role="alert" className="py-2 text-xs text-destructive">人物候选暂时未能加载，请稍后重试。</p> : null}
      {!preview && view.mode === "waiting_gate" && reviewingCurrentGate ? <DirectorGate runId={view.runId} novelId={novelId} expectedVersion={view.sourceTrace.controlVersion}/>:null}
      {driveSwitch?.toDriver ? <DirectorDriveSwitch runId={view.runId} novelId={novelId} expectedVersion={view.sourceTrace.controlVersion} toDriver={driveSwitch.toDriver} label={driveSwitch.label} disabled={preview}/>:null}

      <section className="border-t border-border/60 py-4" aria-labelledby="director-current-work">
        <div className="flex items-center gap-2 text-sm font-semibold" id="director-current-work">
          <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          正在做什么
        </div>
        <p className="mt-2 text-sm leading-6 text-foreground">{view.headline}</p>
        {chapterProgress ? <p className="mt-2 text-xs text-muted-foreground">本次正文：第 {chapterProgress.from}—{chapterProgress.to} 章</p> : null}
        <div className="mt-3" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label={chapterProgress ? "本次正文完成进度" : "导演阶段进度"}>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{chapterProgress ? "检查并保存完成" : "规划阶段完成"}</span>
            <span>{progress.done}/{progress.total}{chapterProgress ? " 章" : " 阶段"}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress.total > 0 ? Math.min(100, (progress.done / progress.total) * 100) : 0}%` }} />
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 py-4" aria-labelledby="director-next-action">
        <div className="flex items-center gap-2 text-sm font-semibold" id="director-next-action">
          <ClipboardList className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          需要你做什么
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{reviewingCurrentGate ? "请核对左侧本阶段结果，确认后 AI 按本次授权范围继续。" : view.nextActionGuidance}</p>
        {view.detail ? <p className={`mt-2 text-sm leading-6 ${reviewingCharacters ? "text-muted-foreground" : "text-destructive"}`}>{view.detail}</p> : null}
        {navigationAction ? (
          <Link className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline" to={navigationAction.target ?? view.sourceRoute}>
            查看本阶段结果
          </Link>
        ) : null}
        {!preview && ["completed","cancelled","failed"].includes(view.mode) && (view.mode !== "completed" || view.availableActions.some(action=>action.command === "open_run"))
          ? typeof startForm === "function" ? startForm(view.nextLaunchRange, view.driver) : startForm : null}
      </section>

      {!preview ? <InvocationUsageList runId={view.runId} active={["running","queued"].includes(view.mode)}/> : null}
      <section className="border-t border-border/60 py-4" aria-labelledby="director-quality-debt">
        <div className="flex items-center gap-2 text-sm font-semibold" id="director-quality-debt">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          质量提醒
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {view.debts.count > 0 ? `已记录 ${view.debts.count} 项质量提醒，${chapterText}。` : chapterText}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">可从左侧目录查看这些章节。局部质量提醒不代表本次创作失败；暂停事项请按上方提示处理。</p>
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
          <dt>创作方式</dt><dd className="text-foreground">{directorDriverLabel(view.driver)}</dd>
          <dt>计划版本</dt><dd className="break-all text-foreground">{view.sourceTrace.planVersion}</dd>
          <dt>状态版本</dt><dd className="text-foreground">{view.sourceTrace.controlVersion}</dd>
          <dt>阶段完成</dt><dd className="text-foreground">{view.progress.done}/{view.progress.total}</dd>
        </dl>
      </details>
    </aside>
  );
}
