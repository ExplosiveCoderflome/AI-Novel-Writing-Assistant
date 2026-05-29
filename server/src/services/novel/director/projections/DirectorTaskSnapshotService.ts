import type {
  DirectorTaskFactInspection,
  DirectorTaskFactInspectionResponse,
  DirectorTaskSnapshot,
  DirectorTaskSnapshotResponse,
} from "@ai-novel/shared/types/directorRuntime";
import { DirectorEventProjectionService } from "../runtime/DirectorEventProjectionService";
import { DirectorRuntimeStore } from "../runtime/DirectorRuntimeStore";
import { DirectorStateReader } from "../DirectorStateReader";
import { DirectorFactSummaryService } from "./DirectorFactSummaryService";
import {
  inspectWorkflowStepFacts,
  isExecutableWorkflowStepModule,
  type WorkflowStepModule,
  type WorkflowStepProgress,
  type WorkflowStepExecutionContext,
} from "../workflowStepRuntime/WorkflowStepModule";
import { directorWorkflowStepModuleRegistry } from "../workflowStepRuntime/directorWorkflowStepModules";
import { buildDirectorDisplayState } from "./DirectorDisplayStateBuilder";
import { buildDirectorDashboardView } from "./DirectorDashboardViewBuilder";

function buildNextActions(input: {
  taskStatus: string;
  factNextAction?: string | null;
}): string[] {
  const actions: string[] = [];
  if (input.factNextAction) {
    actions.push(input.factNextAction);
  }
  if (input.taskStatus === "waiting_approval") {
    actions.push("approve_gate", "cancel");
    return Array.from(new Set(actions));
  }
  if (input.taskStatus === "failed") {
    actions.push("resume_from_checkpoint", "cancel");
    return Array.from(new Set(actions));
  }
  if (actions.length === 0 && (input.taskStatus === "running" || input.taskStatus === "queued")) {
    actions.push("continue");
  }
  return Array.from(new Set(actions));
}

interface FactStepState {
  module: WorkflowStepModule<unknown, unknown>;
  facts: Awaited<ReturnType<typeof inspectWorkflowStepFacts>>;
  progress: WorkflowStepProgress;
}

type DirectorState = NonNullable<Awaited<ReturnType<DirectorStateReader["readByTaskId"]>>>;

export class DirectorTaskSnapshotService {
  private readonly stateReader: DirectorStateReader;
  private readonly runtimeStore: DirectorRuntimeStore;
  private readonly projectionService: DirectorEventProjectionService;
  private readonly factSummaryService: DirectorFactSummaryService;

  constructor(input: {
    stateReader?: DirectorStateReader;
    runtimeStore?: DirectorRuntimeStore;
    projectionService?: DirectorEventProjectionService;
    factSummaryService?: DirectorFactSummaryService;
  } = {}) {
    this.stateReader = input.stateReader ?? new DirectorStateReader();
    this.runtimeStore = input.runtimeStore ?? new DirectorRuntimeStore();
    this.projectionService = input.projectionService ?? new DirectorEventProjectionService();
    this.factSummaryService = input.factSummaryService ?? new DirectorFactSummaryService({
      stateReader: this.stateReader,
    });
  }

