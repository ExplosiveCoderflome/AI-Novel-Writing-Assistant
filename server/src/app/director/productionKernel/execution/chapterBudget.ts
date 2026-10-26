import type { Prisma, PrismaClient } from "@prisma/client";
import type { StepContext } from "../../../../modules/director";
import { hashProductionContent, type UnitRef } from "../../../../modules/production";
import type { InvocationUsageRecord } from "../../../../platform/llm/usage";
import { createKernelOwnership } from "./ownership";
import { accountKernelUsage } from "./budgetUsage";
import { readKernelChapterBudget, kernelBudgetMode, RESERVATION, USAGE, BLOCKED, type Reserved, type Observed, type KernelBudgetReader } from "./budgetReader";

/** A reservation remains charged until its observed physical invocation supplies usable token counts. */
export function createKernelChapterBudget(db: PrismaClient, context: StepContext) {
  const assertOwnership = createKernelOwnership(context), {runId} = context;
  const contract = structuredClone(context.contract);
  const novelId = contract.novelId, range = {...contract.chapterRange!};
  const limit = contract.launchInput?.chapterTokenLimit;
  const mode = kernelBudgetMode(runId);
  if (!Number.isSafeInteger(limit) || limit! < 1) throw new Error("Kernel chapter budget requires a frozen token limit");
  function unitIdentity(value: UnitRef): UnitRef {
    const unit = {...value};
    if (unit.novelId !== novelId || !unit.chapterId || !Number.isSafeInteger(unit.order) || unit.order < range.from || unit.order > range.to) {
      throw new Error("Kernel budget chapter scope differs");
    }
    return unit;
  }
  const key = (unit: UnitRef, artifactType: string, contentHash: string) => ({novelId,chapterId:unit.chapterId,contentHash,artifactType,syncMode:mode});
  const read = (reader: KernelBudgetReader, unit: UnitRef) => readKernelChapterBudget(reader,contract,unitIdentity(unit));
  async function block(tx: Prisma.TransactionClient, unit: UnitRef, requestKey: string, tokens: number): Promise<false> {
    const identity = key(unit,BLOCKED,requestKey), metadata: Reserved = {version:1,runId,requestKey,tokens};
    await tx.chapterArtifactSyncCheckpoint.upsert({where:{novelId_chapterId_contentHash_artifactType_syncMode:identity},
      create:{...identity,status:"blocked",sourceType:"production_kernel",sourceStage:"budget",metadataJson:JSON.stringify(metadata)},
      update:{status:"blocked",metadataJson:JSON.stringify(metadata)}});
    return false;
  }
  return {
    read: (unit: UnitRef) => read(db,unit),
    /** Stage output precheck only; the complete physical request owns the actual charged reservation. */
    async preflight(value: UnitRef, requestKey: string, tokens: number): Promise<boolean> {
      const unit=unitIdentity(value);
      if(!requestKey||!Number.isSafeInteger(tokens)||tokens<1)throw new Error("Invalid kernel preflight allowance");
      return db.$transaction(async tx=>{
        await assertOwnership(tx,{unit});
        return (await read(tx,unit)).remaining>=tokens ? true : block(tx,unit,requestKey,tokens);
      });
    },
    async reserve(value: UnitRef, requestKey: string, tokens: number): Promise<boolean> {
      const unit = unitIdentity(value);
      if (!requestKey || !Number.isSafeInteger(tokens) || tokens < 1) throw new Error("Invalid kernel reservation");
      return db.$transaction(async tx => {
        await assertOwnership(tx,{unit});
        const identity = key(unit,RESERVATION,requestKey);
        const existing = await tx.chapterArtifactSyncCheckpoint.findUnique({where:{novelId_chapterId_contentHash_artifactType_syncMode:identity},select:{metadataJson:true,status:true}});
        const metadata: Reserved = {version:1,runId,requestKey,tokens};
        if (existing) {
          if (existing.metadataJson !== JSON.stringify(metadata)) throw new Error("Kernel reservation identity changed");
          if (existing.status === "succeeded") return true;
          if (existing.status !== "not_dispatched") throw new Error("Invalid kernel reservation status");
          if ((await read(tx,unit)).remaining < tokens) return block(tx,unit,requestKey,tokens);
          const resumed = await tx.chapterArtifactSyncCheckpoint.updateMany({where:{...identity,status:"not_dispatched"},data:{status:"succeeded"}});
          if (resumed.count !== 1) throw new Error("Kernel reservation changed while resuming");
          return true;
        }
        if ((await read(tx,unit)).remaining < tokens) return block(tx,unit,requestKey,tokens);
        await tx.chapterArtifactSyncCheckpoint.create({data:{...identity,status:"succeeded",sourceType:"production_kernel",sourceStage:"budget",metadataJson:JSON.stringify(metadata)}});
        return true;
      });
    },
    async observe(value: UnitRef, requestKey: string, record: InvocationUsageRecord): Promise<void> {
      const unit = unitIdentity(value);
      if (!record.invocationId || record.runId !== runId || record.novelId !== novelId || record.chapterId !== unit.chapterId) throw new Error("Kernel usage identity changed");
      const tokens = record.usage?.totalTokens ?? null;
      if (tokens !== null && (!Number.isSafeInteger(tokens) || tokens < 0)) throw new Error("Invalid observed token usage");
      const accounting = accountKernelUsage(record.usage);
      await db.$transaction(async tx => {
        const reserved = await tx.chapterArtifactSyncCheckpoint.findUnique({where:{novelId_chapterId_contentHash_artifactType_syncMode:key(unit,RESERVATION,requestKey)},select:{id:true,status:true}});
        if (!reserved) throw new Error("Kernel usage has no matching reservation");
        if (!["succeeded","not_dispatched"].includes(reserved.status)) throw new Error("Invalid kernel reservation status");
        await tx.chapterArtifactSyncCheckpoint.update({where:{id:reserved.id},data:{status:"succeeded"}});
        const identity = key(unit,USAGE,hashProductionContent(record.invocationId));
        const metadata: Observed = {version:1,runId,requestKey,invocationId:record.invocationId,tokens,...(accounting ? {accounting} : {})};
        const payload = JSON.stringify(metadata);
        const receipt = await tx.chapterArtifactSyncCheckpoint.upsert({where:{novelId_chapterId_contentHash_artifactType_syncMode:identity},
          create:{...identity,status:"succeeded",sourceType:"production_kernel",sourceStage:"usage",metadataJson:payload},update:{},select:{metadataJson:true}});
        if (receipt.metadataJson !== payload) {
          const previous = JSON.parse(receipt.metadataJson ?? "null") as Observed | null;
          if (!previous || previous.accounting || previous.version !== 1 || previous.runId !== runId || previous.requestKey !== requestKey
            || previous.invocationId !== record.invocationId || previous.tokens !== tokens) throw new Error("Kernel invocation receipt conflicts with recorded usage");
          // Historical raw-only receipts remain immutable and conservatively charged.
        }
      });
    },
    /** Explicit pre-dispatch proof only; absence of telemetry alone is never sufficient. */
    async releaseUndispatched(value: UnitRef, requestKey: string): Promise<void> {
      const unit = unitIdentity(value);
      await db.$transaction(async tx => {
        const usages = await tx.chapterArtifactSyncCheckpoint.findMany({where:{novelId,chapterId:unit.chapterId,syncMode:mode,artifactType:USAGE},select:{metadataJson:true}});
        if (usages.some(row=>JSON.parse(row.metadataJson ?? "null")?.requestKey === requestKey)) throw new Error("Cannot release a dispatched invocation");
        const result = await tx.chapterArtifactSyncCheckpoint.updateMany({where:{...key(unit,RESERVATION,requestKey),status:"succeeded"},data:{status:"not_dispatched"}});
        if (result.count !== 1) throw new Error("Kernel reservation cannot be released");
      });
    },
  };
}
