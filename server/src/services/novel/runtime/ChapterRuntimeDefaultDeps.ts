import type { QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import type { ReviewOptions } from "../novelCoreShared";

export interface ChapterRuntimeAgentPort {
  createChapterGenRun: (novelId: string, chapterId: string, chapterOrder: number) => Promise<string>;
  finishChapterGenRun: (runId: string, summary: string, durationMs: number) => Promise<void>;
}

export const defaultChapterRuntimeAgent: ChapterRuntimeAgentPort = {
  async createChapterGenRun(novelId, chapterId, chapterOrder) {
    const { agentRuntime } = await import("../../../agents");
    return agentRuntime.createChapterGenRun(novelId, chapterId, chapterOrder);
  },
  async finishChapterGenRun(runId, summary, durationMs) {
    const { agentRuntime } = await import("../../../agents");
    await agentRuntime.finishChapterGenRun(runId, summary, durationMs);
  },
};

export function createDefaultReviewChapterAfterRepair(): (
  novelId: string,
  chapterId: string,
  options: ReviewOptions,
) => Promise<{ score: QualityScore; issues: ReviewIssue[] }> {
  return async (novelId, chapterId, options) => {
    const { NovelCoreReviewService } = await import("../novelCoreReviewService");
    return new NovelCoreReviewService().reviewChapter(novelId, chapterId, options);
  };
}