  private async inspectFacts(input: {
    state: Awaited<ReturnType<DirectorStateReader["readByTaskId"]>>;
    runtime: Awaited<ReturnType<DirectorRuntimeStore["getSnapshot"]>>;
  }) {
    const modules = directorWorkflowStepModuleRegistry
      .list()
      .filter(isExecutableWorkflowStepModule);
    const baseContext: WorkflowStepExecutionContext = {
      taskId: input.state?.task.id,
      novelId: input.state?.task.novelId ?? null,
      artifacts: input.runtime?.artifacts ?? [],
      projectionHints: {
        directorCanonicalState: input.state,
      },
    };
    const baseSummary = await this.factSummaryService.getBaseSummary(baseContext);
    const context: WorkflowStepExecutionContext = {
      ...baseContext,
      projectionHints: {
        ...(baseContext.projectionHints ?? {}),
        directorFactBaseSummary: baseSummary,
      },
    };
    const inspectedSteps = await Promise.all(modules.map(async (module) => {
      try {
        const [facts, progress] = await Promise.all([
          inspectWorkflowStepFacts(module, context),
          module.inspectProgress(context),
        ]);
        return {
          stepId: module.id,
          label: module.label,
          stage: module.stage,
          targetType: module.targetType,
          ready: facts.ready,
          completed: facts.completed,
          completenessRatio: facts.completenessRatio,
          nextAction: facts.nextAction ?? progress.nextAction ?? null,
          resumeFrom: facts.resumeFrom ?? null,
          blockers: facts.blockers,
          evidence: facts.evidence,
          producedArtifacts: facts.producedArtifacts,
          progress: {
            status: progress.status,
            current: progress.current,
            total: progress.total,
            ratio: progress.ratio,
            label: progress.label,
            nextAction: progress.nextAction ?? null,
            evidence: progress.evidence,
          },
          inspectError: null,
          isActiveRuntimeStep: input.state?.activeStep?.nodeKey === module.nodeKey,
          module,
          facts,
        };
      } catch (error) {
        return {
          stepId: module.id,
          label: module.label,
          stage: module.stage,
          targetType: module.targetType,
          ready: false,
          completed: false,
          completenessRatio: 0,
          nextAction: null,
          resumeFrom: null,
          blockers: [],
          evidence: undefined,
          producedArtifacts: [],
          progress: null,
          inspectError: error instanceof Error ? error.message : "Unknown inspection error.",
          isActiveRuntimeStep: input.state?.activeStep?.nodeKey === module.nodeKey,
          module,
          facts: null,
        };
      }
    }));
    const activeFact = inspectedSteps.find((step) => (
      step.module.nodeKey === input.state?.activeStep?.nodeKey
      && !step.completed
      && !step.inspectError
    )) ?? inspectedSteps.find((step) => !step.completed && !step.inspectError) ?? null;
    const factSummary = this.factSummaryService.buildTaskSummary({
      base: baseSummary,
      steps: inspectedSteps.map((step) => ({
        stepId: step.stepId,
        label: step.label,
        stage: step.stage,
        completed: step.completed,
        completenessRatio: step.completenessRatio,
        evidence: step.evidence,
        nextAction: step.nextAction,
      })),
      currentFactStepId: activeFact?.stepId ?? null,
      currentFactStepLabel: activeFact?.label ?? null,
      currentFactEvidence: activeFact?.evidence ?? null,
    });
    return {
      steps: inspectedSteps.map((step) => ({
        ...step,
        isCurrentFactStep: activeFact?.stepId === step.stepId,
      })),
      factStep: activeFact
        ? {
          module: activeFact.module,
          facts: activeFact.facts ?? {
            stepId: activeFact.stepId,
            ready: activeFact.ready,
            completed: activeFact.completed,
            blockers: activeFact.blockers,
            evidence: activeFact.evidence,
            producedArtifacts: activeFact.producedArtifacts,
            completenessRatio: activeFact.completenessRatio,
            nextAction: activeFact.nextAction,
            resumeFrom: activeFact.resumeFrom,
          },
          progress: activeFact.progress ?? {
            status: "not_started",
            current: 0,
            total: 1,
            ratio: 0,
            label: activeFact.label,
            nextAction: activeFact.nextAction,
            evidence: activeFact.evidence,
          },
        } satisfies FactStepState
        : null,
      factSummary,
    };
  }

  private async resolveFactInspectionState(taskId: string): Promise<DirectorState | null> {
    const state = await this.stateReader.readByTaskId(taskId);
    if (!state) {
      return null;
    }
    if (state.task.lane === "auto_director" || !state.task.novelId?.trim()) {
      return state;
    }
    return await this.stateReader.readLatestByNovelId(state.task.novelId) ?? state;
  }

