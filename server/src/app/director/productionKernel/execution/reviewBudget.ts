import type { PrismaClient } from "@prisma/client";
import { directorIssuePolicySchema, resolveChapterReviewRetryPolicy } from "@ai-novel/shared/types/directorIssue";
import type { StepContext } from "../../../../modules/director";
import { hashProductionContent, type UnitRun } from "../../../../modules/production";
import { canonicalProductionJson } from "../../../../modules/production/common";
import { currentModelRequestBudget } from "../../../../platform/llm/retries";
import { ChapterReviewRetryBudget, chapterReviewRetryStateSchema, ReviewRetryExhaustedError, ReviewRetryPersistenceError,
  withChapterReviewRetryBudget, type ChapterReviewRetryState } from "../../../../services/novel/runtime/acceptance/retries/ChapterReviewRetryBudget";
import { createKernelOwnership } from "./ownership";
import { markKernelRequestNotDispatched } from "./requestScope";

/** Native initial/candidate checks share a durable counter without replacing the caller's physical request fence. */
export function createKernelReviewBudget(db: PrismaClient, context: StepContext) {
  const assertOwnership = createKernelOwnership(context);
  return async <T>(run: UnitRun, operation: () => Promise<T>): Promise<T> => {
    const outer = currentModelRequestBudget();
    if (!outer) throw new Error("Kernel review requires a physical request budget");
    if (!["accept","verify"].includes(run.activeStage ?? "") || !run.activeRequestKey) throw new Error("Kernel review requires an active check claim");
    const policy = resolveChapterReviewRetryPolicy(directorIssuePolicySchema.parse(run.snapshots.policySource));
    const identity = {novelId:run.progress.unit.novelId,chapterId:run.progress.unit.chapterId,
      artifactType:"production_kernel_review_retry:v1",contentHash:hashProductionContent(run.id),syncMode:hashProductionContent(`review:${run.id}`)};
    const initial: ChapterReviewRetryState = {version:1,policy,used:0,startedChecks:[],failedChecks:[]};
    async function access(change?: (state: ChapterReviewRetryState) => ChapterReviewRetryState) {
      return db.$transaction(async tx => {
        await assertOwnership(tx,{ownerKey:run.ownerKey,unit:run.progress.unit});
        const current = await tx.productionUnitRun.findFirst({where:{id:run.id,ownerKey:run.ownerKey,
          novelId:run.progress.unit.novelId,chapterId:run.progress.unit.chapterId,activeStage:run.activeStage,activeRequestKey:run.activeRequestKey},
          select:{policySnapshotJson:true}});
        if (!current) throw new Error("Kernel review request claim changed");
        if (canonicalProductionJson(JSON.parse(current.policySnapshotJson)) !== canonicalProductionJson({policy:run.snapshots.policy,policySource:run.snapshots.policySource!})) {
          throw new Error("Kernel review policy snapshot changed");
        }
        const row = await tx.chapterArtifactSyncCheckpoint.findUnique({where:{novelId_chapterId_contentHash_artifactType_syncMode:identity}});
        if (row && row.status !== "succeeded") throw new Error("Invalid kernel review receipt status");
        const state = row ? chapterReviewRetryStateSchema.parse(JSON.parse(row.metadataJson ?? "null")) : initial;
        if (canonicalProductionJson(state.policy) !== canonicalProductionJson(policy)) throw new Error("Kernel review policy differs from its receipt");
        if (!change) return state;
        const next = chapterReviewRetryStateSchema.parse(change(state));
        if (canonicalProductionJson(next.policy) !== canonicalProductionJson(policy)) throw new Error("Kernel review policy cannot change");
        const data = {status:"succeeded",sourceType:"production_kernel",sourceStage:"review_retry",metadataJson:canonicalProductionJson(next)};
        if (row) {
          const updated = await tx.chapterArtifactSyncCheckpoint.updateMany({where:{id:row.id,metadataJson:row.metadataJson},data});
          if (updated.count !== 1) throw new Error("Kernel review receipt changed concurrently");
        } else await tx.chapterArtifactSyncCheckpoint.create({data:{...identity,...data}});
        return next;
      });
    }
    const budget = new ChapterReviewRetryBudget(await access(),{
      read:()=>access(),update:async change=>{
        try {return await access(change);}
        catch (error) {
          // This typed exception is raised inside beforeRequest, after the outer reserve and before provider dispatch.
          if (error instanceof ReviewRetryExhaustedError) {
            await markKernelRequestNotDispatched();throw error;
          }
          throw new ReviewRetryPersistenceError(error instanceof Error ? error.message : "Kernel review persistence failed",{cause:error});
        }
      },
    },()=>outer.beforeRequest());
    return withChapterReviewRetryBudget(budget,async()=>{
      const result = await operation();budget.throwIfUnsafe();return result;
    });
  };
}
