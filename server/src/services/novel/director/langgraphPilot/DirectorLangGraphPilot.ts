import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { DirectorWorkspaceAnalysis } from "@ai-novel/shared/types/directorRuntime";
import type { DirectorRuntimeService } from "../runtime/DirectorRuntimeService";
import type { WorkflowPlan, WorkflowPlanStep } from "../workflowStepRuntime/WorkflowStepModule";

export type DirectorLangGraphPilotStatus = "completed" | "interrupted" | "failed";

export interface DirectorLangGraphPilotTraceEvent {
  node: "workspace_analyze" | "recommend_next_action" | "run_next_step" | "approval_interrupt";
  status: "completed" | "skipped" | "interrupted" | "failed";
  stepId?: string | null;
  summary: string;
}

export interface DirectorLangGraphPilotInterrupt {
  id: string;
  stepId: string;
  title: string;
  summary: string;
  resumable: true;
}

export interface DirectorLangGraphPilotCheckpoint {
  completedGraphNodes: string[];
  completedStepIds: string[];
  pendingStep?: WorkflowPlanStep | null;
  interrupt?: DirectorLangGraphPilotInterrupt | null;
  trace: DirectorLangGraphPilotTraceEvent[];
}

export interface DirectorLangGraphPilotInput {
  taskId: string;
  novelId?: string | null;
  plan: WorkflowPlan;
  checkpoint?: DirectorLangGraphPilotCheckpoint | null;
  interruptBeforeStepIds?: string[];
  resume?: {
    interruptId: string;
    approved: boolean;
  } | null;
}

export interface DirectorLangGraphPilotResult {
  status: DirectorLangGraphPilotStatus;
  nextStep?: WorkflowPlanStep | null;
  executedStepIds: string[];
  interrupt?: DirectorLangGraphPilotInterrupt | null;
  checkpoint: DirectorLangGraphPilotCheckpoint;
  trace: DirectorLangGraphPilotTraceEvent[];
}

interface DirectorLangGraphPilotDeps {
  directorRuntime: Pick<DirectorRuntimeService, "analyzeWorkspace">;
  runStep?: (input: {
    taskId: string;
    novelId?: string | null;
    plan: WorkflowPlan;
    step: WorkflowPlanStep;
  }) => Promise<void>;
}

const DirectorLangGraphPilotState = Annotation.Root({
  taskId: Annotation<string>(),
  novelId: Annotation<string | null>(),
  plan: Annotation<WorkflowPlan>(),
  checkpoint: Annotation<DirectorLangGraphPilotCheckpoint | null>(),
  interruptBeforeStepIds: Annotation<string[]>(),
  resume: Annotation<DirectorLangGraphPilotInput["resume"]>(),
  completedGraphNodes: Annotation<string[]>(),
  completedStepIds: Annotation<string[]>(),
  pendingStep: Annotation<WorkflowPlanStep | null>(),
  analysis: Annotation<DirectorWorkspaceAnalysis | null>(),
  interrupt: Annotation<DirectorLangGraphPilotInterrupt | null>(),
  status: Annotation<DirectorLangGraphPilotStatus>(),
  executedStepIds: Annotation<string[]>(),
  trace: Annotation<DirectorLangGraphPilotTraceEvent[]>(),
});

type DirectorLangGraphPilotStateValue = typeof DirectorLangGraphPilotState.State;

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function appendTrace(
  state: DirectorLangGraphPilotStateValue,
  event: DirectorLangGraphPilotTraceEvent,
): DirectorLangGraphPilotTraceEvent[] {
  return [...(state.trace ?? []), event];
}

function hasCompletedGraphNode(state: DirectorLangGraphPilotStateValue, node: string): boolean {
  return (state.completedGraphNodes ?? []).includes(node);
}

function addCompletedGraphNode(state: DirectorLangGraphPilotStateValue, node: string): string[] {
  return unique([...(state.completedGraphNodes ?? []), node]);
}

function createInterrupt(input: {
  taskId: string;
  step: WorkflowPlanStep;
}): DirectorLangGraphPilotInterrupt {
  return {
    id: `${input.taskId}:${input.step.stepId}:approval`,
    stepId: input.step.stepId,
    title: "等待确认下一步",
    summary: `确认后继续执行「${input.step.label}」。`,
    resumable: true,
  };
}

export class DirectorLangGraphPilot {
  private readonly graph = new StateGraph(DirectorLangGraphPilotState)
    .addNode("workspace_analyze", this.workspaceAnalyzeNode.bind(this))
    .addNode("recommend_next_action", this.recommendNextActionNode.bind(this))
    .addNode("run_next_step", this.runNextStepNode.bind(this))
    .addNode("approval_interrupt", this.approvalInterruptNode.bind(this))
    .addEdge(START, "workspace_analyze")
    .addEdge("workspace_analyze", "recommend_next_action")
    .addEdge("recommend_next_action", "run_next_step")
    .addEdge("run_next_step", "approval_interrupt")
    .addEdge("approval_interrupt", END)
    .compile({
      name: "director_langgraph_pilot",
      description: "Low-risk auto director pilot graph for plan routing, interrupt, resume, and trace.",
    });

  constructor(private readonly deps: DirectorLangGraphPilotDeps) {}

