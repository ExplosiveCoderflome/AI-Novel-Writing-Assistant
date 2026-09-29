import { prisma } from "../../../../db/prisma";
import { parseSeedPayload } from "../../workflow/novelWorkflow.shared";
import { parseResumeTarget } from "../../workflow/novelWorkflow.shared";
import type { CreativeCarryoverContract } from "@ai-novel/shared/types/creativeCarryoverContract";
import type { DirectorIssuePolicy } from "@ai-novel/shared/types/directorIssue";
import type { DirectorCompletionProfile } from "@ai-novel/shared/types/directorCompletion";
import type {
  DirectorAutoExecutionPlan,
  DirectorAutoExecutionState,
  DirectorCandidate,
  DirectorCandidateBatch,
  DirectorConfirmRequest,
  DirectorLLMOptions,
  DirectorRunMode,
  DirectorSessionState,
  DirectorTaskNotice,
} from "@ai-novel/shared/types/novelDirector";
import type { NovelProductionExperience, NovelWorkflowResumeTarget } from "@ai-novel/shared/types/novelWorkflow";
import type { DirectorAutoApprovalConfig } from "@ai-novel/shared/types/autoDirectorApproval";
import { buildFullDirectorAutoApprovalConfig } from "@ai-novel/shared/types/autoDirectorApproval";
import { buildFullBookAutopilotExecutionPlan } from "@ai-novel/shared/types/novelDirector";
import { ChapterExecutionProgressInspector, type ChapterExecutionProgressSummary } from "../runtime/ChapterExecutionProgressInspector";

const LAUNCH_FIELDS = [
  "directorInput",
  "runMode",
  "autoExecutionPlan",
  "autoApproval",
  "issueGovernanceVersion",
  "issuePolicy",
  "issuePolicySource",
  "completionProfile",
  "startupPreparation",
  "provider",
  "model",
  "temperature",
  "creativeCarryoverContract",
] as const;

const RUN_FIELDS = [
  "directorSession",
  "autoExecution",
  "taskNotice",
  "stepReview",
  "candidateStage",
  "batches",
  "candidate",
  "productionExperience",
  "batch",
  "directorCommandResults",
  "takeover",
  "llmOverride",
  "stepCalibration",
] as const;

const LEGACY_READ_ONLY_FIELDS = ["directorRuntime"] as const;

export interface DirectorTaskLaunchState {
  directorInput?: DirectorConfirmRequest;
  runMode?: DirectorRunMode;
  autoExecutionPlan?: DirectorAutoExecutionPlan;
  autoApproval?: DirectorAutoApprovalConfig | null;
  issueGovernanceVersion?: 1;
  issuePolicy?: DirectorIssuePolicy;
  issuePolicySource?: "global" | "novel";
  completionProfile?: DirectorCompletionProfile;
  startupPreparation?: DirectorConfirmRequest["startupPreparation"];
  provider?: DirectorLLMOptions["provider"] | null;
  model?: string | null;
  temperature?: number | null;
  creativeCarryoverContract?: CreativeCarryoverContract | null;
  legacyContext: Record<string, unknown>;
}

export interface DirectorTaskRunState {
  directorSession?: DirectorSessionState;
  autoExecution?: DirectorAutoExecutionState;
  taskNotice?: DirectorTaskNotice | null;
  stepReview?: {
    stepId: string;
    nodeKey: string;
    label: string;
    targetType: string;
    targetId?: string | null;
    completedAt: string;
  } | null;
  candidateStage?: Record<string, unknown> | null;
  batches?: DirectorCandidateBatch[];
  candidate?: DirectorCandidate;
  productionExperience?: NovelProductionExperience | null;
  batch?: { id?: string; round?: number };
  resumeTarget?: NovelWorkflowResumeTarget | null;
  directorCommandResults?: Record<string, unknown>;
  takeover?: Record<string, unknown>;
  llmOverride?: Pick<DirectorLLMOptions, "provider" | "model" | "temperature"> | null;
  stepCalibration?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DirectorTaskState {
  launch: DirectorTaskLaunchState;
  run: DirectorTaskRunState;
}

export type DirectorTaskDataView = Record<string, unknown>;


export interface DirectorTaskStateRow {
  seedPayloadJson?: string | null;
  resumeTargetJson?: string | null;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseLegacyResumeTarget(value: unknown): NovelWorkflowResumeTarget | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as NovelWorkflowResumeTarget
    : null;
}

export function splitDirectorTaskState(
  persisted: Record<string, unknown>,
  resumeTarget?: NovelWorkflowResumeTarget | null,
): DirectorTaskState {
  const launch = {} as DirectorTaskLaunchState;
  const run = {} as DirectorTaskRunState;
  const consumed = new Set<string>([...LAUNCH_FIELDS, ...RUN_FIELDS, ...LEGACY_READ_ONLY_FIELDS, "resumeTarget"]);

  for (const key of LAUNCH_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(persisted, key)) {
      (launch as unknown as Record<string, unknown>)[key] = persisted[key];
    }
  }
  for (const key of RUN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(persisted, key)) {
      (run as Record<string, unknown>)[key] = persisted[key];
    }
  }
  for (const key of LEGACY_READ_ONLY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(persisted, key)) {
      (run as Record<string, unknown>)[key] = persisted[key];
    }
  }
  launch.legacyContext = Object.fromEntries(
    Object.entries(persisted).filter(([key]) => !consumed.has(key)),
  );
  run.resumeTarget = resumeTarget ?? parseLegacyResumeTarget(persisted.resumeTarget);

  return { launch, run };
}

