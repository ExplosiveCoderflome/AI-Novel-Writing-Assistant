import type { DashboardView, DirectorTimelineEvent } from "@/api/directorNext";

export const previewStates = [
  { id: "running", label: "正在推进", mode: "running", headline: "正在生成「目标卷节奏板」", pauseKind: null },
  { id: "waiting_gate", label: "等待确认", mode: "waiting_gate", headline: "请确认「角色阵容」后继续", pauseKind: null },
  { id: "manual", label: "保存进度暂停", mode: "paused", headline: "暂停中，等待你从保存进度继续", pauseKind: "manual_recovery" },
  { id: "replan", label: "重新规划暂停", mode: "paused", headline: "需要重新规划后继续", pauseKind: "replan" },
  { id: "safety", label: "风险暂停", mode: "paused", headline: "检测到风险，暂停中，等待你处理", pauseKind: "safety" },
  { id: "failed", label: "创作中断", mode: "failed", headline: "创作中断，可从现有内容继续", pauseKind: null },
  { id: "completed", label: "范围完成", mode: "completed", headline: "当前授权范围内的创作已完成", pauseKind: null },
] as const;

export function previewView(id: string): DashboardView {
  const state = previewStates.find((item) => item.id === id) ?? previewStates[0];
  return {
    runId: "preview", novelId: "preview", mode: state.mode, driver: "auto", headline: state.headline,
    detail: state.id === "safety" ? "本次授权的用量范围已到达，请核对设置后决定下一步。" : null,
    progress: { done: state.id === "completed" ? 10 : 4, total: 10, source: "artifact_ledger" },
    debts: { count: 2, chapterOrders: [3, 5] },
    availableActions: state.mode === "completed" ? [] : state.mode === "waiting_gate"
      ? [{ id: "review", label: "去确认「角色阵容」", kind: "navigate", primary: true, target: "/lab/director/preview?state=waiting_gate" }]
      : state.mode === "paused"
        ? [{ id: "resume", label: state.id === "replan" ? "重新规划后继续" : "从保存进度继续", kind: "command", primary: true, command: "resume" }]
        : state.mode === "failed"
          ? [{ id: "open_run", label: "从现有内容继续创作", kind: "command", primary: true, command: "open_run" }]
          : [{ id: "cancel", label: "取消本次创作", kind: "command", primary: false, command: "cancel" }],
    sourceRoute: "/lab/director/preview", sourceTrace: { controlStatus: state.mode, controlVersion: 4, pauseKind: state.pauseKind, planVersion: "director-next-production-v1" },
  };
}

export const previewTimeline: DirectorTimelineEvent[] = [
  { seq: 1, type: "command_accepted", payload: {}, createdAt: "2026-10-02T01:00:00Z" },
  { seq: 2, type: "step_finished", payload: {}, createdAt: "2026-10-02T01:03:00Z" },
  { seq: 3, type: "quality_debt_recorded", payload: {}, createdAt: "2026-10-02T01:04:00Z" },
];