  async run(input: DirectorLangGraphPilotInput): Promise<DirectorLangGraphPilotResult> {
    const checkpoint = input.checkpoint ?? null;
    const result = await this.graph.invoke({
      taskId: input.taskId,
      novelId: input.novelId ?? null,
      plan: input.plan,
      checkpoint,
      interruptBeforeStepIds: input.interruptBeforeStepIds ?? [],
      resume: input.resume ?? null,
      completedGraphNodes: checkpoint?.completedGraphNodes ?? [],
      completedStepIds: checkpoint?.completedStepIds ?? [],
      pendingStep: checkpoint?.pendingStep ?? null,
      analysis: null,
      interrupt: checkpoint?.interrupt ?? null,
      status: "completed",
      executedStepIds: [],
      trace: checkpoint?.trace ?? [],
    });

    return {
      status: result.status,
      nextStep: result.pendingStep,
      executedStepIds: result.executedStepIds ?? [],
      interrupt: result.interrupt,
      trace: result.trace ?? [],
      checkpoint: {
        completedGraphNodes: result.completedGraphNodes ?? [],
        completedStepIds: result.completedStepIds ?? [],
        pendingStep: result.pendingStep,
        interrupt: result.interrupt,
        trace: result.trace ?? [],
      },
    };
  }

  private async workspaceAnalyzeNode(state: DirectorLangGraphPilotStateValue) {
    if (hasCompletedGraphNode(state, "workspace_analyze")) {
      return {
        trace: appendTrace(state, {
          node: "workspace_analyze",
          status: "skipped",
          summary: "已复用上次工作区分析节点结果。",
        }),
      };
    }
    if (!state.novelId) {
      return {
        completedGraphNodes: addCompletedGraphNode(state, "workspace_analyze"),
        trace: appendTrace(state, {
          node: "workspace_analyze",
          status: "skipped",
          summary: "当前计划未绑定小说，跳过工作区分析。",
        }),
      };
    }
    const analysis = await this.deps.directorRuntime.analyzeWorkspace({
      novelId: state.novelId,
      workflowTaskId: state.taskId,
      includeAiInterpretation: false,
    });
    return {
      analysis,
      completedGraphNodes: addCompletedGraphNode(state, "workspace_analyze"),
      trace: appendTrace(state, {
        node: "workspace_analyze",
        status: "completed",
        summary: "已读取 DirectorRuntime 工作区分析结果。",
      }),
    };
  }

  private async recommendNextActionNode(state: DirectorLangGraphPilotStateValue) {
    if (hasCompletedGraphNode(state, "recommend_next_action") && state.pendingStep) {
      return {
        trace: appendTrace(state, {
          node: "recommend_next_action",
          status: "skipped",
          stepId: state.pendingStep.stepId,
          summary: "已复用上次推荐的下一步。",
        }),
      };
    }
    const completedStepIds = new Set(state.completedStepIds ?? []);
    const nextStep = state.plan.steps.find((step) => !completedStepIds.has(step.stepId)) ?? null;
    return {
      pendingStep: nextStep,
      completedGraphNodes: addCompletedGraphNode(state, "recommend_next_action"),
      trace: appendTrace(state, {
        node: "recommend_next_action",
        status: "completed",
        stepId: nextStep?.stepId ?? null,
        summary: nextStep
          ? `下一步建议为「${nextStep.label}」。`
          : "当前 Workflow Plan 没有剩余步骤。",
      }),
    };
  }

  private async runNextStepNode(state: DirectorLangGraphPilotStateValue) {
    const step = state.pendingStep;
    if (!step) {
      return {
        status: "completed" as const,
        trace: appendTrace(state, {
          node: "run_next_step",
          status: "skipped",
          summary: "没有可执行的下一步。",
        }),
      };
    }

    const waitingInterrupt = state.interrupt;
    const resume = state.resume;
    const isResumingApprovedInterrupt = Boolean(
      waitingInterrupt
      && resume?.approved
      && resume.interruptId === waitingInterrupt.id,
    );
    const shouldInterrupt = (state.interruptBeforeStepIds ?? []).includes(step.stepId)
      && !isResumingApprovedInterrupt;
    if (shouldInterrupt) {
      const interrupt = createInterrupt({
        taskId: state.taskId,
        step,
      });
      return {
        status: "interrupted" as const,
        interrupt,
        trace: appendTrace(state, {
          node: "run_next_step",
          status: "interrupted",
          stepId: step.stepId,
          summary: `执行「${step.label}」前等待确认。`,
        }),
      };
    }

    await this.deps.runStep?.({
      taskId: state.taskId,
      novelId: state.novelId,
      plan: state.plan,
      step,
    });
    return {
      status: "completed" as const,
      interrupt: null,
      pendingStep: null,
      executedStepIds: unique([...(state.executedStepIds ?? []), step.stepId]),
      completedStepIds: unique([...(state.completedStepIds ?? []), step.stepId]),
      completedGraphNodes: addCompletedGraphNode(state, "run_next_step"),
      trace: appendTrace(state, {
        node: "run_next_step",
        status: "completed",
        stepId: step.stepId,
        summary: `已执行「${step.label}」。`,
      }),
    };
  }

  private async approvalInterruptNode(state: DirectorLangGraphPilotStateValue) {
    if (state.status === "interrupted" && state.interrupt) {
      return {
        trace: appendTrace(state, {
          node: "approval_interrupt",
          status: "interrupted",
          stepId: state.interrupt.stepId,
          summary: state.interrupt.summary,
        }),
      };
    }
    return {
      completedGraphNodes: addCompletedGraphNode(state, "approval_interrupt"),
      trace: appendTrace(state, {
        node: "approval_interrupt",
        status: "completed",
        stepId: state.pendingStep?.stepId ?? null,
        summary: "本轮图执行未留下待确认中断。",
      }),
    };
  }
}
