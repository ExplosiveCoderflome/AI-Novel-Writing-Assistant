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
