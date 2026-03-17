import type { Router } from "express";
import { z } from "zod";
import { streamToSSE } from "../llm/streaming";
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
  forwardBusinessError: (error: unknown, next: (err?: unknown) => void) => boolean;
}

export function registerNovelChapterGenerationRoutes(input: RegisterNovelChapterGenerationRoutesInput): void {
  const {
    router,
    novelService,
    chapterParamsSchema,
    forwardBusinessError,
  } = input;

  router.post(
    "/:id/chapters/:chapterId/runtime/run",
    validate({ params: chapterParamsSchema, body: chapterRuntimeRequestSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const { stream, onDone } = await novelService.createChapterRuntimeStream(
          id,
          chapterId,
          req.body as z.infer<typeof chapterRuntimeRequestSchema>,
        );
        await streamToSSE(res, stream, onDone);
      } catch (error) {
        if (forwardBusinessError(error, next)) {
          return;
        }
        next(error);
      }
    },
  );

  router.post(
    "/:id/chapters/:chapterId/generate",
    validate({ params: chapterParamsSchema, body: chapterRuntimeRequestSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const { stream, onDone } = await novelService.createChapterStream(
          id,
          chapterId,
          req.body as z.infer<typeof chapterRuntimeRequestSchema>,
        );
        await streamToSSE(res, stream, onDone);
      } catch (error) {
        if (forwardBusinessError(error, next)) {
          return;
        }
        next(error);
      }
    },
  );
}