export function readDirectorTaskState(row: DirectorTaskStateRow): DirectorTaskState {
  return splitDirectorTaskState(
    asObject(parseSeedPayload<Record<string, unknown>>(row.seedPayloadJson)),
    parseResumeTarget(row.resumeTargetJson),
  );
}

export function serializeDirectorTaskState(state: DirectorTaskState): string {
  const launch = state.launch as DirectorTaskLaunchState & Record<string, unknown>;
  const run = state.run;
  const persisted: Record<string, unknown> = {
    ...launch.legacyContext,
  };
  for (const key of LAUNCH_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(launch, key)) {
      persisted[key] = launch[key];
    }
  }
  for (const key of RUN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(run, key)) {
      persisted[key] = run[key];
    }
  }
  return JSON.stringify(persisted);
}

/** Compatibility projection for business rules that have not yet moved to direct launch/run access. */
export function toDirectorTaskDataView(state: DirectorTaskState): DirectorTaskDataView {
  const { legacyContext, ...launchFields } = state.launch;
  const view: DirectorTaskDataView = {
    ...legacyContext,
    ...launchFields,
    ...state.run,
  };
  if (state.run.productionExperience === "simple" || state.run.productionExperience === "professional") {
    const runMode = "full_book_autopilot" satisfies DirectorRunMode;
    const autoExecutionPlan = buildFullBookAutopilotExecutionPlan();
    const autoApproval = buildFullDirectorAutoApprovalConfig();
    view.runMode = runMode;
    view.autoExecutionPlan = autoExecutionPlan;
    view.autoApproval = autoApproval;
    const directorInput = view.directorInput;
    if (directorInput && typeof directorInput === "object" && !Array.isArray(directorInput)) {
      view.directorInput = {
        ...(directorInput as Record<string, unknown>),
        runMode,
        autoExecutionPlan,
        autoApproval,
      };
    }
  }
  const calibrationInstruction = state.run.stepCalibration?.instruction;
  const directorInput = view.directorInput;
  if (typeof calibrationInstruction === "string" && calibrationInstruction.trim()
    && directorInput && typeof directorInput === "object" && !Array.isArray(directorInput)) {
    view.directorInput = {
      ...(directorInput as Record<string, unknown>),
      stepCalibrationInstruction: calibrationInstruction,
    };
  }
  return view;
}

export function mergeDirectorTaskRunState(
  current: DirectorTaskRunState,
  patch: Partial<DirectorTaskRunState>,
): DirectorTaskRunState {
  const allowed = new Set<string>(RUN_FIELDS);
  const invalidField = Object.keys(patch).find((key) => !allowed.has(key));
  if (invalidField) {
    throw new Error(`Director run state cannot update ${invalidField}.`);
  }
  return { ...current, ...patch };
}

