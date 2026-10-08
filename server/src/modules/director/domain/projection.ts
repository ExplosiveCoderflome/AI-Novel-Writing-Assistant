import { isArtifactSatisfied } from "./plan";
import type {
  ArtifactType,
  ChapterRange,
  Driver,
  FactsSnapshot,
  PauseKind,
  PlanDefinition,
  RunContract,
  RunControl,
  RunStatus,
} from "./types";

export interface ArtifactTypeInfo {
  label: string;
  /** Composition may register a :novelId template; the application resolves it before project(). */
  reviewRoute: string;
}

export interface ActionDescriptor {
  id: string;
  label: string;
  kind: "command" | "navigate";
  primary: boolean;
  command?: "resume" | "cancel" | "open_run" | "handoff";
  toDriver?: Driver;
  target?: string;
}

export interface DashboardView {
  runId: string;
  novelId: string;
  mode: RunStatus;
  driver: Driver;
  headline: string;
  detail: string | null;
  nextActionGuidance: string;
  chapterProgress: ChapterProgress | null;
  nextLaunchRange: ChapterRange | null;
  workspaceActivity: WorkspaceActivity;
  progress: { done: number; total: number; source: "artifact_ledger" };
  debts: { count: number; chapterOrders: number[] };
  availableActions: ActionDescriptor[];
  sourceRoute: string;
  sourceTrace: {
    controlStatus: RunStatus;
    controlVersion: number;
    pauseKind: PauseKind | null;
    planVersion: string;
  };
}

/** Presentation-only identity and invalidation signal; never authorizes a workflow command. */
export interface WorkspaceActivity {
  novelId: string;
  runId: string;
  revision: string;
  focus: {key: string; artifactType: string; label: string; volumeId?: string; chapterOrder?: number} | null;
}

function projectWorkspaceActivity({contract, control, plan, facts}: ProjectionInput): WorkspaceActivity {
  const step = control.status === "running"
    ? plan.steps.find(row => row.id === control.cursorStepId)
    : control.status === "waiting_gate"
      ? plan.steps.find(row => row.produces === control.gate?.artifactTypes[0]) : undefined;
  return {
    novelId: contract.novelId,
    runId: contract.runId,
    // Control boundaries also invalidate review contexts. Artifact versions catch saves before the boundary.
    revision: JSON.stringify([contract.runId, control.version,
      facts.artifacts.map(row => JSON.stringify([row.type, row.scope, row.version, row.status])).sort()]),
    focus: step ? {key: `${contract.runId}:${control.version}:${step.id}`, artifactType: step.produces, label: step.label,
      ...(contract.launchInput?.targetVolumeId ? {volumeId: contract.launchInput.targetVolumeId} : {}),
      ...(contract.chapterRange ? {chapterOrder: contract.chapterRange.from} : {})} : null,
  };
}

/** Read-only saved production facts. Chapter identity is resolved by the business adapter. */
export interface ChapterProgress extends ChapterRange {
  done: number;
  total: number;
  current: {order: number; title: string; phase: "generating_chapters" | "reviewing" | "repairing" | "finalizing"} | null;
}

export interface ProductionProjection {
  chapterProgress: ChapterProgress | null;
  nextLaunchRange: ChapterRange | null;
}

export interface ProjectionInput {
  contract: RunContract;
  control: RunControl;
  plan: PlanDefinition;
  facts: FactsSnapshot;
  artifactTypes: Readonly<Record<ArtifactType, ArtifactTypeInfo>>;
  sourceRoute: string;
  production?: ProductionProjection;
}

const CANCEL_ACTION: ActionDescriptor = {
  id: "cancel",
  label: "取消本次创作",
  kind: "command",
  primary: false,
  command: "cancel",
};

