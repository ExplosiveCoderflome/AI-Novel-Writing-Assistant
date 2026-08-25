import { prisma } from "../../../../db/prisma";
import { withSqliteRetry } from "../../../../db/sqliteRetry";
import {
  mergeChapterPatchForGenerationStateBump,
  type OperationalChapterStatus,
  type PipelineGenerationState,
} from "../../chapterLifecycleState";
import { assertChapterContentNotEmpty } from "../chapterEmptyContentError";

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
}

export const chapterLifecycleService = new ChapterLifecycleService();
