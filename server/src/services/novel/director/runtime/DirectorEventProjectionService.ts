import type {
  DirectorEvent,
  DirectorNextAction,
  DirectorRuntimeProjection,
  DirectorRuntimeProjectionStatus,
  DirectorRuntimeSnapshot,
  DirectorStepRun,
  DirectorWorkspaceInventory,
} from "@ai-novel/shared/types/directorRuntime";

function timestampOf(value?: string | null): number {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function latestStep(steps: DirectorStepRun[]): DirectorStepRun | null {
  return steps.reduce<DirectorStepRun | null>((latest, step) => {
    if (!latest) {
      return step;
    }
    const stepTime = Math.max(timestampOf(step.finishedAt), timestampOf(step.startedAt));
    const latestTime = Math.max(timestampOf(latest.finishedAt), timestampOf(latest.startedAt));
    return stepTime >= latestTime ? step : latest;
  }, null);
}

function latestEvent(events: DirectorEvent[]): DirectorEvent | null {
  return events.reduce<DirectorEvent | null>((latest, event) => {
    if (!latest) {
      return event;
    }
    return timestampOf(event.occurredAt) >= timestampOf(latest.occurredAt) ? event : latest;
  }, null);
}

function statusFromStep(step: DirectorStepRun | null): DirectorRuntimeProjectionStatus {
  if (!step) {
    return "idle";
  }
  if (step.status === "waiting_approval") {
    return "waiting_approval";
  }
  if (step.status === "blocked_scope") {
    return "blocked";
  }
  if (step.status === "failed") {
    return "failed";
  }
  if (step.status === "running") {
    return "running";
  }
  return "completed";
}

function resolveBlockedReason(step: DirectorStepRun | null, event: DirectorEvent | null): string | null {
  if (!step) {
    return null;
  }
  if (step.status === "waiting_approval" || step.status === "blocked_scope") {
    return step.policyDecision?.reason ?? event?.summary ?? step.error ?? null;
  }
  if (step.status === "failed") {
    return step.error ?? event?.summary ?? null;
  }
  return null;
}

function formatNextAction(action: DirectorNextAction | null | undefined): string | null {
  if (!action) {
    return null;
  }
  const labels: Record<DirectorNextAction["action"], string> = {
    generate_candidates: "生成可选开书方向",
    create_book_contract: "生成书级创作约定",
    complete_story_macro: "完善故事宏观规划",
    prepare_characters: "准备角色阵容",
    build_volume_strategy: "生成分卷策略",
    build_chapter_tasks: "生成章节任务单",
    continue_chapter_execution: "继续章节生成",
    review_recent_chapters: "复查最近章节",
    repair_scope: "修复受影响范围",
    ask_user_confirmation: "请确认后继续",
  };
  return labels[action.action];
}

function buildHeadline(input: {
  status: DirectorRuntimeProjectionStatus;
  step: DirectorStepRun | null;
  event: DirectorEvent | null;
}): string {
  const label = input.step?.label?.trim() || input.event?.summary?.trim() || "同步导演进度";
  if (input.status === "waiting_approval") {
    return `等待确认：${label}`;
  }
  if (input.status === "blocked") {
    return `暂停处理：${label}`;
  }
  if (input.status === "failed") {
    return `处理失败：${label}`;
  }
  if (input.status === "running") {
    return `推进任务：${label}`;
  }
  if (input.status === "completed") {
    return `步骤完成：${label}`;
  }
  return label;
}

function buildDetail(input: {
  status: DirectorRuntimeProjectionStatus;
  step: DirectorStepRun | null;
  event: DirectorEvent | null;
  blockedReason: string | null;
}): string | null {
  if (input.status === "running") {
    const eventSummary = input.event?.summary?.trim();
    return eventSummary ? `最近进展：${eventSummary}` : "系统正在处理这一步，完成后会写入新的进展。";
  }
  if (input.status === "waiting_approval" || input.status === "blocked" || input.status === "failed") {
    return input.blockedReason;
  }
  if (input.status === "completed") {
    return input.event?.summary?.trim() ?? null;
  }
  return null;
}

function buildScopeSummary(inventory: DirectorWorkspaceInventory | null | undefined): string | null {
  if (!inventory) {
    return null;
  }
  const parts = [
    `${inventory.chapterCount} 章`,
    `${inventory.draftedChapterCount} 章有正文`,
  ];
  if (inventory.pendingRepairChapterCount > 0) {
    parts.push(`${inventory.pendingRepairChapterCount} 章待修复`);
  }
  if (inventory.missingArtifactTypes.length > 0) {
    parts.push(`${inventory.missingArtifactTypes.length} 类产物待补齐`);
  }
  return `工作区：${parts.join("，")}。`;
}

function buildProgressSummary(snapshot: DirectorRuntimeSnapshot, inventory: DirectorWorkspaceInventory | null | undefined): string {
  const completedSteps = snapshot.steps.filter((step) => step.status === "succeeded").length;
  const waitingSteps = snapshot.steps.filter((step) => step.status === "waiting_approval" || step.status === "blocked_scope").length;
  const failedSteps = snapshot.steps.filter((step) => step.status === "failed").length;
  const protectedCount = inventory?.protectedUserContentArtifacts.length
    ?? snapshot.artifacts.filter((artifact) => artifact.protectedUserContent === true || artifact.source === "user_edited").length;
  const staleCount = inventory?.staleArtifacts.length
    ?? snapshot.artifacts.filter((artifact) => artifact.status === "stale").length;
  const repairCount = inventory?.needsRepairArtifacts.length
    ?? snapshot.artifacts.filter((artifact) => artifact.artifactType === "repair_ticket" && artifact.status !== "rejected").length;
  const parts = [
    `${completedSteps}/${snapshot.steps.length} 个步骤完成`,
    `${snapshot.artifacts.length} 个产物记录`,
  ];
  if (waitingSteps > 0) {
    parts.push(`${waitingSteps} 个步骤待确认`);
  }
  if (failedSteps > 0) {
    parts.push(`${failedSteps} 个步骤失败`);
  }
  if (protectedCount > 0) {
    parts.push(`${protectedCount} 个用户内容受保护`);
  }
  if (staleCount > 0) {
    parts.push(`${staleCount} 个产物需确认`);
  }
  if (repairCount > 0) {
    parts.push(`${repairCount} 个修复任务`);
  }
  return `进展：${parts.join("，")}。`;
}

export class DirectorEventProjectionService {
  buildSnapshotProjection(snapshot: DirectorRuntimeSnapshot | null): DirectorRuntimeProjection | null {
    if (!snapshot) {
      return null;
    }
    const step = latestStep(snapshot.steps);
    const event = latestEvent(snapshot.events);
    const status = statusFromStep(step);
    const requiresUserAction = status === "waiting_approval" || status === "blocked";
    const blockedReason = resolveBlockedReason(step, event);
    const inventory = snapshot.lastWorkspaceAnalysis?.inventory ?? null;
    const recommendation = snapshot.lastWorkspaceAnalysis?.recommendation
      ?? snapshot.lastWorkspaceAnalysis?.interpretation?.recommendedAction
      ?? null;
    const headline = buildHeadline({ status, step, event });
    const recentEvents = [...snapshot.events]
      .sort((left, right) => timestampOf(right.occurredAt) - timestampOf(left.occurredAt))
      .slice(0, 8)
      .map((item) => ({
        eventId: item.eventId,
        type: item.type,
        summary: item.summary,
        nodeKey: item.nodeKey,
        artifactType: item.artifactType,
        severity: item.severity,
        occurredAt: item.occurredAt,
      }));

    return {
      runId: snapshot.runId,
      novelId: snapshot.novelId,
      status,
      currentNodeKey: step?.nodeKey ?? event?.nodeKey ?? null,
      currentLabel: step?.label ?? event?.summary ?? null,
      headline,
      detail: buildDetail({ status, step, event, blockedReason }),
      lastEventSummary: event?.summary ?? null,
      requiresUserAction,
      blockedReason,
      nextActionLabel: formatNextAction(recommendation),
      scopeSummary: buildScopeSummary(inventory),
      progressSummary: buildProgressSummary(snapshot, inventory),
      policyMode: snapshot.policy.mode,
      updatedAt: snapshot.updatedAt,
      recentEvents,
    };
  }
}
