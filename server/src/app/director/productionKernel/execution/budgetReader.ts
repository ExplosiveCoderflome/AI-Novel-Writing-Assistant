import type { Prisma } from "@prisma/client";
import type { RunContract } from "../../../../modules/director";
import { hashProductionContent, type UnitRef } from "../../../../modules/production";
import { directorChapterBudgetGrantSchema, directorChapterTokenLimitSchema } from "@ai-novel/shared/types/director/chapterBudget";
import { productionBatchOwnerKey } from "./ownership";
import { readKernelUsageAccounting, type KernelUsageAccounting } from "./budgetUsage";

export const RESERVATION = "production_kernel_budget:v1", USAGE = "production_kernel_usage:v1", BLOCKED = "production_kernel_budget_block:v1";
export const AUTOMATIC_TOP_UP = "production_kernel_budget_top_up:v1";
export interface Reserved {version: 1; runId: string; requestKey: string; tokens: number}
export interface Observed {version: 1; runId: string; requestKey: string; invocationId: string; tokens: number | null; accounting?: KernelUsageAccounting}
export type KernelBudgetReader = Pick<Prisma.TransactionClient,"chapter" | "chapterArtifactSyncCheckpoint" | "directorNextEvent" | "productionUnitRun">;
export const kernelBudgetMode = (runId: string) => hashProductionContent(`kernel-budget:${runId}`);

async function grantedLimit(db: KernelBudgetReader, contract: RunContract, unit: UnitRef) {
  const initial = contract.launchInput?.chapterTokenLimit, range = contract.chapterRange!;
  if (!Number.isSafeInteger(initial) || initial! < 1) throw new Error("Kernel chapter budget requires a frozen token limit");
  const events = await db.directorNextEvent.findMany({where:{runId:contract.runId,type:"chapter_budget_granted"},orderBy:{seq:"asc"},select:{payloadJson:true}});
  let remaining: number | undefined, individual: number | undefined;
  for (const event of events) {
    const {commandId, ...payload} = JSON.parse(event.payloadJson);
    const grant = directorChapterBudgetGrantSchema.parse(payload);
    const saved = await db.productionUnitRun.findUnique({where:{id:grant.jobId},select:{ownerKey:true,novelId:true,chapterId:true,progressJson:true}});
    const target = saved && JSON.parse(saved.progressJson).unit as UnitRef | undefined;
    if (!commandId || grant.metric !== "uncached_tokens_v1" || !saved || saved.ownerKey !== productionBatchOwnerKey(contract.runId)
      || saved.novelId !== contract.novelId || saved.chapterId !== grant.chapterId || target?.novelId !== contract.novelId
      || target.chapterId !== grant.chapterId || target.order < range.from || target.order > range.to) throw new Error("Invalid kernel budget grant scope");
    if (grant.applyToRemaining && target.order <= unit.order) remaining = grant.tokenLimit;
    if (grant.chapterId === unit.chapterId) individual = grant.tokenLimit;
  }
  return { initial: initial!, manual: individual ?? remaining };
}

/** Read-only accounting is also used by paused source pages, without inventing a worker lease. */
export async function readKernelChapterBudget(db: KernelBudgetReader, contract: RunContract, unit: UnitRef) {
  const {runId,novelId} = contract, range = contract.chapterRange;
  if (!range || unit.novelId !== novelId || !Number.isSafeInteger(unit.order) || unit.order < range.from || unit.order > range.to
    || !await db.chapter.findFirst({where:{id:unit.chapterId,novelId,order:unit.order},select:{id:true}})) throw new Error("Kernel budget chapter identity differs");
  const limits = await grantedLimit(db,contract,unit);
  const rows = await db.chapterArtifactSyncCheckpoint.findMany({where:{novelId,chapterId:unit.chapterId,syncMode:kernelBudgetMode(runId),
    artifactType:{in:[RESERVATION,USAGE,AUTOMATIC_TOP_UP]},status:"succeeded"},select:{artifactType:true,contentHash:true,metadataJson:true}});
  const observed = new Map<string,Observed[]>(), reserved: Reserved[] = [];
  let automaticLimit: number | undefined;
  for (const row of rows) {
    if (row.artifactType === AUTOMATIC_TOP_UP) {
      const grant = JSON.parse(row.metadataJson ?? "null");
      if (automaticLimit !== undefined || contract.launchInput?.chapterBudgetAutomatic !== true || row.contentHash !== AUTOMATIC_TOP_UP
        || grant?.version !== 1 || grant.runId !== runId || !directorChapterTokenLimitSchema.safeParse(grant.tokenLimit).success
        || grant.tokenLimit <= limits.initial || grant.tokenLimit > limits.initial * 2) throw new Error("Corrupt automatic chapter budget grant");
      automaticLimit = grant.tokenLimit;
      continue;
    }
    const item = JSON.parse(row.metadataJson ?? "null") as Reserved | Observed;
    if (!item || item.version !== 1 || item.runId !== runId || !item.requestKey) throw new Error("Corrupt kernel budget receipt");
    if (row.artifactType === RESERVATION) {
      if (item.requestKey !== row.contentHash || !Number.isSafeInteger(item.tokens) || item.tokens! < 1) throw new Error("Corrupt kernel reservation");
      reserved.push(item as Reserved);
    } else {
      const usage = item as Observed;
      if (!usage.invocationId || hashProductionContent(usage.invocationId) !== row.contentHash
        || (usage.tokens !== null && (!Number.isSafeInteger(usage.tokens) || usage.tokens < 0))) throw new Error("Corrupt kernel usage");
      observed.set(item.requestKey,[...(observed.get(item.requestKey) ?? []),usage]);
    }
  }
  let used = 0, hasUnknownUsage = false, reservedTokens = 0;
  let rawTokens = 0, promptTokens = 0, completionTokens = 0, cacheHitTokens = 0, unclassifiedTokens = 0;
  if ([...observed.keys()].some(key => !reserved.some(row => row.requestKey === key))) throw new Error("Kernel usage has no matching reservation");
  for (const reservation of reserved) {
    const amounts = observed.get(reservation.requestKey);
    const unknown = amounts?.filter(value => value.tokens === null).length ?? 1;
    if (unknown) { const held = reservation.tokens * unknown; used += held; reservedTokens += held; hasUnknownUsage = true; }
    for (const amount of amounts ?? []) {
      if (amount.tokens === null) continue;
      const value = readKernelUsageAccounting(amount.tokens, amount.accounting);
      used += value.usedTokens; rawTokens += value.rawTokens; promptTokens += value.promptTokens;
      completionTokens += value.completionTokens; cacheHitTokens += value.cacheHitTokens; unclassifiedTokens += value.unclassifiedTokens;
    }
  }
  if (![used,rawTokens,promptTokens,completionTokens,cacheHitTokens,unclassifiedTokens,reservedTokens].every(Number.isSafeInteger)) throw new Error("Invalid kernel usage total");
  const limit = limits.manual ?? automaticLimit ?? limits.initial;
  return {limit,used,remaining:Math.max(0,limit-used),hasUnknownUsage,metric:"uncached_tokens_v1" as const,
    canAutoTopUp: contract.launchInput?.chapterBudgetAutomatic === true && limits.manual == null && automaticLimit == null,
    automaticTopUpTokens: automaticLimit == null ? undefined : automaticLimit - limits.initial,
    rawTokens,promptTokens,completionTokens,cacheHitTokens,unclassifiedTokens,reservedTokens};
}
