import type { Prisma } from "@prisma/client";
import { prisma } from "../../../../db/prisma";
import { withSqliteRetry } from "../../../../db/sqliteRetry";
import {
  mergeChapterPatchForGenerationStateBump,
  type OperationalChapterStatus,
  type PipelineGenerationState,
} from "../../chapterLifecycleState";
import { assertChapterContentNotEmpty } from "../chapterEmptyContentError";

export class ChapterContentPersistenceError extends Error {
  constructor(
    readonly chapterId: string,
    message: string,
  ) {
    super(message);
    this.name = "ChapterContentPersistenceError";
  }
}

export class ChapterLifecycleService {
  async saveWorkingContent(input: {
    novelId: string;
    chapterId: string;
    content: string;
    generationState: "drafted" | "repaired";
  }): Promise<string> {
    const content = assertChapterContentNotEmpty(input.content, {
      novelId: input.novelId,
      chapterId: input.chapterId,
      source: "chapter_lifecycle_save",
    });
    try {
      await withSqliteRetry(
        () => prisma.chapter.update({
          where: { id: input.chapterId },
          data: {
            content,
            generationState: input.generationState,
            chapterStatus: "generating",
          },
        }),
        { label: "chapterLifecycle.saveWorkingContent" },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new ChapterContentPersistenceError(input.chapterId, `正文保存失败：${detail}`);
    }
    return content;
  }

  async markChapterStatus(chapterId: string, chapterStatus: OperationalChapterStatus): Promise<void> {
    await withSqliteRetry(
      () => prisma.chapter.update({
        where: { id: chapterId },
        data: { chapterStatus },
      }),
      { label: "chapterLifecycle.markChapterStatus" },
    );
  }

  async markGenerationState(chapterId: string, generationState: PipelineGenerationState): Promise<void> {
    await withSqliteRetry(
      () => prisma.chapter.update({
        where: { id: chapterId },
        data: mergeChapterPatchForGenerationStateBump({}, generationState),
      }),
      { label: "chapterLifecycle.markGenerationState" },
    );
  }

  async applyQualityAssessmentState(input: {
    chapterId: string;
    data: Pick<Prisma.ChapterUpdateInput, "riskFlags" | "repairHistory" | "chapterStatus" | "generationState">;
  }): Promise<void> {
    await withSqliteRetry(
      () => prisma.chapter.update({
        where: { id: input.chapterId },
        data: input.data,
      }),
      { label: "chapterLifecycle.applyQualityAssessmentState" },
    );
  }
}

export const chapterLifecycleService = new ChapterLifecycleService();
