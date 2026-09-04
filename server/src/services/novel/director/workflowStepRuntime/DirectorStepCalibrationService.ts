import type { DirectorStepCalibrationRequest } from "@ai-novel/shared/types/novelDirector";
import { AppError } from "../../../../middleware/errorHandler";
import type { getSharedNovelServices } from "../../application/sharedNovelServices";
import { NovelWorkflowService } from "../../workflow/NovelWorkflowService";
import { buildDirectorWorkflowSeedPayload, getDirectorInputFromSeedPayload } from "../runtime/novelDirectorHelpers";
import type { DirectorWorkflowSeedPayload } from "../runtime/novelDirectorHelpers";
import type { NovelDirectorRuntimeOrchestrator } from "../runtime/novelDirectorRuntimeOrchestrator";
import { parseSeedPayload } from "../../workflow/novelWorkflow.shared";
import { directorWorkflowStepModuleRegistry } from "./directorWorkflowStepModules";
import { inspectWorkflowStepFacts, isExecutableWorkflowStepModule } from "./WorkflowStepModule";

type SharedNovelServices = ReturnType<typeof getSharedNovelServices>;

export class DirectorStepCalibrationService {
  constructor(
    private readonly workflowService: NovelWorkflowService,
    private readonly novelService: Pick<SharedNovelServices, "createNovelSnapshot">,
    private readonly runtimeOrchestrator: Pick<NovelDirectorRuntimeOrchestrator, "runStepModule">,
  ) {}

  async calibrate(taskId: string, input: DirectorStepCalibrationRequest): Promise<unknown> {
    const task = await this.workflowService.getTaskById(taskId);
    if (!task?.novelId) throw new AppError("步骤校准需要关联到小说导演任务。", 404);
    const module = directorWorkflowStepModuleRegistry.maybeGet(input.stepId.trim());
    if (!module || !isExecutableWorkflowStepModule(module)) {
      throw new AppError(`不支持校准导演步骤：${input.stepId}`, 400);
    }
    const context = {
      taskId,
      novelId: task.novelId,
      targetType: module.targetType,
      targetId: input.targetId?.trim() || task.novelId,
    };
    if (input.action === "validate") {
      return { action: input.action, stepId: module.id, inspection: await inspectWorkflowStepFacts(module, context) };
    }

    const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(task.seedPayloadJson) ?? {};
    const directorInput = getDirectorInputFromSeedPayload(seedPayload);
    if (!directorInput) {
      throw new AppError("当前导演任务缺少可复用的生成输入，请从项目接管入口继续。", 409);
    }
    const instruction = input.instruction?.trim() || null;
    const calibratedDirectorInput = instruction
      ? { ...directorInput, stepCalibrationInstruction: instruction }
      : directorInput;
    if (input.action === "regenerate") {
      await this.novelService.createNovelSnapshot(
        task.novelId,
        "before_pipeline",
        `before-step-calibration-${module.id}-${Date.now()}`,
      );
    }
    await this.workflowService.bootstrapTask({
      workflowTaskId: taskId,
      novelId: task.novelId,
      lane: "auto_director",
      seedPayload: {
        directorInput: calibratedDirectorInput,
        stepCalibration: { action: input.action, stepId: module.id, instruction, updatedAt: new Date().toISOString() },
      },
    });
    await this.runtimeOrchestrator.runStepModule({
      module,
      taskId,
      novelId: task.novelId,
      targetId: input.targetId?.trim() || task.novelId,
      approveCurrentGate: false,
      approveAutoExecutionScope: false,
      reuseCompletedStep: false,
    });
    await this.workflowService.markTaskWaitingApproval(taskId, {
      stage: "auto_director",
      itemKey: module.id,
      itemLabel: `${module.label}已校准，请检查后继续`,
      checkpointType: "step_review_required",
      checkpointSummary: `${module.label}已完成${input.action === "improve" ? "完善" : "重新生成"}。请确认当前内容后再继续导演。`,
      seedPayload: buildDirectorWorkflowSeedPayload(calibratedDirectorInput, task.novelId, {
        stepReview: {
          stepId: module.id,
          nodeKey: module.nodeKey,
          label: module.label,
          targetType: module.targetType,
          targetId: input.targetId?.trim() || task.novelId,
          completedAt: new Date().toISOString(),
        },
      }),
    });
    return { action: input.action, stepId: module.id, instruction, status: "waiting_review" };
  }
}
