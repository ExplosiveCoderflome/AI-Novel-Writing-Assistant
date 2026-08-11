import type {
  NovelProductionExperience,
  NovelProductionExperienceSelectionResponse,
} from "@ai-novel/shared/types/novelWorkflow";
import { buildFullBookAutopilotExecutionPlan } from "@ai-novel/shared/types/novelDirector";
import { buildFullDirectorAutoApprovalConfig } from "@ai-novel/shared/types/autoDirectorApproval";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { parseSeedPayload } from "../../workflow/novelWorkflow.shared";
import {
  applyDirectorRunModeContract,
  type DirectorWorkflowSeedPayload,
} from "../runtime/novelDirectorHelpers";
import { DirectorCommandService } from "./DirectorCommandService";

export function parseSelectedExperience(seed: DirectorWorkflowSeedPayload): NovelProductionExperience | null {
  return seed.productionExperience === "simple" || seed.productionExperience === "professional"
    ? seed.productionExperience
    : null;
}

export function buildProductionExperienceSeed(
  seed: DirectorWorkflowSeedPayload,
  experience: NovelProductionExperience,
): DirectorWorkflowSeedPayload {
  const directorInput = seed.directorInput;
  if (!directorInput) {
    throw new AppError("自动导演任务缺少继续生产所需的上下文。", 409);
  }
  const nextInput = experience === "simple"
    ? applyDirectorRunModeContract({
      ...directorInput,
      runMode: "full_book_autopilot" as const,
      autoExecutionPlan: buildFullBookAutopilotExecutionPlan(),
      autoApproval: buildFullDirectorAutoApprovalConfig(),
    })
    : applyDirectorRunModeContract({
      ...directorInput,
      runMode: "auto_to_ready" as const,
      autoExecutionPlan: undefined,
    });
  return {
    ...seed,
    productionExperience: experience,
    runMode: nextInput.runMode,
    autoExecutionPlan: nextInput.autoExecutionPlan,
    autoApproval: nextInput.autoApproval,
    directorInput: nextInput,
  };
}

export class DirectorProductionExperienceService {
  constructor(private readonly commandService = new DirectorCommandService()) {}

  async select(
    taskId: string,
    experience: NovelProductionExperience,
  ): Promise<NovelProductionExperienceSelectionResponse> {
    const task = await prisma.novelWorkflowTask.findUnique({ where: { id: taskId } });
    if (!task || task.lane !== "auto_director") {
      throw new AppError("自动导演任务不存在。", 404);
    }
    if (!task.novelId) {
      throw new AppError("自动导演任务还没有绑定小说项目。", 409);
    }

    const seed = parseSeedPayload<DirectorWorkflowSeedPayload>(task.seedPayloadJson) ?? {};
    const selected = parseSelectedExperience(seed);
    if (selected === "simple" && experience === "professional") {
      const activeJob = await prisma.generationJob.findFirst({
        where: {
          novelId: task.novelId,
          status: { in: ["queued", "running"] },
        },
        select: { id: true },
      });
      const nextSeed: DirectorWorkflowSeedPayload = activeJob
        ? { ...seed, pendingProductionExperience: "professional" }
        : { ...buildProductionExperienceSeed(seed, "professional"), pendingProductionExperience: undefined };
      await prisma.$transaction([
        prisma.novelWorkflowTask.update({
          where: { id: task.id },
          data: activeJob
            ? {
              seedPayloadJson: JSON.stringify(nextSeed),
              currentItemLabel: "将在当前章节完成后交接到专业创作",
            }
            : {
              seedPayloadJson: JSON.stringify(nextSeed),
              status: "succeeded",
              progress: 1,
              currentStage: "chapter_execution",
              currentItemKey: "professional_production_handoff",
              currentItemLabel: "已交接到专业创作工作台",
              checkpointType: "workflow_completed",
              checkpointSummary: "自动创作已在安全章节边界停止，后续由专业工作台接管。",
              pendingManualRecovery: false,
              finishedAt: new Date(),
            },
        }),
        ...(activeJob
          ? []
          : [prisma.novel.update({
            where: { id: task.novelId },
            data: { creationExperience: "professional" },
          })]),
      ]);
      return {
        experience,
        workflowTaskId: task.id,
        novelId: task.novelId,
        targetRoute: `/novels/${task.novelId}/edit`,
        backgroundStarted: Boolean(activeJob),
      };
    }
    if (selected && selected !== experience) {
      throw new AppError("这次生产方式已确认，不能重复改选。", 409);
    }

    if (!selected) {
      if (task.checkpointType !== "production_experience_required") {
        if (experience !== "simple") {
          throw new AppError("自动导演还没有完成正文生产前的准备。", 409);
        }
        const nextSeed = buildProductionExperienceSeed(seed, experience);
        await prisma.$transaction([
          prisma.novelWorkflowTask.update({
            where: { id: task.id },
            data: { seedPayloadJson: JSON.stringify(nextSeed) },
          }),
          prisma.novel.update({
            where: { id: task.novelId },
            data: { creationExperience: "simple" },
          }),
        ]);
        return {
          experience,
          workflowTaskId: task.id,
          novelId: task.novelId,
          targetRoute: `/novels/${task.novelId}/simple`,
          backgroundStarted: task.status === "queued" || task.status === "running",
        };
      }
      const nextSeed = buildProductionExperienceSeed(seed, experience);

      const claimed = await prisma.$transaction(async (tx) => {
        const updated = await tx.novelWorkflowTask.updateMany({
          where: {
            id: task.id,
            checkpointType: "production_experience_required",
          },
          data: experience === "simple"
            ? {
              seedPayloadJson: JSON.stringify(nextSeed),
              status: "waiting_approval",
              currentStage: "chapter_execution",
              currentItemKey: "chapter_batch_ready",
              currentItemLabel: "已选择简易创作，准备开始全书生产",
              checkpointType: "chapter_batch_ready",
              checkpointSummary: "章节执行资源已准备完成，AI 将开始全书生产。",
              pendingManualRecovery: false,
            }
            : {
              seedPayloadJson: JSON.stringify(nextSeed),
              status: "succeeded",
              progress: 1,
              currentStage: "chapter_execution",
              currentItemKey: "professional_production_handoff",
              currentItemLabel: "已交接到专业创作工作台",
              checkpointType: "workflow_completed",
              checkpointSummary: "自动导演已完成前期准备，后续章节生产由专业工作台接管。",
              pendingManualRecovery: false,
              finishedAt: new Date(),
            },
        });
        if (updated.count === 0) {
          return false;
        }
        await tx.novel.update({
          where: { id: task.novelId! },
          data: { creationExperience: experience },
        });
        return true;
      });

      if (!claimed) {
        return this.select(taskId, experience);
      }
    }

    if (experience === "professional") {
      return {
        experience,
        workflowTaskId: task.id,
        novelId: task.novelId,
        targetRoute: `/novels/${task.novelId}/edit`,
        backgroundStarted: false,
      };
    }

    const shouldEnqueue = !selected || (
      task.status === "waiting_approval"
      && task.checkpointType === "chapter_batch_ready"
    );
    const command = shouldEnqueue
      ? await this.commandService.enqueueContinueCommand(task.id, {
        continuationMode: "auto_execute_range",
        forceResume: true,
      })
      : null;
    return {
      experience,
      workflowTaskId: task.id,
      novelId: task.novelId,
      targetRoute: `/novels/${task.novelId}/simple`,
      backgroundStarted: true,
      commandId: command?.commandId,
    };
  }
}
