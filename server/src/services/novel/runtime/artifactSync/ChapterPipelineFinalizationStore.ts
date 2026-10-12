import {z} from "zod";
import {prisma} from "../../../../db/prisma";
import type {ChapterRuntimePackage} from "@ai-novel/shared/types/chapterRuntime";
import type {PipelineRuntimeResult} from "../chapterRuntimePipeline";
import {buildChapterArtifactContentHash} from "./ChapterArtifactContentVersion";
import {ChapterArtifactSyncBoundaryError} from "./ChapterArtifactSyncResult";

const ARTIFACT_TYPE = "chapter_pipeline_finalization:v1";
const resultSchema = z.object({
  reviewExecuted: z.boolean(), pass: z.boolean(),
  score: z.object({coherence: z.number(), pacing: z.number(), repetition: z.number(), engagement: z.number(), voice: z.number(), overall: z.number()}),
  issues: z.array(z.object({severity: z.enum(["low", "medium", "high", "critical"]), category: z.string(), evidence: z.string(), fixSuggestion: z.string()})),
  runtimePackage: z.custom<ChapterRuntimePackage>(value => !!value && typeof value === "object" && "audit" in value && "context" in value).nullable(),
  retryCountUsed: z.number().int().nonnegative(),
}).passthrough();
const receiptSchema = z.object({schemaVersion: z.literal(1), result: resultSchema});

/** A job-scoped receipt of the retained final result; it is never model context. */
export class ChapterPipelineFinalizationStore {
  async load(novelId: string, chapterId: string, scope: string): Promise<{content: string; result: PipelineRuntimeResult} | null> {
    const chapter = await prisma.chapter.findFirst({where: {id: chapterId, novelId}, select: {content: true}});
    if (!chapter?.content?.trim()) return null;
    const contentHash = buildChapterArtifactContentHash(chapter.content);
    const row = await prisma.chapterArtifactSyncCheckpoint.findUnique({
      where: this.where(novelId, chapterId, contentHash, scope),
      select: {status: true, metadataJson: true},
    });
    if (!row || row.status !== "succeeded") return null;
    try {
      const parsed = receiptSchema.parse(JSON.parse(row.metadataJson ?? "null"));
      return {content: chapter.content, result: parsed.result as PipelineRuntimeResult};
    } catch {
      throw this.failure(contentHash, "本章定稿恢复记录无法核验，请保留正文并检查运行记录。");
    }
  }

  async save(novelId: string, chapterId: string, scope: string, content: string, result: PipelineRuntimeResult): Promise<void> {
    const contentHash = buildChapterArtifactContentHash(content);
    try {
      const metadataJson = JSON.stringify(receiptSchema.parse({schemaVersion: 1, result}));
      await prisma.$transaction(async tx => {
        const chapter = await tx.chapter.findFirst({where: {id: chapterId, novelId}, select: {content: true}});
        if (!chapter?.content?.trim() || buildChapterArtifactContentHash(chapter.content) !== contentHash) {
          throw this.failure(contentHash, "正文版本已变化，无法保存过期的定稿恢复记录。");
        }
        const identity = this.where(novelId, chapterId, contentHash, scope);
        await tx.chapterArtifactSyncCheckpoint.upsert({
          where: identity,
          create: {...identity.novelId_chapterId_contentHash_artifactType_syncMode,
            status: "succeeded", sourceType: "director_v2_production", sourceStage: "chapter_finalization", metadataJson},
          update: {status: "succeeded", metadataJson, updatedAt: new Date()},
        });
      });
    } catch (error) {
      if (error instanceof ChapterArtifactSyncBoundaryError) throw error;
      throw this.failure(contentHash, "无法保存本章定稿恢复记录，请从保存位置继续处理。");
    }
  }

  private where(novelId: string, chapterId: string, contentHash: string, scope: string) {
    return {novelId_chapterId_contentHash_artifactType_syncMode: {
      novelId, chapterId, contentHash, artifactType: ARTIFACT_TYPE, syncMode: `director_v2:${scope}`,
    }};
  }

  private failure(contentHash: string, reason: string) {
    return new ChapterArtifactSyncBoundaryError({status: "failed", contentHash, completedArtifacts: [], reason});
  }
}