export interface DirectorCanonicalState {
  task: {
    id: string;
    novelId: string | null;
    lane: string;
    status: string;
    currentStage?: string | null;
    currentItemKey?: string | null;
    currentItemLabel?: string | null;
    progress?: number | null;
    checkpointType?: string | null;
    checkpointSummary?: string | null;
    lastError?: string | null;
    pendingManualRecovery?: boolean | null;
    cancelRequestedAt?: Date | null;
  };
  directorRun: {
    id: string;
    novelId: string | null;
    entrypoint?: string | null;
  } | null;
  runtime: {
    id: string;
    status: string;
    currentStep?: string | null;
    runId?: string | null;
  } | null;
  latestCommand: {
    id: string;
    commandType: string;
    status: string;
  } | null;
  activeStep: {
    idempotencyKey: string;
    nodeKey: string;
    label: string;
    status: string;
  } | null;
  launch: DirectorTaskLaunchState;
  run: DirectorTaskRunState;
  chapterProgress: ChapterExecutionProgressSummary | null;
}

function shouldSuppressRuntimeActiveStep(task: {
  status: string;
  checkpointType?: string | null;
}): boolean {
  return task.status === "waiting_approval" && Boolean(task.checkpointType);
}

export class DirectorStateReader {
  constructor(
    private readonly chapterProgressInspector = new ChapterExecutionProgressInspector(),
  ) {}

  async readLatestByNovelId(novelId: string): Promise<DirectorCanonicalState | null> {
    const latestTask = await prisma.novelWorkflowTask.findFirst({
      where: {
        novelId,
        lane: "auto_director",
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });
    if (!latestTask?.id) {
      return null;
    }
    return this.readByTaskId(latestTask.id);
  }

  async readByTaskId(taskId: string): Promise<DirectorCanonicalState | null> {
    const task = await prisma.novelWorkflowTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        novelId: true,
        lane: true,
        status: true,
        currentStage: true,
        currentItemKey: true,
        currentItemLabel: true,
        progress: true,
        checkpointType: true,
        checkpointSummary: true,
        lastError: true,
        pendingManualRecovery: true,
        cancelRequestedAt: true,
        seedPayloadJson: true,
        resumeTargetJson: true,
      },
    });
    if (!task) {
      return null;
    }
    const [run, latestCommand, activeStep] = await Promise.all([
      prisma.directorRun.findUnique({
        where: { taskId },
        select: { id: true, novelId: true, entrypoint: true },
      }).catch(() => null),
      prisma.directorRunCommand.findFirst({
        where: { taskId },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: { id: true, commandType: true, status: true },
      }).catch(() => null),
      prisma.directorStepRun.findFirst({
        where: { taskId, status: { in: ["running", "waiting_approval", "blocked_scope"] } },
        orderBy: [{ updatedAt: "desc" }, { startedAt: "desc" }],
        select: { idempotencyKey: true, nodeKey: true, label: true, status: true },
      }).catch(() => null),
    ]);
    const suppressActiveStep = shouldSuppressRuntimeActiveStep(task);
    const effectiveActiveStep = suppressActiveStep ? null : activeStep;
    const chapterProgress = task.novelId
      ? await this.chapterProgressInspector.inspectNovel(task.novelId).catch(() => null)
      : null;
    return {
      task: {
        id: task.id,
        novelId: task.novelId,
        lane: task.lane,
        status: task.status,
        currentStage: task.currentStage,
        currentItemKey: task.currentItemKey,
        currentItemLabel: task.currentItemLabel,
        progress: task.progress,
        checkpointType: task.checkpointType,
        checkpointSummary: task.checkpointSummary,
        lastError: task.lastError,
        pendingManualRecovery: task.pendingManualRecovery,
        cancelRequestedAt: task.cancelRequestedAt,
      },
      directorRun: run,
      runtime: run
        ? {
          id: run.id,
          status: effectiveActiveStep?.status ?? (suppressActiveStep ? task.status : latestCommand?.status) ?? "idle",
          currentStep: effectiveActiveStep?.nodeKey ?? task.currentItemKey ?? null,
          runId: run.id,
        }
        : null,
      latestCommand,
      activeStep: effectiveActiveStep,
      ...readDirectorTaskState(task),
      chapterProgress,
    };
  }

  async readTaskStateById(taskId: string): Promise<DirectorTaskState | null> {
    const row = await prisma.novelWorkflowTask.findUnique({
      where: { id: taskId },
      select: { seedPayloadJson: true, resumeTargetJson: true },
    });
    return row ? readDirectorTaskState(row) : null;
  }

  async readTaskDataById(taskId: string): Promise<DirectorTaskDataView | null> {
    const state = await this.readTaskStateById(taskId);
    return state ? toDirectorTaskDataView(state) : null;
  }
}
