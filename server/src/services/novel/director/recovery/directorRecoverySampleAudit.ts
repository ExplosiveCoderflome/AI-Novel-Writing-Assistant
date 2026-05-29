import { createHash } from "node:crypto";

type Nullable<T> = T | null | undefined;

export interface DirectorRecoverySampleTaskRow {
  id: string;
  novelId?: string | null;
  status: string;
  pendingManualRecovery?: boolean | null;
  checkpointType?: string | null;
  currentStage?: string | null;
  currentItemKey?: string | null;
  currentItemLabel?: string | null;
  resumeTargetJson?: string | null;
  seedPayloadJson?: string | null;
  lastError?: string | null;
  updatedAt?: Date | string | null;
}

export interface DirectorRecoverySampleCommandRow {
  id: string;
  taskId: string;
  novelId?: string | null;
  commandType: string;
  status: string;
  payloadJson?: string | null;
  updatedAt?: Date | string | null;
}

export interface DirectorRecoverySampleJobRow {
  id: string;
  novelId?: string | null;
  status: string;
  currentStage?: string | null;
  currentItemLabel?: string | null;
  startOrder?: number | null;
  endOrder?: number | null;
  completedCount?: number | null;
  totalCount?: number | null;
  updatedAt?: Date | string | null;
}

export interface DirectorRecoverySampleArtifactRow {
  id: string;
  novelId: string;
  artifactType: string;
  targetType: string;
  targetId?: string | null;
  version: number;
  status: string;
  source: string;
  contentTable: string;
  contentId: string;
  contentHash?: string | null;
  protectedUserContent?: boolean | null;
  updatedAt?: Date | string | null;
}

export interface DirectorRecoverySampleChapterRow {
  id: string;
  novelId: string;
  order: number;
  title?: string | null;
  content?: string | null;
  updatedAt?: Date | string | null;
}

export interface DirectorRecoverySampleAuditInput {
  tasks: DirectorRecoverySampleTaskRow[];
  commands: DirectorRecoverySampleCommandRow[];
  jobs: DirectorRecoverySampleJobRow[];
  artifacts: DirectorRecoverySampleArtifactRow[];
  chapters: DirectorRecoverySampleChapterRow[];
  draftBaselineArtifacts?: DirectorRecoverySampleArtifactRow[];
  draftChapters?: DirectorRecoverySampleChapterRow[];
}

export interface DirectorRecoverySampleTask {
  id: string;
  novelId: string | null;
  status: string;
  pendingManualRecovery: boolean;
  checkpointType: string | null;
  currentStage: string | null;
  currentItemKey: string | null;
  currentItemLabel: string | null;
  runMode: string | null;
  directorPhase: string | null;
  autoExecutionMode: string | null;
  autoExecutionNext: number | null;
  resumeStage: string | null;
  lastError: string | null;
  updatedAt: string | null;
}

export type DirectorRecoveryDiagnosisCategory =
  | "manual_gate"
  | "runtime_interruption"
  | "historical_compatibility"
  | "external_transport"
  | "implementation_risk";

export interface DirectorRecoverySampleTaskDiagnosis {
  taskId: string;
  novelId: string | null;
  status: string;
  code: string;
  category: DirectorRecoveryDiagnosisCategory;
  priority: "high" | "medium" | "low";
  evidence: string;
  nextAction: string;
  supersededByTaskId?: string | null;
  updatedAt: string | null;
}

export interface DirectorRecoverySampleCommandDiagnosis {
  commandId: string;
  taskId: string;
  novelId: string | null;
  commandType: string;
  status: string;
  code: string;
  priority: "high" | "medium" | "low";
  evidence: string;
  nextAction: string;
  updatedAt: string | null;
}

