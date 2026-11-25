import {InvocationUsageList} from "./usage";
import { History, ListChecks, ShieldCheck, ShieldAlert } from "lucide-react";
import type { DashboardView, DirectorTimelineEvent } from "@/api/directorNext";
import DirectorBadge, { directorDriverLabel } from "./DirectorBadge";
import DirectorGate, {type PlanEditorRenderer} from "./DirectorGate";
import DirectorDriveSwitch from "./DirectorDriveSwitch";
import type {ReactNode} from "react";
import DirectorCharacterCandidates, {useDirectorCharacterCandidates} from "./characters/DirectorCharacterCandidates";
import ChapterBudgetRecovery from "./budget/ChapterBudgetRecovery";
import UnknownClaimsRecovery from "./UnknownClaimsRecovery";
import WorkflowProgressBar from "@/components/workflow/WorkflowProgressBar";
import PanelDisclosure from "./panel/PanelDisclosure";

export type PanelPlanEditorRenderer = (input: Parameters<PlanEditorRenderer>[0], nextRange: DashboardView["nextLaunchRange"]) => ReactNode;

interface DirectorPanelProps {
  view: DashboardView;
  novelId: string;
  outlineBound?: boolean;
  timeline?: DirectorTimelineEvent[];
  preview?: boolean;
  startForm?: ReactNode | ((range: DashboardView["nextLaunchRange"], driver: DashboardView["driver"]) => ReactNode);
  reviewTarget?:string;
  reviewReady?:boolean;
  reviewCanRegenerate?:boolean;
  reviewRunId?:string;
  reviewVersion?:number;
  renderPlanEditor?: PanelPlanEditorRenderer;
  proseApproval?:import("./DirectorGate").ChapterProseApproval;
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

export default function DirectorPanel({ view, novelId, timeline = [], preview = false, startForm, reviewTarget, reviewReady = false, reviewCanRegenerate = false, reviewRunId, reviewVersion, renderPlanEditor, proseApproval, outlineBound = false }: DirectorPanelProps) {
  const candidates = useDirectorCharacterCandidates(view.runId, !preview);
  const candidatePage = candidates.data?.data;
  const reviewingCharacters = candidatePage?.reviews.some(r => r.blocking) ?? false;
  const canLaunch = !preview && ["completed", "cancelled", "failed"].includes(view.mode)
    && view.availableActions.some(action => action.command === "open_run");
  const launchForm = canLaunch && (typeof startForm === "function" ? startForm(view.nextLaunchRange, view.driver) : startForm);
  const badgeView = {
    ...view,
    headline: reviewingCharacters ? "请确认本章人物后继续" : view.headline,
    availableActions: view.availableActions.filter(action =>
      !(reviewingCharacters && action.command === "resume") && !(launchForm && action.command === "open_run")),
  };
  const reviewAction = view.availableActions.find(action=>action.id.startsWith("review:") && action.kind==="navigate" && action.target===reviewTarget);
  const currentReview = reviewAction && reviewRunId===view.runId && reviewVersion===view.sourceTrace.controlVersion;
  const reviewingCurrentGate = currentReview && reviewReady;
  const recoveringReview = currentReview && reviewAction.id === "review:chapter_task_sheet" && reviewCanRegenerate;
  const driveSwitch = view.availableActions.find(action => action.command === "handoff" && action.toDriver);
  const chapterProgress = view.chapterProgress;
  const chapterListProgress = view.chapterListProgress;
  const progress = chapterProgress ?? view.progress;

  return (
    <div className="flex min-h-0 min-w-0 flex-col pb-4">
      <section id="director-current-work" aria-label="正在做什么" className="rounded-xl bg-muted/55 p-4">
        <DirectorBadge panel view={badgeView} novelId={novelId} preview={preview} currentNavigationTarget={reviewTarget} openRunLabel={outlineBound ? "选择下一章并确认" : undefined} />
        {reviewingCharacters && <p className="mt-2 text-sm text-muted-foreground">{view.headline}</p>}
        {chapterListProgress ? (
          <div className="mt-3 space-y-2 text-xs" role="status" aria-live="polite">
            <p>{chapterListProgress.label}</p>
            <div role="progressbar" aria-label="章节拆分进度" aria-valuemin={0}
              aria-valuemax={chapterListProgress.totalChapters} aria-valuenow={chapterListProgress.completedChapters}>
              <WorkflowProgressBar progress={chapterListProgress.completedChapters / chapterListProgress.totalChapters} />
            </div>
            <p className="text-muted-foreground">
              已生成 {chapterListProgress.completedChapters}/{chapterListProgress.totalChapters} 章
              {chapterListProgress.completedChapters === chapterListProgress.totalChapters
                ? "，正在校验并保存章节列表…" : "，每完成一个节奏段更新进度。"}
            </p>
          </div>
        ) : null}
        {chapterProgress ? <p className="mt-2 text-xs text-muted-foreground">本次正文：第 {chapterProgress.from}—{chapterProgress.to} 章</p> : null}
        <div className="mt-4" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label={chapterProgress ? "本次正文完成进度" : "导演阶段进度"}>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{chapterProgress ? "正文已检查并保存" : "规划进度"}</span>
            <span className="font-medium tabular-nums text-foreground">{progress.done}/{progress.total}{chapterProgress ? " 章" : " 阶段"}</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-border" aria-hidden="true">
            <div className={`h-full rounded-full motion-safe:transition-[width] ${view.mode === "completed" ? "bg-success" : "bg-primary"}`} style={{ width: `${progress.total > 0 ? Math.min(100, (progress.done / progress.total) * 100) : 0}%` }} />
          </div>
        </div>
      </section>

      <section id="director-next-action" aria-label="需要你做什么" className="space-y-3 py-5">
        {!(launchForm && view.mode === "completed") && <p className="text-sm leading-6 text-muted-foreground">{reviewingCurrentGate ? "请核对左侧本阶段结果，确认后 AI 按本次授权范围继续。" : recoveringReview ? "重新生成章节任务与场景后，再确认并继续创作。" : view.nextActionGuidance}</p>}
        {view.detail && <p className={`break-words rounded-md p-3 text-sm leading-6 ${reviewingCharacters ? "bg-muted/50 text-muted-foreground" : "bg-destructive/5 text-destructive"}`}>{view.detail}</p>}
        {!preview && <DirectorCharacterCandidates page={candidatePage} runId={view.runId} novelId={novelId}
          proseReview={view.availableActions.some(action => action.id === "review:chapter_batch_closed")}/>}
        {candidates.isError && <p role="alert" className="text-sm text-destructive">人物候选暂时未能加载，请稍后重试。</p>}
        {view.mode === "paused" && view.chapterBudget && <ChapterBudgetRecovery key={`${view.runId}:${view.sourceTrace.controlVersion}:${view.chapterBudget.chapterId}`}
          budget={view.chapterBudget} runId={view.runId} novelId={novelId} expectedVersion={view.sourceTrace.controlVersion} disabled={preview || reviewingCharacters}/>}
        {view.mode === "paused" && view.unknownClaims && <UnknownClaimsRecovery key={`${view.runId}:${view.sourceTrace.controlVersion}:${view.unknownClaims.chapterId}`}
          claims={view.unknownClaims} runId={view.runId} novelId={novelId} expectedVersion={view.sourceTrace.controlVersion} disabled={preview || reviewingCharacters}/>}
        {!preview && view.mode === "waiting_gate" && (reviewingCurrentGate || recoveringReview) && <DirectorGate key={`${view.runId}:${view.sourceTrace.controlVersion}`} runId={view.runId} novelId={novelId} expectedVersion={view.sourceTrace.controlVersion} reviewType={reviewAction?.id.slice("review:".length)} canConfirm={Boolean(reviewingCurrentGate)} proseApproval={proseApproval}
          renderPlanEditor={renderPlanEditor && (input => renderPlanEditor(input, view.nextLaunchRange))}/>}
        {!outlineBound && driveSwitch?.toDriver && <DirectorDriveSwitch runId={view.runId} novelId={novelId} expectedVersion={view.sourceTrace.controlVersion} toDriver={driveSwitch.toDriver} label={driveSwitch.label} disabled={preview}/>}
        {launchForm}
      </section>

      <section className="border-y border-border/60 py-3" aria-label="质量提醒">
        {view.debts.count > 0 ? <>
          <p className="flex items-center gap-2.5 text-sm font-semibold"><ShieldAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />{view.debts.count} 项质量提醒</p>
          {view.debts.chapterOrders.length > 0 && <p className="mt-1 pl-7 text-sm leading-6 text-muted-foreground">从左侧目录查看第 {view.debts.chapterOrders.join("、")} 章。</p>}
        </> : <p className="flex items-center gap-2.5 text-sm text-muted-foreground"><ShieldCheck className="size-4 shrink-0" aria-hidden="true" />本次没有质量提醒</p>}
      </section>

      <div className="divide-y divide-border/60">
        <PanelDisclosure icon={History} title="创作时间线">
          {timeline.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">暂时没有可展示的时间线。</p>
          ) : (
            <ol className="space-y-2 pl-1">
              {timeline.slice(-8).reverse().map((event) => (
                <li key={`${event.seq}-${event.type}`} className="flex gap-3 text-xs">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden="true" />
                  <span className="min-w-0 text-muted-foreground">
                    <span className="block text-foreground">{formatEvent(event)}</span>
                    <time className="mt-0.5 block tabular-nums" dateTime={event.createdAt}>{formatTime(event.createdAt)}</time>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </PanelDisclosure>

        {!preview && <InvocationUsageList runId={view.runId} active={["running","queued"].includes(view.mode)}/>}
        <PanelDisclosure icon={ListChecks} title="查看运行诊断">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs text-muted-foreground">
            <dt>创作方式</dt><dd className="text-foreground">{directorDriverLabel(view.driver)}</dd>
            <dt>计划版本</dt><dd className="break-all text-foreground">{view.sourceTrace.planVersion}</dd>
            <dt>状态版本</dt><dd className="text-foreground">{view.sourceTrace.controlVersion}</dd>
            <dt>阶段完成</dt><dd className="text-foreground">{view.progress.done}/{view.progress.total}</dd>
          </dl>
        </PanelDisclosure>
      </div>
    </div>
  );
}
