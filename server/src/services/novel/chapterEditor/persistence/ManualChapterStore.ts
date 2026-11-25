import type { Prisma } from "@prisma/client";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { queueManualChapterTimeline } from "../../../../modules/timeline";
import type { ChapterInput } from "../../novelCoreShared";
import { canRemoveManualChapter } from "../domain/manualChapterPolicy";
import { nextProvenanceAfterUnlock } from "../domain/chapterProvenance";
import { MANUAL_CHAPTER_SYNC_TYPE, queueManualChapterSync } from "../synchronization/ManualChapterSyncStore";

/** Shared body-only CAS used by legacy manual editing and manuscript adoption. */
export async function saveManualChapterContent(tx:Prisma.TransactionClient,existing:{id:string;novelId:string;content:string|null;updatedAt:Date},content:string){
 const currentRow=await tx.chapter.findUnique({where:{id:existing.id},select:{authorProvenance:true}});
 const now=new Date(Math.max(Date.now(),existing.updatedAt.getTime()+1));
 const changed=content!==existing.content;
 const saved=await tx.chapter.update({where:{id:existing.id,novelId:existing.novelId,content:existing.content},data:{content,updatedAt:now,
  ...(changed?{humanEditedAt:now,authorProvenance:currentRow?.authorProvenance==="human_locked"?"human_locked":"human_edited"}:{})}});
 if(changed){await queueManualChapterSync(tx,saved);await queueManualChapterTimeline(tx,saved);}return saved;
}
async function rejectManuscriptLegacyWrite(novelId:string){if(await prisma.manuscriptProject.findUnique({where:{novelId},select:{id:true}}))throw new AppError("请在原稿修订工作区预览并确认修改，旧章节接口不会覆盖修订副本。",409);}
/** Owns editor CAS and both durable synchronization obligations in one transaction. */
export class ManualChapterStore {
  async createChapter(novelId: string, input: ChapterInput) {
    await rejectManuscriptLegacyWrite(novelId);
    const chapter = await prisma.$transaction(async (tx) => {
      const saved = await tx.chapter.create({
        data: {
          novelId,
          title: input.title,
          order: input.order,
          content: input.content ?? "",
          expectation: input.expectation,
          chapterStatus: input.chapterStatus,
          targetWordCount: input.targetWordCount ?? null,
          conflictLevel: input.conflictLevel ?? null,
          revealLevel: input.revealLevel ?? null,
          mustAvoid: input.mustAvoid ?? null,
          taskSheet: input.taskSheet ?? null,
          sceneCards: input.sceneCards ?? null,
          repairHistory: input.repairHistory ?? null,
          qualityScore: input.qualityScore ?? null,
          continuityScore: input.continuityScore ?? null,
          characterScore: input.characterScore ?? null,
          pacingScore: input.pacingScore ?? null,
          riskFlags: input.riskFlags ?? null,
          generationState: "planned",
          ...(input.content?.trim() ? { authorProvenance: "human_edited", humanEditedAt: new Date() } : {}),
        },
      });
      if (saved.content) {
        await queueManualChapterSync(tx, saved);
        await queueManualChapterTimeline(tx, saved);
      }
      return saved;
    });

    return chapter;
  }
  async updateChapter(novelId: string, chapterId: string, input: Partial<ChapterInput>) {
    await rejectManuscriptLegacyWrite(novelId);
    const exists = await prisma.chapter.findFirst({ where: { id: chapterId, novelId }, select: { id: true, novelId:true, content: true, updatedAt: true, authorProvenance: true } });
    if (!exists) {
      throw new Error("章节不存在");
    }
    if (exists.authorProvenance === "human_locked" && typeof input.content === "string" && input.content !== exists.content) {
      throw new AppError("本章已人工锁定，请先解除锁定后再修改正文。", 409);
    }
    const bodyOnly = typeof input.content === "string" && input.expectedContent !== undefined
      && Object.keys(input).every(key => ["content", "expectedContent", "expectedUpdatedAt"].includes(key));
    const sameBody = (exists.content ?? "").replace(/\r\n?/g, "\n") === (input.expectedContent ?? "").replace(/\r\n?/g, "\n");
    if ((bodyOnly && !sameBody) || (!bodyOnly && input.expectedUpdatedAt && exists.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime())) {
      throw new AppError("本章保存版本已变化。请先查看新内容，再合并你的修改。", 409);
    }

    const chapter = await prisma.$transaction(async (tx) => {
      if(bodyOnly)return saveManualChapterContent(tx,exists,input.content!);
      const saved = await tx.chapter.update({
        where: { id: chapterId, novelId, ...(bodyOnly ? { content: exists.content } : { updatedAt: exists.updatedAt }) },
        data: {
          // Distinct versions even when two saves occur in the same millisecond.
          updatedAt: new Date(Math.max(Date.now(), exists.updatedAt.getTime() + 1)),
          title: input.title,
          order: input.order,
          content: input.content,
          expectation: input.expectation,
          chapterStatus: input.chapterStatus,
          targetWordCount: input.targetWordCount,
          conflictLevel: input.conflictLevel,
          revealLevel: input.revealLevel,
          mustAvoid: input.mustAvoid,
          taskSheet: input.taskSheet,
          sceneCards: input.sceneCards,
          repairHistory: input.repairHistory,
          qualityScore: input.qualityScore,
          continuityScore: input.continuityScore,
          characterScore: input.characterScore,
          pacingScore: input.pacingScore,
          riskFlags: input.riskFlags,
          ...(typeof input.content === "string" && input.content !== exists.content
            ? { authorProvenance: "human_edited", humanEditedAt: new Date(Math.max(Date.now(), exists.updatedAt.getTime() + 1)) }
            : {}),
        },
      });
      if (typeof input.content === "string" && input.content !== exists.content) {
        await queueManualChapterSync(tx, saved);
        await queueManualChapterTimeline(tx, saved);
      }
      return saved;
    }).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
        throw new AppError("本章保存版本已变化。请先查看新内容，再合并你的修改。", 409);
      }
      throw error;
    });

    return chapter;
  }
  async deleteChapter(novelId: string, chapterId: string) {
    await rejectManuscriptLegacyWrite(novelId);
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: {
        id: true,
        content: true,
        generationState: true,
        chapterStatus: true,
        expectation: true,
        taskSheet: true,
        sceneCards: true,
        repairHistory: true,
        riskFlags: true,
      },
    });
    if (!chapter) {
      throw new Error("章节不存在");
    }
    if (!canRemoveManualChapter(chapter)) {
      throw new Error("只能移除尚未进入写作或规划流程的空白手动章节");
    }
    const deleted = await prisma.chapter.deleteMany({ where: {
      id: chapterId,
      novelId,
      generationState: chapter.generationState,
      chapterStatus: chapter.chapterStatus,
      content: chapter.content,
      expectation: chapter.expectation,
      taskSheet: chapter.taskSheet,
      sceneCards: chapter.sceneCards,
      repairHistory: chapter.repairHistory,
      riskFlags: chapter.riskFlags,
    } });
    if (deleted.count === 0) {
      throw new AppError("本章内容或状态已变化，请刷新后再操作。", 409);
    }
  }

  async setChapterProvenance(novelId: string, chapterId: string, input: { locked: boolean; expectedUpdatedAt?: string }) {
    await rejectManuscriptLegacyWrite(novelId);
    const exists = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: {
        id: true,
        novelId: true,
        content: true,
        updatedAt: true,
        authorProvenance: true,
        humanEditedAt: true,
        artifactSyncCheckpoints: {
          where: { artifactType: MANUAL_CHAPTER_SYNC_TYPE },
          select: { artifactType: true, contentHash: true },
        },
      },
    });
    if (!exists) {
      throw new AppError("章节不存在。", 404);
    }
    if (input.expectedUpdatedAt && exists.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) {
      throw new AppError("本章保存版本已变化。请先查看新内容，再调整锁定状态。", 409);
    }
    const nextProvenance = input.locked ? "human_locked" : nextProvenanceAfterUnlock(exists);
    if (exists.authorProvenance === nextProvenance) {
      return prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } });
    }
    const updated = await prisma.chapter.updateMany({
      where: { id: chapterId, novelId, updatedAt: exists.updatedAt },
      data: {
        authorProvenance: nextProvenance,
        updatedAt: new Date(Math.max(Date.now(), exists.updatedAt.getTime() + 1)),
      },
    });
    if (updated.count === 0) {
      throw new AppError("本章保存版本已变化。请先查看新内容，再调整锁定状态。", 409);
    }
    return prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } });
  }
}
