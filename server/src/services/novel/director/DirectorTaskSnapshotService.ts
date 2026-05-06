import type {
  DirectorTaskFactInspection,
  DirectorTaskFactInspectionResponse,
  DirectorTaskSnapshot,
  DirectorTaskSnapshotResponse,
} from "@ai-novel/shared/types/directorRuntime";
import { DirectorEventProjectionService } from "./runtime/DirectorEventProjectionService";
import { DirectorRuntimeStore } from "./runtime/DirectorRuntimeStore";
import { DirectorStateReader } from "./DirectorStateReader";
import {
  inspectWorkflowStepFacts,
  isExecutableWorkflowStepModule,
  type WorkflowStepModule,
  type WorkflowStepProgress,
} from "./workflowStepRuntime/WorkflowStepModule";
import { directorWorkflowStepModuleRegistry } from "./workflowStepRuntime/directorWorkflowStepModules";
import { buildDirectorDisplayState } from "./DirectorDisplayStateBuilder";

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

export async function resolveFactStepState(input: {
  taskId: string;
  novelId?: string | null;
  activeStepNodeKey?: string | null;
}): Promise<FactStepState | null> {
  const modules = directorWorkflowStepModuleRegistry
    .list()
    .filter(isExecutableWorkflowStepModule);
  const context = {
    taskId: input.taskId,
    novelId: input.novelId ?? null,
  };
  const activeModule = input.activeStepNodeKey
    ? modules.find((module) => module.nodeKey === input.activeStepNodeKey) ?? null
    : null;
  if (activeModule) {
    const facts = await inspectWorkflowStepFacts(activeModule, context);
    if (!facts.completed) {
      return {
        module: activeModule,
        facts,
        progress: await activeModule.inspectProgress(context),
      };
    }
  }

  for (const module of modules) {
    const facts = await inspectWorkflowStepFacts(module, context);
    if (facts.completed) {
      continue;
    }
    return {
      module,
      facts,
      progress: await module.inspectProgress(context),
    };
  }
  return null;
}

export class DirectorTaskSnapshotService {
  private readonly stateReader: DirectorStateReader;
  private readonly runtimeStore: DirectorRuntimeStore;
  private readonly projectionService: DirectorEventProjectionService;

  constructor(input: {
    stateReader?: DirectorStateReader;
    runtimeStore?: DirectorRuntimeStore;
    projectionService?: DirectorEventProjectionService;
  } = {}) {
    this.stateReader = input.stateReader ?? new DirectorStateReader();
    this.runtimeStore = input.runtimeStore ?? new DirectorRuntimeStore();
    this.projectionService = input.projectionService ?? new DirectorEventProjectionService();
  }

  async getTaskSnapshot(taskId: string): Promise<DirectorTaskSnapshotResponse> {
    const state = await this.stateReader.readByTaskId(taskId);
    if (!state) {
      return { snapshot: null };
    }
    const runtime = await this.runtimeStore.getSnapshot(taskId);
    const factStep = await resolveFactStepState({
      taskId: state.task.id,
      novelId: state.task.novelId,
      activeStepNodeKey: state.activeStep?.nodeKey ?? null,
    });
    const projection = this.projectionService.buildSnapshotProjection(runtime, {
      chapterProgress: state.chapterProgress ?? null,
      currentFactStep: factStep
        ? {
          stepId: factStep.module.id,
          stepLabel: factStep.module.label,
          evidence: factStep.facts.evidence ?? factStep.progress.evidence ?? null,
          nextActionLabel: factStep.progress.nextAction ?? null,
        }
        : null,
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
      chapterProgress: state.chapterProgress ?? null,
      displayState: buildDirectorDisplayState({
        task: state.task,
        projection,
        activeStepNodeKey: state.activeStep?.nodeKey ?? null,
        currentFactStepId: factStep?.module.id ?? null,
        currentFactStepLabel: factStep?.module.label ?? null,
        factStep,
        chapterProgress: state.chapterProgress ?? null,
      }),
      nextActions: buildNextActions({
        taskStatus: state.task.status,
        factNextAction: factStep?.progress.nextAction ?? factStep?.facts.nextAction ?? null,
      }),
    };
    return { snapshot };
  }

  async getTaskFactInspection(taskId: string): Promise<DirectorTaskFactInspectionResponse> {
    const state = await this.stateReader.readByTaskId(taskId);
    if (!state) {
      return { inspection: null };
    }
    const modules = directorWorkflowStepModuleRegistry
      .list()
      .filter(isExecutableWorkflowStepModule);
    const factStep = await resolveFactStepState({
      taskId: state.task.id,
      novelId: state.task.novelId,
      activeStepNodeKey: state.activeStep?.nodeKey ?? null,
    });
    const context = {
      taskId: state.task.id,
      novelId: state.task.novelId,
    };

    const steps = await Promise.all(modules.map(async (module) => {
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
            ratio: progress.ratio,
            label: progress.label,
            nextAction: progress.nextAction ?? null,
            evidence: progress.evidence,
          },
          inspectError: null,
          isCurrentFactStep: factStep?.module.id === module.id,
          isActiveRuntimeStep: state.activeStep?.nodeKey === module.nodeKey,
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
          isCurrentFactStep: false,
          isActiveRuntimeStep: state.activeStep?.nodeKey === module.nodeKey,
        };
      }
    }));

    const inspection: DirectorTaskFactInspection = {
      taskId: state.task.id,
      novelId: state.task.novelId,
      currentFactStepId: factStep?.module.id ?? null,
      currentFactStepLabel: factStep?.module.label ?? null,
      currentFactEvidence: factStep?.facts.evidence ?? factStep?.progress.evidence ?? null,
      steps,
    };
    return { inspection };
  }
}