export interface DirectorRecoverySampleAudit {
  counts: {
    autoDirectorTasks: number;
    takeoverCommands: number;
    confirmCandidateCommands: number;
    titleRepairCommands: number;
    retryOrResumeCommands: number;
    cancelCommands: number;
    failedOrStaleCommands: number;
    recoveryTasks: number;
    chapterBatchTasks: number;
    waitingTasks: number;
    contextlessTakeoverRecoveryTasks: number;
    protectedOrStaleArtifacts: number;
    manualEditCandidates: number;
    manualEditHashChanged: number;
    draftBaselineArtifacts: number;
    untrackedDraftChapters: number;
    generationJobs: number;
    diagnosedTasks: number;
    diagnosedCommands: number;
  };
  samples: {
    takeoverCommands: Array<{
      id: string;
      taskId: string;
      novelId: string | null;
      status: string;
      updatedAt: string | null;
    }>;
    recoveryTasks: DirectorRecoverySampleTask[];
    chapterBatchTasks: DirectorRecoverySampleTask[];
    waitingTasks: DirectorRecoverySampleTask[];
    contextlessTakeoverRecoveryTasks: DirectorRecoverySampleTask[];
    activeOrRecentJobs: Array<{
      id: string;
      novelId: string | null;
      status: string;
      currentStage: string | null;
      currentItemLabel: string | null;
      startOrder: number | null;
      endOrder: number | null;
      completedCount: number | null;
      totalCount: number | null;
      updatedAt: string | null;
    }>;
    manualEditCandidates: Array<{
      artifactId: string;
      novelId: string;
      chapterId: string;
      chapterOrder: number | null;
      chapterTitle: string | null;
      artifactType: string;
      source: string;
      status: string;
      protectedUserContent: boolean | null;
      hashChanged: boolean;
      updatedAt: string | null;
    }>;
    untrackedDraftChapters: Array<{
      novelId: string;
      chapterId: string;
      chapterOrder: number;
      chapterTitle: string | null;
      reason: string;
      updatedAt: string | null;
    }>;
    taskDiagnostics: DirectorRecoverySampleTaskDiagnosis[];
    commandDiagnostics: DirectorRecoverySampleCommandDiagnosis[];
  };
}

