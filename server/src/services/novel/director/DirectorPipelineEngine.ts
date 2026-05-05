import { AppError } from "../../../middleware/errorHandler";
import { prisma } from "../../../db/prisma";
import { NovelWorkflowService } from "../workflow/NovelWorkflowService";
import { mergeSeedPayload, parseSeedPayload } from "../workflow/novelWorkflow.shared";
import { DirectorCommandInterpreter } from "./DirectorCommandInterpreter";
import type { DirectorRunCommandRow } from "./DirectorCommandService";
import { DirectorCommandService } from "./DirectorCommandService";
import type { DirectorCommandPayload } from "./DirectorCommandServiceHelpers";
import { DirectorStateCommitter } from "./DirectorStateCommitter";
import { DirectorStateReader } from "./DirectorStateReader";
import { NovelDirectorService } from "./NovelDirectorService";
import {
  getDirectorInputFromSeedPayload,
  type DirectorWorkflowSeedPayload,
} from "./novelDirectorHelpers";
import type { DirectorTakeoverRequest } from "@ai-novel/shared/types/novelDirector";

export type DirectorCommandExecutionOutcome = "completed" | "cancelled";

export interface DirectorPipelineDispatchInput {
  command: NonNullable<DirectorRunCommandRow>;
  payload: DirectorCommandPayload;
}

export class DirectorPipelineEngine {
  private readonly directorService: NovelDirectorService;
  private readonly workflowService: NovelWorkflowService;
  private readonly commandService: DirectorCommandService;
  private readonly interpreter: DirectorCommandInterpreter;
  private readonly stateReader: DirectorStateReader;
  private readonly stateCommitter: DirectorStateCommitter;

  constructor(deps: {
    directorService?: NovelDirectorService;
    workflowService?: NovelWorkflowService;
    commandService?: DirectorCommandService;
    interpreter?: DirectorCommandInterpreter;
    stateReader?: DirectorStateReader;
    stateCommitter?: DirectorStateCommitter;
  } = {}) {
    this.directorService = deps.directorService ?? new NovelDirectorService({ backgroundRunMode: "inline" });
    this.workflowService = deps.workflowService ?? new NovelWorkflowService();
    this.commandService = deps.commandService ?? new DirectorCommandService(this.workflowService);
    this.interpreter = deps.interpreter ?? new DirectorCommandInterpreter();
    this.stateReader = deps.stateReader ?? new DirectorStateReader();
    this.stateCommitter = deps.stateCommitter ?? new DirectorStateCommitter();
  }

