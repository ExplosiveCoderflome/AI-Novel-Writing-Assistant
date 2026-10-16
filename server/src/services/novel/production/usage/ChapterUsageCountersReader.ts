import {prisma} from "../../../../db/prisma";
import type {Prisma} from "@prisma/client";
import {logPipelineWarn} from "../../novelCoreShared";
import type {ChapterUsageCounters} from "./DirectorChapterUsageBudget";

/** Cache belongs to the invocation journal, not an un-migrated GenerationJob field. */
export async function readChapterUsageCounters(jobId: string, db: Pick<Prisma.TransactionClient, "generationJob" | "llmInvocationUsageRecord"> = prisma): Promise<{
  job: number | ChapterUsageCounters;
  batch?: number | ChapterUsageCounters;
}> {
  const job = await db.generationJob.findUniqueOrThrow({where: {id: jobId},
    select: {totalTokens: true, promptTokens: true, completionTokens: true}});
  try {
    const [all, batch] = await Promise.all([
      db.llmInvocationUsageRecord.aggregate({where: {generationJobId: jobId, totalTokens: {not: null}},
        _sum: {cacheHitTokens: true}}),
      db.llmInvocationUsageRecord.aggregate({where: {generationJobId: jobId, stage: "chapter_batch", totalTokens: {not: null}},
        _sum: {totalTokens: true, promptTokens: true, completionTokens: true, cacheHitTokens: true}}),
    ]);
    if (typeof job.promptTokens !== "number" || typeof job.completionTokens !== "number") {
      return {job: job.totalTokens, batch: batch._sum.totalTokens ?? 0};
    }
    return {job: {...job, cacheHitTokens: all._sum.cacheHitTokens ?? 0},
      batch: {totalTokens: batch._sum.totalTokens ?? 0, promptTokens: batch._sum.promptTokens ?? 0,
        completionTokens: batch._sum.completionTokens ?? 0, cacheHitTokens: batch._sum.cacheHitTokens ?? 0}};
  } catch (error) {
    logPipelineWarn("章节分项用量读取失败，保留原始用量保护", {jobId, error: error instanceof Error ? error.message : String(error)});
    // New chapters may conservatively start a raw checkpoint. An existing
    // effective checkpoint rejects this missing breakdown rather than changing its metric.
    return {job: job.totalTokens};
  }
}
