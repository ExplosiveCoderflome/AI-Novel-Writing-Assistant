import { persistStoryPlan as saveLegacy,persistStoryPlanInTransaction as saveInTransaction,type PersistPlanInput,type ChapterPlanningTransactionFence } from "./persistence";
import type { Prisma } from "@prisma/client";
export { buildChapterExecutionContractHash,readPlanExecutionContractHash,STORY_PLAN_PERSISTENCE_TRANSACTION_TIMEOUT_MS } from "./persistence";
export type { PersistPlanInput,ChapterExecutionContractHashInput,ChapterPlanningTransactionFence } from "./persistence";

export async function persistStoryPlan(input:PersistPlanInput) {return saveLegacy(input);}
export async function persistStoryPlanInTransaction(tx:Prisma.TransactionClient,input:PersistPlanInput,assertTransaction:ChapterPlanningTransactionFence) {
  return saveInTransaction(tx,input,assertTransaction);
}
