import {prisma} from "../../../db/prisma";
import {DirectorCommandExecutor} from "../../../services/novel/director/commands/DirectorCommandExecutor";
import {DirectorCommandService} from "../../../services/novel/director/commands/DirectorCommandService";
import {launchNewDirectorBook} from "../newBook";

const commands = new Set(["generate_candidates","refine_candidates","patch_candidate","refine_titles","confirm_candidate"]);
const active = new Set<string>();

/** Only command ids accepted by an explicit opening request are executed. No scan of historical production. */
export function scheduleOpeningCommand(commandId: string): void {
  if (active.has(commandId)) return;
  active.add(commandId);
  void executeOpeningCommand(commandId).catch(error => console.error("[director.opening] command stopped",error instanceof Error ? error.message : "unknown error"))
    .finally(() => active.delete(commandId));
}

export async function executeOpeningCommand(commandId: string): Promise<void> {
  const service = new DirectorCommandService();
  const command = await service.getCommandById(commandId);
  if (!command || !commands.has(command.commandType)) return;
  const task = await prisma.novelWorkflowTask.findUniqueOrThrow({where:{id:command.taskId}});
  if (task.novelId && !(command.commandType === "confirm_candidate" && task.novelId === `director-opening-book-${task.id}`)) return;
  if (task.cancelRequestedAt || task.pendingManualRecovery) return;
  const owner = `opening-${process.pid}-${commandId}`, leaseMs = 120_000, now = new Date();
  const claimed = await prisma.directorRunCommand.updateMany({where:{id:commandId,status:"queued"},data:{status:"leased",leaseOwner:owner,leaseExpiresAt:new Date(now.getTime()+leaseMs),attempt:{increment:1}}});
  if (claimed.count !== 1) return;
  const renewal = setInterval(() => void service.renewLease(commandId,owner,leaseMs).catch(() => undefined),30_000);
  renewal.unref();
  try {
    await service.markCommandRunning(commandId,owner,leaseMs);
    if (command.commandType === "confirm_candidate") {
      const input = service.parseCommandPayload(command).confirmRequest;
      if (!input) throw new Error("开书确认缺少选定方向。");
      const {novel} = await launchNewDirectorBook(input,task.id,"original_opening");
      await prisma.novelWorkflowTask.update({where:{id:task.id},data:{novelId:novel.id,status:"succeeded",progress:1,finishedAt:new Date(),pendingManualRecovery:false,
        checkpointType:null,checkpointSummary:null,currentItemKey:"opening_complete",currentItemLabel:"进入小说导演台继续创作",
        resumeTargetJson:JSON.stringify({route:"/lab/director/:novelId",novelId:novel.id})}});
    } else {
      const outcome = await new DirectorCommandExecutor().execute(commandId);
      if (outcome === "cancelled") {await service.markCommandCancelled(commandId,owner);return;}
    }
    await service.markCommandSucceeded(commandId,owner);
  } catch(error) {
    await service.markCommandFailed(commandId,owner,error);
    throw error;
  } finally {clearInterval(renewal);}
}
