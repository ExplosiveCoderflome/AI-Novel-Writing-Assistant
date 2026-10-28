import type { Prisma, PrismaClient } from "@prisma/client";
import type { StepContext } from "../../../../modules/director";
import { canonicalProductionJson } from "../../../../modules/production/common";

export const productionBatchOwnerKey = (runId: string): string => `director_next:${runId}:chapter_batch`;
export interface KernelWriteIdentity {
  ownerKey?: string;
  unit?: {novelId: string; chapterId: string; order: number};
  novelId?: string;
  executionToken?: string;
}

/** Capture this worker's identity once. A later lease read can only validate it, never replace it. */
export function createKernelOwnership(context: StepContext) {
  const {runId} = context, {novelId} = context.contract;
  const epoch = context.contract.executionEpoch ?? 0, range = context.contract.chapterRange;
  const leaseOwner = context.execution?.leaseOwner, version = context.control.version;
  const contractJson = canonicalProductionJson(context.contract);
  if (!leaseOwner || !range || !Number.isSafeInteger(epoch) || epoch < 0 || context.step.id !== "chapter_batch"
    || !Number.isSafeInteger(range.from) || !Number.isSafeInteger(range.to) || range.from < 1 || range.to < range.from) {
    throw new Error("Production ownership requires a captured lease and authorized scope");
  }
  const from = range.from, to = range.to;
  return async (tx: Prisma.TransactionClient, identity?: KernelWriteIdentity): Promise<void> => {
    if ((identity?.ownerKey && identity.ownerKey !== productionBatchOwnerKey(runId))
      || (identity?.executionToken && identity.executionToken !== leaseOwner)
      || (identity?.novelId && identity.novelId !== novelId)
      || (identity?.unit && (identity.unit.novelId !== novelId || identity.unit.order < from || identity.unit.order > to))) {
      throw new Error("Production ownership or chapter scope differs");
    }
    const book = await tx.novel.updateMany({where:{id:novelId,directorEpoch:epoch,narrativeForm:{not:"short_story"},
      OR:[{directorVersion:"v2"},{directorVersion:null}]},data:{directorEpoch:{increment:0}}});
    if (book.count !== 1) throw new Error("Production book ownership or epoch changed");
    const control = await tx.directorNextRunControl.updateMany({where:{runId,novelId,version,status:"running",
      cursorStepId:"chapter_batch",leaseOwner,leaseExpiresAt:{gt:new Date()}},data:{version:{increment:0}}});
    if (control.count !== 1) throw new Error("Production lease ownership changed or expired");
    const run = await tx.directorNextRun.findUnique({where:{id:runId},select:{novelId:true,contractJson:true}});
    if (!run || run.novelId !== novelId || canonicalProductionJson(JSON.parse(run.contractJson)) !== contractJson) {
      throw new Error("Production contract or scope changed");
    }
  };
}

export async function assertKernelOwnership(db: PrismaClient, context: StepContext): Promise<void> {
  await db.$transaction(createKernelOwnership(context));
}
