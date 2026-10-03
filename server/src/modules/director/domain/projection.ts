import { isArtifactSatisfied } from "./plan";
import type {
  ArtifactType,
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

export interface ProjectionInput {
  contract: RunContract;
  control: RunControl;
  plan: PlanDefinition;
  facts: FactsSnapshot;
  artifactTypes: Readonly<Record<ArtifactType, ArtifactTypeInfo>>;
  sourceRoute: string;
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

  switch (control.status) {
    case "queued":
      headline = "等待开始创作";
      availableActions = [CANCEL_ACTION];
      break;
    case "running": {
      const cursor = plan.steps.find((step) => step.id === control.cursorStepId);
      headline = cursor ? `正在生成「${cursor.label}」` : "正在推进创作";
      availableActions = [CANCEL_ACTION];
      break;
    }
    case "waiting_gate": {
      const types = control.gate?.artifactTypes ?? [];
      headline = `请确认「${types.map((type) => infoOf(type).label).join("、")}」后继续`;
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
      if (pauseKind === "replan") {
        headline = "需要重新规划后继续";
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
      headline = "当前授权范围内的创作已完成";
      availableActions = [];
      break;
    case "failed":
      headline = "创作中断，可从现有内容继续";
      detail = control.failureReason;
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

