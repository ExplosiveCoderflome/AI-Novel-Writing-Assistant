import type {
  NovelProductionExperience,
  NovelProductionExperienceSelectionResponse,
} from "@ai-novel/shared/types/novelWorkflow";
import {
  type DirectorAutoApprovalConfig,
  type DirectorAutoApprovalPointCode,
} from "@ai-novel/shared/types/autoDirectorApproval";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { parseSeedPayload } from "../../workflow/novelWorkflow.shared";
import {
  applyDirectorRunModeContract,
  type DirectorWorkflowSeedPayload,
} from "../runtime/novelDirectorHelpers";

const SIMPLE_CREATION_MANUAL_APPROVAL_POINT_CODES = [
  "candidate_direction_confirmed",
  "character_setup_ready",
  "volume_strategy_ready",
  "structured_outline_ready",
] satisfies DirectorAutoApprovalPointCode[];

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
  const manualApprovalConfig: DirectorAutoApprovalConfig = {
    enabled: false,
    approvalPointCodes: [...SIMPLE_CREATION_MANUAL_APPROVAL_POINT_CODES],
  };
  const nextInput = applyDirectorRunModeContract({
    ...directorInput,
    runMode: "auto_to_ready" as const,
    autoExecutionPlan: undefined,
    autoApproval: manualApprovalConfig,
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
    if (selected && selected !== experience) {
      const nextSeed = buildProductionExperienceSeed(seed, experience);
      await prisma.$transaction([
        prisma.novelWorkflowTask.update({
          where: { id: task.id },
          data: { seedPayloadJson: JSON.stringify(nextSeed) },
        }),
        prisma.novel.update({
          where: { id: task.novelId },
          data: { creationExperience: experience },
        }),
      ]);
      return {
        experience,
        workflowTaskId: task.id,
        novelId: task.novelId,
        targetRoute: experience === "simple" ? `/novels/${task.novelId}/simple` : `/novels/${task.novelId}/edit`,
        backgroundStarted: task.status === "queued" || task.status === "running",
      };
    }

    if (!selected) {
      if (task.checkpointType !== "production_experience_required") {
        throw new AppError("自动导演还没有完成正文生产前的准备。", 409);
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
                currentItemLabel: "已选择简易创作，等待确认章节执行范围",
                checkpointType: "chapter_batch_ready",
                checkpointSummary: "章节执行资源已准备完成，请确认本次要执行的章节范围后再继续。",
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
      return {
        experience,
        workflowTaskId: task.id,
        novelId: task.novelId,
        targetRoute: experience === "simple" ? `/novels/${task.novelId}/simple` : `/novels/${task.novelId}/edit`,
        backgroundStarted: false,
      };
    }

    return {
      experience,
      workflowTaskId: task.id,
      novelId: task.novelId,
      targetRoute: experience === "simple" ? `/novels/${task.novelId}/simple` : `/novels/${task.novelId}/edit`,
      backgroundStarted: task.status === "queued" || task.status === "running",
    };
  }
}