  async dispatch(input: DirectorPipelineDispatchInput): Promise<DirectorCommandExecutionOutcome> {
    const pipelineCommand = this.interpreter.interpret(input.command, input.payload);
    const state = await this.stateReader.readByTaskId(pipelineCommand.taskId);
    if (!state) {
      throw new AppError("Director workflow task not found.", 404);
    }
    await this.stateCommitter.recordPipelineDispatch({
      taskId: pipelineCommand.taskId,
      novelId: pipelineCommand.novelId ?? state.task.novelId,
      runtimeId: state.runtime?.id ?? null,
      commandType: pipelineCommand.intent,
      summary: "导演任务已进入统一执行管线。",
    });

    if (pipelineCommand.intent === "cancel") {
      await this.workflowService.cancelTask(pipelineCommand.taskId);
      return "cancelled";
    }
    if (pipelineCommand.intent === "generate_candidates") {
      const request = pipelineCommand.payload.candidatesRequest;
      if (!request) {
        throw new AppError("Director candidate generation payload is missing.", 400);
      }
      const result = await this.directorService.generateCandidates({
        ...request,
        workflowTaskId: pipelineCommand.taskId,
      });
      await this.recordCommandResult(pipelineCommand.taskId, pipelineCommand.id, result, {
        batches: [result.batch],
        candidateStage: null,
      }, true);
      return this.resolveCommandOutcome(pipelineCommand.taskId);
    }
    if (pipelineCommand.intent === "refine_candidates") {
      const request = pipelineCommand.payload.refinementRequest;
      if (!request) {
        throw new AppError("Director candidate refinement payload is missing.", 400);
      }
      const result = await this.directorService.refineCandidates({
        ...request,
        workflowTaskId: pipelineCommand.taskId,
      });
      await this.recordCommandResult(pipelineCommand.taskId, pipelineCommand.id, result, {
        batches: request.previousBatches.concat(result.batch),
        candidateStage: null,
      }, true);
      return this.resolveCommandOutcome(pipelineCommand.taskId);
    }
    if (pipelineCommand.intent === "patch_candidate") {
      const request = pipelineCommand.payload.candidatePatchRequest;
      if (!request) {
        throw new AppError("Director candidate patch payload is missing.", 400);
      }
      const result = await this.directorService.patchCandidate({
        ...request,
        workflowTaskId: pipelineCommand.taskId,
      });
      const nextBatches = request.previousBatches.some((batch) => batch.id === result.batch.id)
        ? request.previousBatches.map((batch) => (batch.id === result.batch.id ? result.batch : batch))
        : request.previousBatches.concat(result.batch);
      await this.recordCommandResult(pipelineCommand.taskId, pipelineCommand.id, result, {
        batches: nextBatches,
        candidateStage: null,
      }, true);
      return this.resolveCommandOutcome(pipelineCommand.taskId);
    }
    if (pipelineCommand.intent === "refine_titles") {
      const request = pipelineCommand.payload.titleRefineRequest;
      if (!request) {
        throw new AppError("Director title refinement payload is missing.", 400);
      }
      const result = await this.directorService.refineCandidateTitleOptions({
        ...request,
        workflowTaskId: pipelineCommand.taskId,
      });
      const nextBatches = request.previousBatches.some((batch) => batch.id === result.batch.id)
        ? request.previousBatches.map((batch) => (batch.id === result.batch.id ? result.batch : batch))
        : request.previousBatches.concat(result.batch);
      await this.recordCommandResult(pipelineCommand.taskId, pipelineCommand.id, result, {
        batches: nextBatches,
        candidateStage: null,
      }, true);
      return this.resolveCommandOutcome(pipelineCommand.taskId);
    }
    if (pipelineCommand.intent === "confirm_candidate") {
      if (!pipelineCommand.payload.confirmRequest) {
        throw new AppError("Director confirm command payload is missing.", 400);
      }
      await this.directorService.confirmCandidate({
        ...pipelineCommand.payload.confirmRequest,
        workflowTaskId: pipelineCommand.taskId,
      });
      return this.resolveCommandOutcome(pipelineCommand.taskId);
    }
    if (pipelineCommand.intent === "takeover") {
      const request = pipelineCommand.takeoverRequest;
      if (!request) {
        throw new AppError("Director takeover command payload is missing.", 400);
      }
      await this.directorService.startTakeover(request, {
        workflowTaskId: pipelineCommand.taskId,
      });
      return this.resolveCommandOutcome(pipelineCommand.taskId);
    }
    if (pipelineCommand.intent === "repair_chapter_titles") {
      await this.directorService.executeChapterTitleRepair(pipelineCommand.taskId, {
        volumeId: pipelineCommand.payload.volumeId,
      });
      return this.resolveCommandOutcome(pipelineCommand.taskId);
    }
    if (pipelineCommand.intent === "policy_update") {
      const request = pipelineCommand.payload.policyUpdateRequest;
      if (!request) {
        throw new AppError("Director policy update payload is missing.", 400);
      }
      const snapshot = await this.directorService.updateRuntimePolicy(pipelineCommand.taskId, {
        mode: request.mode,
        patch: {
          mayOverwriteUserContent: request.mayOverwriteUserContent,
          allowExpensiveReview: request.allowExpensiveReview,
          modelTier: request.modelTier,
        },
      });
      await this.recordCommandResult(pipelineCommand.taskId, pipelineCommand.id, { snapshot });
      return this.resolveCommandOutcome(pipelineCommand.taskId);
    }
    if (pipelineCommand.intent === "workspace_analysis") {
      const request = pipelineCommand.payload.workspaceAnalysisRequest;
      if (!request?.novelId) {
        throw new AppError("Director workspace analysis payload is missing.", 400);
      }
      const analysis = await this.directorService.analyzeRuntimeWorkspace(request.novelId, {
        workflowTaskId: request.workflowTaskId ?? pipelineCommand.taskId,
        includeAiInterpretation: request.includeAiInterpretation,
      });
      await this.recordCommandResult(pipelineCommand.taskId, pipelineCommand.id, { analysis });
      return this.resolveCommandOutcome(pipelineCommand.taskId);
    }
    if (pipelineCommand.intent === "manual_edit_impact") {
      const request = pipelineCommand.payload.manualEditImpactRequest;
      if (!request?.novelId) {
        throw new AppError("Director manual edit impact payload is missing.", 400);
      }
      const impact = await this.directorService.evaluateManualEditImpact(request.novelId, {
        workflowTaskId: request.workflowTaskId ?? pipelineCommand.taskId,
        chapterId: request.chapterId,
        includeAiInterpretation: request.includeAiInterpretation,
      });
      await this.recordCommandResult(pipelineCommand.taskId, pipelineCommand.id, { impact });
      return this.resolveCommandOutcome(pipelineCommand.taskId);
    }
    if (
      pipelineCommand.intent === "continue"
      || pipelineCommand.intent === "resume_from_checkpoint"
      || pipelineCommand.intent === "retry"
      || pipelineCommand.intent === "approve_gate"
    ) {
      const takeoverRequest = await this.resolveContextlessTakeoverRecovery(pipelineCommand.taskId);
      if (takeoverRequest) {
        await this.directorService.startTakeover(takeoverRequest, {
          workflowTaskId: pipelineCommand.taskId,
        });
        return this.resolveCommandOutcome(pipelineCommand.taskId);
      }
      await this.directorService.executeContinueTask(pipelineCommand.taskId, {
        ...pipelineCommand.payload,
        continuationMode: pipelineCommand.intent === "approve_gate" ? "resume" : pipelineCommand.payload.continuationMode,
        forceResume: true,
      });
      return this.resolveCommandOutcome(pipelineCommand.taskId);
    }
    throw new AppError(`Unsupported director command type: ${pipelineCommand.intent}`, 400);
  }