export function project(input: ProjectionInput): DashboardView {
  const { contract, control, plan, facts, artifactTypes, sourceRoute } = input;

  const inScope = plan.steps.filter(
    (step) => !contract.stepIdsInScope || contract.stepIdsInScope.includes(step.id),
  );
  const done = inScope.filter((step) => isArtifactSatisfied(facts, step.produces, contract.scope, false)).length;
  const chapterOrders = [...new Set(facts.debts.map((debt) => debt.chapterOrder))].sort(
    (left, right) => left - right,
  );

  const infoOf = (type: ArtifactType): ArtifactTypeInfo =>
    artifactTypes[type] ?? { label: type, reviewRoute: sourceRoute };

  let headline: string;
  let detail: string | null = null;
  let availableActions: ActionDescriptor[];
  let nextActionGuidance = "请等待 AI 推进；阶段结果保存后，会提示你查看和确认。";
  const chapterProgress = input.production?.chapterProgress ?? null;
  const nextLaunchRange = input.production?.nextLaunchRange ?? null;

  switch (control.status) {
    case "queued":
      headline = "等待开始创作";
      availableActions = [CANCEL_ACTION];
      break;
    case "running": {
      const cursor = plan.steps.find((step) => step.id === control.cursorStepId);
      headline = cursor ? `正在生成「${cursor.label}」` : "正在推进创作";
      if (control.cursorStepId === "chapter_batch" && chapterProgress) {
        const current = chapterProgress.current;
        const verbs = {generating_chapters:"写作", reviewing:"检查", repairing:"完善", finalizing:"保存"};
        headline = current
          ? `正在${verbs[current.phase]}第 ${current.order} 章${current.title ? `《${current.title}》` : ""}`
          : `正在准备或收尾第 ${chapterProgress.from}—${chapterProgress.to} 章`;
        nextActionGuidance = "请等待本批次写作、检查和保存完成；需要你确认或处理问题时，会在这里提示。";
      }
      availableActions = [CANCEL_ACTION];
      break;
    }
    case "waiting_gate": {
      const types = control.gate?.artifactTypes ?? [];
      headline = `请确认「${types.map((type) => infoOf(type).label).join("、")}」后继续`;
      nextActionGuidance = "打开本阶段结果，核对后点击“确认结果并继续”。AI 会继续推进本次授权范围。";
      availableActions = [
        ...types.map(
          (type, index): ActionDescriptor => ({
            id: `review:${type}`,
            label: `去确认「${infoOf(type).label}」`,
            kind: "navigate",
            primary: index === 0,
            target: infoOf(type).reviewRoute,
          }),
        ),
        CANCEL_ACTION,
      ];
      break;
    }
    case "paused": {
      const pauseKind = control.pause?.kind ?? "manual_recovery";
      detail = control.pause?.reason ?? null;
      nextActionGuidance = "请先查看下方暂停原因，处理后点击“从保存进度继续”；已有正文会保留。";
      if (pauseKind === "replan") {
        headline = "需要重新规划后继续";
        nextActionGuidance = "请查看下方暂停原因，再点击“重新规划后继续”，让 AI 调整后续计划。";
      } else if (pauseKind === "safety") {
        headline = "检测到风险，暂停中，等待你处理";
      } else {
        headline = "暂停中，等待你从保存进度继续";
      }
      availableActions = [
        {
          id: "resume",
          label: pauseKind === "replan" ? "重新规划后继续" : "从保存进度继续",
          kind: "command",
          primary: true,
          command: "resume",
        },
        CANCEL_ACTION,
      ];
      break;
    }
    case "completed":
      headline = chapterProgress && chapterProgress.done === chapterProgress.total
        ? `第 ${chapterProgress.from}—${chapterProgress.to} 章已完成`
        : chapterProgress ? `本次第 ${chapterProgress.from}—${chapterProgress.to} 章创作已结束` : "本次创作规划已完成";
      nextActionGuidance = nextLaunchRange
        ? `下一步可写第 ${nextLaunchRange.from}—${nextLaunchRange.to} 章。核对下方章节范围，点击提交后，AI 才会开始本次创作。`
        : input.production ? "目标章节均有保存正文，请从左侧目录阅读并检查全书。" : "请从本书内容选择下一步创作范围。";
      availableActions = nextLaunchRange ? [{id:"open_run",label:`选择并继续写第 ${nextLaunchRange.from}—${nextLaunchRange.to} 章`,kind:"command",primary:true,command:"open_run"}] : [];
      break;
    case "failed":
      headline = "创作中断，可从现有内容继续";
      detail = control.failureReason;
      nextActionGuidance = "请查看下方中断原因。可以核对新的授权范围并提交，已有正文会保留。";
      availableActions = [
        {
          id: "open_run",
          label: "从现有内容继续创作",
          kind: "command",
          primary: true,
          command: "open_run",
        },
      ];
      break;
    case "cancelled":
      headline = "本次创作已取消";
      nextActionGuidance = "已有内容会保留。需要继续时，请核对下方章节范围并提交新的创作。";
      availableActions = [
        {
          id: "open_run",
          label: "从现有内容继续创作",
          kind: "command",
          primary: true,
          command: "open_run",
        },
      ];
      break;
    default: {
      const unreachable: never = control.status;
      throw new Error(`unsupported run status ${String(unreachable)}`);
    }
  }

  if (["queued", "running", "waiting_gate"].includes(control.status) && !control.cursorStepId && !facts.stopSignal) {
    const toDriver = contract.driver === "auto" ? "assisted" : "auto";
    availableActions.push({id: "handoff", kind: "command", primary: false, command: "handoff", toDriver,
      label: toDriver === "auto" ? "按原范围切换为全自动推进" : "按原范围切换为阶段确认"});
  }

  return {
    runId: contract.runId,
    novelId: contract.novelId,
    mode: control.status,
    driver: contract.driver,
    headline,
    detail,
    nextActionGuidance,
    chapterProgress,
    nextLaunchRange,
    workspaceActivity: projectWorkspaceActivity(input),
    progress: { done, total: inScope.length, source: "artifact_ledger" },
    debts: { count: facts.debts.length, chapterOrders },
    availableActions,
    sourceRoute,
    sourceTrace: {
      controlStatus: control.status,
      controlVersion: control.version,
      pauseKind: control.pause?.kind ?? null,
      planVersion: contract.planVersion,
    },
  };
}

