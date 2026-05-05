import { AppError } from "../../../middleware/errorHandler";
import { NovelWorkflowService } from "../workflow/NovelWorkflowService";
import { parseSeedPayload } from "../workflow/novelWorkflow.shared";
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
    if (
      pipelineCommand.intent === "continue"
      || pipelineCommand.intent === "resume_from_checkpoint"
      || pipelineCommand.intent === "retry"
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
}
