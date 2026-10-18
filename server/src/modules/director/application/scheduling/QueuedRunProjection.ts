import type {DashboardView} from "../../domain";
import type {DirectorWorkerHealth} from "../worker";
import type {RunRepository} from "../ports";

/** No task writes, wakeups or recovery commands from a read path. */
export function projectQueuedRun(view: DashboardView, state: NonNullable<Awaited<ReturnType<RunRepository["getSchedulingState"]>>>,
  health: DirectorWorkerHealth, now: Date): DashboardView {
  if (view.mode !== "queued") return view;
  const liveLease = !!state.leaseOwner && !!state.leaseExpiresAt && state.leaseExpiresAt > now;
  const stale = !health.lastPollAt || now.getTime() - health.lastPollAt.getTime() > 60_000;
  const busy = health.state === "working" && health.activeRunId !== view.runId;
  const unavailable = health.state === "stopped" || (!busy && stale);
  const canRetry = !liveLease && !busy && (unavailable || health.state === "retrying" || now.getTime() - state.createdAt.getTime() > 60_000);
  const status = liveLease ? "starting" : busy ? "busy" : unavailable ? "unavailable" : health.state === "retrying" ? "retrying" : "waiting";
  return {...view, workerStatus: {state: status, canRetry},
    headline: liveLease ? "正在启动本次创作" : busy ? "等待其他作品完成当前阶段" : canRetry ? "本次创作尚未启动" : "等待开始创作",
    nextActionGuidance: canRetry ? "可点击“重新启动创作”重试排队，已有内容与创作范围会保留。"
      : busy ? "后台正在处理其他作品，本书会在当前阶段结束后开始。" : "请等待后台启动本次创作。",
    detail: unavailable ? "后台执行暂不可用。重新启动创作可再次请求执行。"
      : health.state === "retrying" ? "后台执行遇到异常，系统会自动重试。" : view.detail,
    availableActions: canRetry ? [{id: "retry_start", label: "重新启动创作", kind: "command", primary: true, command: "retry_start"},
      ...view.availableActions] : view.availableActions};
}