function parseJson(value: Nullable<string>): Record<string, unknown> {
  if (!value?.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function iso(value: Nullable<Date | string>): string | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasObjectValue(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableContentHash(value: Nullable<string>): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  return createHash("sha256").update(normalized).digest("hex");
}

function compactTask(task: DirectorRecoverySampleTaskRow): DirectorRecoverySampleTask {
  const seed = parseJson(task.seedPayloadJson);
  const resume = parseJson(task.resumeTargetJson);
  const directorInput = readObject(seed.directorInput);
  const directorSession = readObject(seed.directorSession);
  const autoExecution = readObject(seed.autoExecution);
  const seedResumeTarget = readObject(seed.resumeTarget);
  return {
    id: task.id,
    novelId: task.novelId ?? null,
    status: task.status,
    pendingManualRecovery: task.pendingManualRecovery === true,
    checkpointType: task.checkpointType ?? null,
    currentStage: task.currentStage ?? null,
    currentItemKey: task.currentItemKey ?? null,
    currentItemLabel: task.currentItemLabel ?? null,
    runMode: readString(directorInput.runMode) ?? readString(seed.runMode) ?? readString(directorSession.runMode),
    directorPhase: readString(directorSession.phase),
    autoExecutionMode: readString(autoExecution.mode),
    autoExecutionNext: readNumber(autoExecution.nextChapterOrder),
    resumeStage: readString(resume.stage) ?? readString(seedResumeTarget.stage),
    lastError: task.lastError ? task.lastError.slice(0, 160) : null,
    updatedAt: iso(task.updatedAt),
  };
}

function isRecoveryTask(task: DirectorRecoverySampleTask): boolean {
  return task.pendingManualRecovery || task.status === "failed" || task.status === "cancelled";
}

function isChapterBatchTask(task: DirectorRecoverySampleTask): boolean {
  return task.currentStage === "chapter_execution"
    || task.currentStage === "quality_repair"
    || Boolean(task.autoExecutionMode)
    || task.checkpointType === "chapter_batch_ready"
    || task.checkpointType === "chapter_batch_ready"
    || task.checkpointType === "replan_required";
}

function hasErrorText(task: DirectorRecoverySampleTask, pattern: RegExp): boolean {
  return Boolean(task.lastError && pattern.test(task.lastError));
}

function timeValue(value: string | null): number {
  if (!value) {
    return 0;
  }
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function canSupersedeRecoveryTask(task: DirectorRecoverySampleTask): boolean {
  if (task.pendingManualRecovery) {
    return false;
  }
  return task.status === "queued"
    || task.status === "running"
    || task.status === "waiting_approval"
    || task.status === "succeeded";
}

function isSupersedableRecoveryTask(task: DirectorRecoverySampleTask): boolean {
  return task.status === "failed" || task.status === "cancelled" || task.pendingManualRecovery;
}

function diagnoseTask(
  task: DirectorRecoverySampleTask,
  contextlessTakeoverTaskIds: Set<string>,
  supersedingTasks: Map<string, DirectorRecoverySampleTask>,
): DirectorRecoverySampleTaskDiagnosis | null {
  const supersedingTask = supersedingTasks.get(task.id);
  if (supersedingTask && isSupersedableRecoveryTask(task)) {
    return {
      taskId: task.id,
      novelId: task.novelId,
      status: task.status,
      code: "superseded_by_newer_auto_director_task",
      category: "historical_compatibility",
      priority: "low",
      evidence: `newer ${supersedingTask.status} task ${supersedingTask.id} exists for the same novel`,
      nextAction: "follow the newer auto director task before rerunning this historical task",
      supersededByTaskId: supersedingTask.id,
      updatedAt: task.updatedAt,
    };
  }
  if (contextlessTakeoverTaskIds.has(task.id)) {
    return {
      taskId: task.id,
      novelId: task.novelId,
      status: task.status,
      code: "contextless_takeover_recovery",
      category: "historical_compatibility",
      priority: "high",
      evidence: "takeover command has takeoverRequest but task seed has no directorInput",
      nextAction: "resume with the saved takeover request on the current build",
      updatedAt: task.updatedAt,
    };
  }
  if (
    hasErrorText(task, /directorArtifactDependency\.upsert/)
    || hasErrorText(task, /Foreign key constraint violated/)
  ) {
    return {
      taskId: task.id,
      novelId: task.novelId,
      status: task.status,
      code: "artifact_dependency_fk_failure",
      category: "historical_compatibility",
      priority: "high",
      evidence: "last error points to director artifact dependency persistence",
      nextAction: "rerun recovery on the current build before adding another fix",
      updatedAt: task.updatedAt,
    };
  }
  if (task.status === "waiting_approval") {
    return {
      taskId: task.id,
      novelId: task.novelId,
      status: task.status,
      code: "manual_approval_gate",
      category: "manual_gate",
      priority: "medium",
      evidence: task.checkpointType ?? task.currentItemKey ?? "waiting approval",
      nextAction: "confirm the gate or continue with an explicit resume command",
      updatedAt: task.updatedAt,
    };
  }
  if (task.pendingManualRecovery) {
    return {
      taskId: task.id,
      novelId: task.novelId,
      status: task.status,
      code: "pending_manual_recovery",
      category: "runtime_interruption",
      priority: task.status === "running" ? "high" : "medium",
      evidence: task.lastError ?? "pendingManualRecovery is true",
      nextAction: "enqueue a recovery command and let the worker resume from persisted assets",
      updatedAt: task.updatedAt,
    };
  }
  if (
    hasErrorText(task, /STRUCTURED_OUTPUT/)
    || hasErrorText(task, /Request timed out/i)
    || hasErrorText(task, /transport_error/i)
  ) {
    return {
      taskId: task.id,
      novelId: task.novelId,
      status: task.status,
      code: "llm_transport_failure",
      category: "external_transport",
      priority: "medium",
      evidence: task.lastError ?? "transport failure",
      nextAction: "retry with the current model route or inspect provider stability",
      updatedAt: task.updatedAt,
    };
  }
  if (task.status === "failed" || task.status === "cancelled") {
    return {
      taskId: task.id,
      novelId: task.novelId,
      status: task.status,
      code: "unclassified_recovery_task",
      category: "implementation_risk",
      priority: "medium",
      evidence: task.lastError ?? task.currentItemKey ?? task.status,
      nextAction: "inspect the task state before deciding whether to fix code or resume",
      updatedAt: task.updatedAt,
    };
  }
  return null;
}

function diagnoseCommand(command: DirectorRecoverySampleCommandRow): DirectorRecoverySampleCommandDiagnosis | null {
  if (command.status !== "failed" && command.status !== "stale") {
    return null;
  }
  const base = {
    commandId: command.id,
    taskId: command.taskId,
    novelId: command.novelId ?? null,
    commandType: command.commandType,
    status: command.status,
    updatedAt: iso(command.updatedAt),
  };
  if (command.commandType === "confirm_candidate") {
    return {
      ...base,
      code: "candidate_confirmation_command_needs_recovery",
      priority: "high",
      evidence: "candidate confirmation command did not complete",
      nextAction: "check idempotency result first; if no novel was bound, enqueue confirm_candidate again",
    };
  }
  if (command.commandType === "repair_chapter_titles") {
    return {
      ...base,
      code: "title_repair_failure_isolated",
      priority: "medium",
      evidence: "title repair command failed or became stale",
      nextAction: "keep the director task recoverable and rerun title repair without blocking unrelated chapter execution",
    };
  }
  if (command.commandType === "retry" || command.commandType === "resume_from_checkpoint" || command.commandType === "continue") {
    return {
      ...base,
      code: "recovery_command_failed",
      priority: "medium",
      evidence: `${command.commandType} command did not complete`,
      nextAction: "inspect the latest task checkpoint and enqueue one explicit recovery command",
    };
  }
  if (command.commandType === "takeover") {
    return {
      ...base,
      code: "takeover_command_failed",
      priority: "high",
      evidence: "takeover command did not complete",
      nextAction: "verify takeoverRequest payload and rerun takeover on the current build",
    };
  }
  return {
    ...base,
    code: "unclassified_command_failure",
    priority: "low",
    evidence: `${command.commandType} command is ${command.status}`,
    nextAction: "inspect command payload and task state before rerunning",
  };
}

export function buildDirectorRecoverySampleAudit(
  input: DirectorRecoverySampleAuditInput,
): DirectorRecoverySampleAudit {
  const tasks = input.tasks.map(compactTask);
  const takeoverCommands = input.commands.filter((command) => command.commandType === "takeover");
  const confirmCandidateCommands = input.commands.filter((command) => command.commandType === "confirm_candidate");
  const titleRepairCommands = input.commands.filter((command) => command.commandType === "repair_chapter_titles");
  const retryOrResumeCommands = input.commands.filter((command) => (
    command.commandType === "retry"
    || command.commandType === "resume_from_checkpoint"
    || command.commandType === "continue"
  ));
  const cancelCommands = input.commands.filter((command) => command.commandType === "cancel");
  const failedOrStaleCommands = input.commands.filter((command) => command.status === "failed" || command.status === "stale");
  const recoveryTasks = tasks.filter(isRecoveryTask);
  const chapterBatchTasks = tasks.filter(isChapterBatchTask);
  const waitingTasks = tasks.filter((task) => task.status === "waiting_approval");
  const takeoverRequestTaskIds = new Set(
    input.commands
      .filter((command) => command.commandType === "takeover")
      .filter((command) => hasObjectValue(parseJson(command.payloadJson).takeoverRequest))
      .map((command) => command.taskId),
  );
  const contextlessTakeoverTaskIds = new Set(
    input.tasks
      .filter((task) => takeoverRequestTaskIds.has(task.id))
      .filter((task) => !hasObjectValue(parseJson(task.seedPayloadJson).directorInput))
      .map((task) => task.id),
  );
  const contextlessTakeoverRecoveryTasks = tasks.filter((task) => contextlessTakeoverTaskIds.has(task.id));
  const supersedingTasks = new Map<string, DirectorRecoverySampleTask>();
  const tasksByNovelId = new Map<string, DirectorRecoverySampleTask[]>();
  for (const task of tasks) {
    if (!task.novelId) {
      continue;
    }
    tasksByNovelId.set(task.novelId, [...(tasksByNovelId.get(task.novelId) ?? []), task]);
  }
  for (const task of tasks) {
    if (!task.novelId || !isSupersedableRecoveryTask(task)) {
      continue;
    }
    const newerTask = (tasksByNovelId.get(task.novelId) ?? [])
      .filter((candidate) => candidate.id !== task.id)
      .filter(canSupersedeRecoveryTask)
      .filter((candidate) => timeValue(candidate.updatedAt) > timeValue(task.updatedAt))
      .sort((left, right) => timeValue(right.updatedAt) - timeValue(left.updatedAt))[0];
    if (newerTask) {
      supersedingTasks.set(task.id, newerTask);
    }
  }
  const taskDiagnostics = tasks
    .map((task) => diagnoseTask(task, contextlessTakeoverTaskIds, supersedingTasks))
    .filter((diagnosis): diagnosis is DirectorRecoverySampleTaskDiagnosis => Boolean(diagnosis))
    .sort((left, right) => {
      const priorityRank = { high: 0, medium: 1, low: 2 };
      return priorityRank[left.priority] - priorityRank[right.priority]
      || String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""));
    });
  const commandDiagnostics = input.commands
    .map(diagnoseCommand)
    .filter((diagnosis): diagnosis is DirectorRecoverySampleCommandDiagnosis => Boolean(diagnosis))
    .sort((left, right) => {
      const priorityRank = { high: 0, medium: 1, low: 2 };
      return priorityRank[left.priority] - priorityRank[right.priority]
        || String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""));
    });
  const chapterById = new Map(input.chapters.map((chapter) => [chapter.id, chapter]));
  const manualEditCandidates = input.artifacts
    .filter((artifact) => artifact.contentTable === "Chapter" && artifact.contentId)
    .map((artifact) => {
      const chapter = chapterById.get(artifact.contentId);
      const currentHash = stableContentHash(chapter?.content);
      return {
        artifactId: artifact.id,
        novelId: artifact.novelId,
        chapterId: artifact.contentId,
        chapterOrder: chapter?.order ?? null,
        chapterTitle: chapter?.title ?? null,
        artifactType: artifact.artifactType,
        source: artifact.source,
        status: artifact.status,
        protectedUserContent: artifact.protectedUserContent ?? null,
        hashChanged: Boolean(artifact.contentHash && currentHash && artifact.contentHash !== currentHash),
        updatedAt: iso(artifact.updatedAt),
      };
    });
  const draftBaselineArtifacts = input.draftBaselineArtifacts ?? input.artifacts;
  const trackedDraftChapterIds = new Set(
    draftBaselineArtifacts
      .filter((artifact) => artifact.artifactType === "chapter_draft" && artifact.contentTable === "Chapter")
      .map((artifact) => artifact.contentId),
  );
  const untrackedDraftChapters = (input.draftChapters ?? [])
    .filter((chapter) => chapter.content?.trim() && !trackedDraftChapterIds.has(chapter.id))
    .map((chapter) => ({
      novelId: chapter.novelId,
      chapterId: chapter.id,
      chapterOrder: chapter.order,
      chapterTitle: chapter.title ?? null,
      reason: "chapter_draft ledger baseline is missing",
      updatedAt: iso(chapter.updatedAt),
    }));

  return {
    counts: {
      autoDirectorTasks: tasks.length,
      takeoverCommands: takeoverCommands.length,
      confirmCandidateCommands: confirmCandidateCommands.length,
      titleRepairCommands: titleRepairCommands.length,
      retryOrResumeCommands: retryOrResumeCommands.length,
      cancelCommands: cancelCommands.length,
      failedOrStaleCommands: failedOrStaleCommands.length,
      recoveryTasks: recoveryTasks.length,
      chapterBatchTasks: chapterBatchTasks.length,
      waitingTasks: waitingTasks.length,
      contextlessTakeoverRecoveryTasks: contextlessTakeoverRecoveryTasks.length,
      protectedOrStaleArtifacts: input.artifacts.length,
      manualEditCandidates: manualEditCandidates.length,
      manualEditHashChanged: manualEditCandidates.filter((candidate) => candidate.hashChanged).length,
      draftBaselineArtifacts: draftBaselineArtifacts.length,
      untrackedDraftChapters: untrackedDraftChapters.length,
      generationJobs: input.jobs.length,
      diagnosedTasks: taskDiagnostics.length,
      diagnosedCommands: commandDiagnostics.length,
    },
    samples: {
      takeoverCommands: takeoverCommands.slice(0, 5).map((command) => ({
        id: command.id,
        taskId: command.taskId,
        novelId: command.novelId ?? null,
        status: command.status,
        updatedAt: iso(command.updatedAt),
      })),
      recoveryTasks: recoveryTasks.slice(0, 8),
      chapterBatchTasks: chapterBatchTasks.slice(0, 8),
      waitingTasks: waitingTasks.slice(0, 8),
      contextlessTakeoverRecoveryTasks: contextlessTakeoverRecoveryTasks.slice(0, 8),
      activeOrRecentJobs: input.jobs.slice(0, 8).map((job) => ({
        id: job.id,
        novelId: job.novelId ?? null,
        status: job.status,
        currentStage: job.currentStage ?? null,
        currentItemLabel: job.currentItemLabel ?? null,
        startOrder: job.startOrder ?? null,
        endOrder: job.endOrder ?? null,
        completedCount: job.completedCount ?? null,
        totalCount: job.totalCount ?? null,
        updatedAt: iso(job.updatedAt),
      })),
      manualEditCandidates: manualEditCandidates.slice(0, 12),
      untrackedDraftChapters: untrackedDraftChapters.slice(0, 12),
      taskDiagnostics: taskDiagnostics.slice(0, 12),
      commandDiagnostics: commandDiagnostics.slice(0, 12),
    },
  };
}

