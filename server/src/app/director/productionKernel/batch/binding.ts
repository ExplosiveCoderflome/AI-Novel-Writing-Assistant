import type { Prisma, PrismaClient } from "@prisma/client";
import type { RunContract, StepContext } from "../../../../modules/director";
import { createKernelOwnership } from "../execution/ownership";

export type ProductionBatchImplementation = "legacy" | "kernel";
const TYPE = "production_batch_implementation";
interface Binding {version: 1; implementation: ProductionBatchImplementation; novelId: string; scope: string; from: number; to: number}

export async function readProductionBatchImplementation(db: Pick<Prisma.TransactionClient,"directorNextEvent">,
  contract: RunContract): Promise<ProductionBatchImplementation | null> {
  const rows = await db.directorNextEvent.findMany({where:{runId:contract.runId,type:TYPE},select:{payloadJson:true},take:2});
  if (!rows.length) return null;
  if (rows.length !== 1) throw new Error("Production implementation binding is ambiguous");
  const value = JSON.parse(rows[0].payloadJson) as Binding, range = contract.chapterRange;
  if (value.version !== 1 || !["legacy","kernel"].includes(value.implementation) || value.novelId !== contract.novelId
    || value.scope !== contract.scope || value.from !== range?.from || value.to !== range?.to) {
    throw new Error("Production implementation binding has an invalid contract scope");
  }
  return value.implementation;
}

/** Bind before starting either implementation. Old jobs also cover the legacy start-before-bind crash window. */
export async function chooseProductionBatchImplementation(db: PrismaClient, context: StepContext,
  enabled: boolean): Promise<ProductionBatchImplementation> {
  const assertOwnership = createKernelOwnership(context), contract = context.contract;
  return db.$transaction(async tx => {
    await assertOwnership(tx);
    const saved = await readProductionBatchImplementation(tx,contract);
    const oldBinding = await tx.directorNextEvent.findFirst({where:{runId:context.runId,type:"chapter_batch_job"},select:{id:true}});
    const jobs = oldBinding ? [] : await tx.generationJob.findMany({where:{novelId:contract.novelId,
      startOrder:contract.chapterRange!.from,endOrder:contract.chapterRange!.to},select:{payload:true}});
    const oldJob = Boolean(oldBinding) || jobs.some(job => {
      const payload = JSON.parse(job.payload || "{}") as {directorNext?: {runId?: string}};
      return payload.directorNext?.runId === context.runId;
    });
    if (saved) {
      if (saved === "kernel" && oldJob) throw new Error("Production implementation conflicts with a legacy job");
      return saved;
    }
    const implementation = oldJob || !enabled ? "legacy" : "kernel";
    const latest = await tx.directorNextEvent.findFirst({where:{runId:context.runId},orderBy:{seq:"desc"},select:{seq:true}});
    const binding: Binding = {version:1,implementation,novelId:contract.novelId,scope:contract.scope,
      from:contract.chapterRange!.from,to:contract.chapterRange!.to};
    await tx.directorNextEvent.create({data:{id:`${context.runId}:production-binding`,runId:context.runId,
      seq:(latest?.seq ?? 0)+1,type:TYPE,payloadJson:JSON.stringify(binding)}});
    return implementation;
  });
}