  async getTaskSnapshot(taskId: string): Promise<DirectorTaskSnapshotResponse> {
    const state = await this.stateReader.readByTaskId(taskId);
    if (!state) {
      return { snapshot: null };
    }
    const runtime = await this.runtimeStore.getSnapshot(taskId);
    const inspected = await this.inspectFacts({ state, runtime });
    const factStep = inspected.factStep;
    const projection = this.projectionService.buildSnapshotProjection(runtime, {
      chapterProgress: state.chapterProgress ?? null,
      factSummary: inspected.factSummary,
      currentFactStep: factStep
        ? {
          stepId: factStep.module.id,
          stepLabel: factStep.module.label,
          evidence: factStep.facts.evidence ?? factStep.progress.evidence ?? null,
          nextActionLabel: factStep.progress.nextAction ?? null,
        }
        : null,
    });
    const displayState = buildDirectorDisplayState({
      task: state.task,
      projection,
      factSummary: inspected.factSummary,
      activeStepNodeKey: state.activeStep?.nodeKey ?? null,
      currentFactStepId: factStep?.module.id ?? null,
      currentFactStepLabel: factStep?.module.label ?? null,
      factStep,
      chapterProgress: state.chapterProgress ?? null,
    });
    const dashboardView = buildDirectorDashboardView({
      task: state.task,
      projection,
      displayState,
      factSummary: inspected.factSummary,
      chapterProgress: state.chapterProgress ?? null,
      activeStep: state.activeStep,
      latestCommand: state.latestCommand,
    });
    const snapshot: DirectorTaskSnapshot = {
      task: {
        id: state.task.id,
        novelId: state.task.novelId,
        status: state.task.status,
        currentStage: state.task.currentStage ?? null,
        currentItemKey: state.task.currentItemKey ?? null,
        currentItemLabel: state.task.currentItemLabel ?? null,
        progress: state.task.progress ?? null,
        checkpointType: state.task.checkpointType ?? null,
        checkpointSummary: state.task.checkpointSummary ?? null,
        lastError: state.task.lastError ?? null,
        pendingManualRecovery: state.task.pendingManualRecovery ?? null,
        cancelRequestedAt: state.task.cancelRequestedAt?.toISOString() ?? null,
      },
      run: state.run,
      activeStep: state.activeStep,
      latestCommand: state.latestCommand,
      runtime,
      projection,
      recentEvents: runtime?.events.slice(-50) ?? [],
      artifacts: runtime?.artifacts ?? [],
      currentFactStepId: factStep?.module.id ?? null,
      currentFactStepLabel: factStep?.module.label ?? null,
      currentFactEvidence: factStep?.facts.evidence ?? factStep?.progress.evidence ?? null,
      factSummary: inspected.factSummary,
      chapterProgress: state.chapterProgress ?? null,
      displayState,
      dashboardView,
      nextActions: buildNextActions({
        taskStatus: state.task.status,
        factNextAction: factStep?.progress.nextAction ?? factStep?.facts.nextAction ?? null,
      }),
    };
    return { snapshot };
  }

  async getTaskFactInspection(taskId: string): Promise<DirectorTaskFactInspectionResponse> {
    const state = await this.resolveFactInspectionState(taskId);
    if (!state) {
      return { inspection: null };
    }
    const runtime = await this.runtimeStore.getSnapshot(state.task.id);
    const inspected = await this.inspectFacts({ state, runtime });
    const factStep = inspected.factStep;
    const steps = inspected.steps.map((step) => ({
      stepId: step.stepId,
      label: step.label,
      stage: step.stage,
      targetType: step.targetType,
      ready: step.ready,
      completed: step.completed,
      completenessRatio: step.completenessRatio,
      nextAction: step.nextAction,
      resumeFrom: step.resumeFrom,
      blockers: step.blockers,
      evidence: step.evidence,
      producedArtifacts: step.producedArtifacts,
      progress: step.progress,
      inspectError: step.inspectError,
      isCurrentFactStep: step.isCurrentFactStep,
      isActiveRuntimeStep: step.isActiveRuntimeStep,
    }));

    const inspection: DirectorTaskFactInspection = {
      taskId: state.task.id,
      novelId: state.task.novelId,
      currentFactStepId: factStep?.module.id ?? null,
      currentFactStepLabel: factStep?.module.label ?? null,
      currentFactEvidence: factStep?.facts.evidence ?? factStep?.progress.evidence ?? null,
      factSummary: inspected.factSummary,
      steps,
    };
    return { inspection };
  }

  async getNovelFactInspection(novelId: string): Promise<DirectorTaskFactInspectionResponse> {
    const state = await this.stateReader.readLatestByNovelId(novelId);
    if (!state) {
      return { inspection: null };
    }
    const runtime = await this.runtimeStore.getSnapshot(state.task.id);
    const inspected = await this.inspectFacts({ state, runtime });
    const factStep = inspected.factStep;
    const steps = inspected.steps.map((step) => ({
      stepId: step.stepId,
      label: step.label,
      stage: step.stage,
      targetType: step.targetType,
      ready: step.ready,
      completed: step.completed,
      completenessRatio: step.completenessRatio,
      nextAction: step.nextAction,
      resumeFrom: step.resumeFrom,
      blockers: step.blockers,
      evidence: step.evidence,
      producedArtifacts: step.producedArtifacts,
      progress: step.progress,
      inspectError: step.inspectError,
      isCurrentFactStep: step.isCurrentFactStep,
      isActiveRuntimeStep: step.isActiveRuntimeStep,
    }));

    const inspection: DirectorTaskFactInspection = {
      taskId: state.task.id,
      novelId: state.task.novelId,
      currentFactStepId: factStep?.module.id ?? null,
      currentFactStepLabel: factStep?.module.label ?? null,
      currentFactEvidence: factStep?.facts.evidence ?? factStep?.progress.evidence ?? null,
      factSummary: inspected.factSummary,
      steps,
    };
    return { inspection };
  }
}
