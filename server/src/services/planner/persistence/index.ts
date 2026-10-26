import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import type { PersistPlanInput } from "./contract";
import { findExistingStoryPlan,prepareStoryPlanRecord,writePreparedStoryPlan,readSavedStoryPlan } from "./storyPlanStore";
export { buildChapterExecutionContractHash,readPlanExecutionContractHash } from "./contract";
export type { PersistPlanInput,ChapterExecutionContractHashInput } from "./contract";
export const STORY_PLAN_PERSISTENCE_TRANSACTION_TIMEOUT_MS=60_000;
export type ChapterPlanningTransactionFence=(tx:Prisma.TransactionClient,point:"before"|"after")=>Promise<void>;

/** Legacy default retains its existing reads and transaction boundary. */
export async function persistStoryPlan(input:PersistPlanInput) {
  const record=prepareStoryPlanRecord(input),existing=await findExistingStoryPlan(prisma,input);
  const id=await prisma.$transaction(tx=>writePreparedStoryPlan(tx,input,record,existing),{timeout:STORY_PLAN_PERSISTENCE_TRANSACTION_TIMEOUT_MS});
  return readSavedStoryPlan(prisma,id);
}

/** Caller saves its planning receipt in this same transaction. No global client or hidden nested transaction. */
export async function persistStoryPlanInTransaction(tx:Prisma.TransactionClient,input:PersistPlanInput,assertTransaction:ChapterPlanningTransactionFence) {
  if(typeof assertTransaction !== "function" || input.level !== "chapter" || !input.chapterId || !input.novelId)throw new Error("Fenced chapter planning requires explicit ownership and chapter identity");
  const frozen=JSON.parse(JSON.stringify(input)) as PersistPlanInput;
  await assertTransaction(tx,"before");
  const record=prepareStoryPlanRecord(frozen),existing=await findExistingStoryPlan(tx,frozen);
  const id=await writePreparedStoryPlan(tx,frozen,record,existing);
  await assertTransaction(tx,"after");
  return readSavedStoryPlan(tx,id);
}
