import type { Router } from "express";
import { z } from "zod";
import { respondWithSSEError, startSSE, streamToSSE } from "../llm/streaming";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import type { NovelService } from "../services/novel/NovelService";
import { chapterRuntimeRequestSchema } from "../services/novel/runtime/chapterRuntimeSchema";

interface RegisterNovelChapterGenerationRoutesInput {
  router: Router;
  novelService: NovelService;
  chapterParamsSchema: z.ZodType<{
    id: string;
    chapterId: string;
  }>;
  mapBusinessError: (error: unknown) => AppError | null;
}

export function registerNovelChapterGenerationRoutes(input: RegisterNovelChapterGenerationRoutesInput): void {
  const {
    router,
    novelService,
    chapterParamsSchema,
    mapBusinessError,
  } = input;

  router.post(
    "/:id/chapters/:chapterId/runtime/run",
    validate({ params: chapterParamsSchema, body: chapterRuntimeRequestSchema }),
    async (req, res, next) => {
      const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
      const runStatus = {
        runId: `chapter-runtime:${chapterId}`,
        queuedMessage: "正在准备章节运行时上下文。",
        runningMessage: "章节正文已开始流式生成。",
        failedMessage: "章节生成失败。",
      };
      const disposeHeartbeat = startSSE(res, runStatus);
      try {
        const { stream, onDone } = await novelService.createChapterRuntimeStream(
          id,
          chapterId,
          req.body as z.infer<typeof chapterRuntimeRequestSchema>,
        );
        await streamToSSE(res, stream, onDone, { disposeHeartbeat, runStatus });
      } catch (error) {
        const exposedError = mapBusinessError(error) ?? error;
        respondWithSSEError(res, exposedError, { disposeHeartbeat, runStatus, fallbackMessage: "章节生成失败。" });
      }
    },
  );

  router.post(
    "/:id/chapters/:chapterId/generate",
    validate({ params: chapterParamsSchema, body: chapterRuntimeRequestSchema }),
    async (req, res, next) => {
      const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
      const runStatus = {
        runId: `chapter-generate:${chapterId}`,
        queuedMessage: "正在准备章节生成上下文。",
        runningMessage: "章节正文已开始流式生成。",
        failedMessage: "章节生成失败。",
      };
      const disposeHeartbeat = startSSE(res, runStatus);
      try {
        const { stream, onDone } = await novelService.createChapterStream(
          id,
          chapterId,
          req.body as z.infer<typeof chapterRuntimeRequestSchema>,
        );
        await streamToSSE(res, stream, onDone, { disposeHeartbeat, runStatus });
      } catch (error) {
        const exposedError = mapBusinessError(error) ?? error;
        respondWithSSEError(res, exposedError, { disposeHeartbeat, runStatus, fallbackMessage: "章节生成失败。" });
      }
    },
  );
}
