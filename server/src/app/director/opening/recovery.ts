import {prisma} from "../../../db/prisma";
import {AppError} from "../../../middleware/errorHandler";
import {toAcceptedResponse} from "../../../services/novel/director/commands/DirectorCommandServiceHelpers";

const retryable = new Set(["generate_candidates","refine_candidates","patch_candidate","refine_titles","confirm_candidate"]);

/** Explicit recovery of the latest pre-book command. Historical failure rows remain unchanged. */
export async function prepareOpeningRetry(taskId: string) {
  return prisma.$transaction(async tx => {
    const task = await tx.novelWorkflowTask.findUnique({where:{id:taskId}});
    if (!task || task.lane !== "auto_director") throw new AppError("找不到可重试的开书任务。",404);
    if (task.novelId) throw new AppError("请在小说导演台继续创作。",409);
    const failed = await tx.directorRunCommand.findFirst({where:{taskId},orderBy:[{createdAt:"desc"},{id:"desc"}]});
    if (!failed || !retryable.has(failed.commandType)) throw new AppError("当前任务没有可重试的开书操作。",409);
    if (["queued","leased","running"].includes(failed.status) && !task.pendingManualRecovery) return toAcceptedResponse(failed);
    if (!["failed","stale"].includes(failed.status)) throw new AppError("请等待本次开书操作结束，再重试。",409);
    const idempotencyKey = `opening-retry:${failed.id}`;
    const replay = await tx.directorRunCommand.findUnique({where:{taskId_commandType_idempotencyKey:{taskId,commandType:failed.commandType,idempotencyKey}}});
    if (replay) return toAcceptedResponse(replay);
    const command = await tx.directorRunCommand.create({data:{taskId,commandType:failed.commandType,idempotencyKey,payloadJson:failed.payloadJson}});
    await tx.novelWorkflowTask.update({where:{id:taskId},data:{status:"queued",pendingManualRecovery:false,lastError:null,cancelRequestedAt:null,heartbeatAt:new Date(),finishedAt:null}});
    return toAcceptedResponse(command);
  });
}