  async selectNextStep(taskId: string): Promise<string | null> {
    const state = await this.stateReader.readByTaskId(taskId);
    return state?.activeStep?.nodeKey ?? state?.runtime?.currentStep ?? state?.task.currentItemKey ?? null;
  }

  async runOneStep(_stepId: string, input: DirectorPipelineDispatchInput): Promise<DirectorCommandExecutionOutcome> {
    return this.dispatch(input);
  }

  async runUntilGateOrBudget(input: DirectorPipelineDispatchInput): Promise<DirectorCommandExecutionOutcome> {
    return this.dispatch(input);
  }

  private async resolveCommandOutcome(taskId: string): Promise<DirectorCommandExecutionOutcome> {
    const row = await this.workflowService.getTaskByIdWithoutHealing(taskId).catch(() => null);
    return row?.status === "cancelled" || row?.cancelRequestedAt ? "cancelled" : "completed";
  }

  private async resolveContextlessTakeoverRecovery(taskId: string): Promise<DirectorTakeoverRequest | null> {
    const row = await this.workflowService.getTaskByIdWithoutHealing(taskId);
    const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(row?.seedPayloadJson) ?? {};
    if (getDirectorInputFromSeedPayload(seedPayload)) {
      return null;
    }
    return this.commandService.getLatestTakeoverRequestForTask(taskId);
  }

  private async recordCommandResult(
    taskId: string,
    commandId: string,
    result: unknown,
    seedPatch: Record<string, unknown> = {},
    candidateSelectionReady = false,
  ): Promise<void> {
    const row = await prisma.novelWorkflowTask.findUnique({
      where: { id: taskId },
      select: { seedPayloadJson: true },
    }).catch(() => null);
    if (!row) {
      return;
    }
    const current = parseSeedPayload<{ directorCommandResults?: Record<string, unknown> }>(row.seedPayloadJson) ?? {};
    const directorCommandResults = {
      ...(current.directorCommandResults ?? {}),
      [commandId]: {
        result,
        completedAt: new Date().toISOString(),
      },
    };
    await prisma.novelWorkflowTask.update({
      where: { id: taskId },
      data: {
        ...(candidateSelectionReady
          ? {
              status: "waiting_approval",
              currentStage: "AI 自动导演",
              currentItemKey: "candidate_selection_required",
              currentItemLabel: "书级方向已准备好，请选择一套继续",
              progress: 0.18,
              checkpointType: "candidate_selection_required",
              checkpointSummary: "AI 已生成可选的书级方向。",
            }
          : {}),
        seedPayloadJson: mergeSeedPayload(row.seedPayloadJson, {
          ...seedPatch,
          directorCommandResults,
        }),
        heartbeatAt: new Date(),
      },
    }).catch(() => null);
  }
}
