import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import type { NovelService } from "../services/novel/NovelService";

interface RegisterNovelChapterEditorRoutesInput {
  router: Router;
  novelService: NovelService;
  chapterParamsSchema: z.ZodType<{ id: string; chapterId: string }>;
  rewritePreviewSchema: z.ZodTypeAny;
  forwardBusinessError: (error: unknown, next: (err?: unknown) => void) => boolean;
}

export function registerNovelChapterEditorRoutes(input: RegisterNovelChapterEditorRoutesInput): void {
  const {
    router,
    novelService,
    chapterParamsSchema,
    rewritePreviewSchema,
    forwardBusinessError,
  } = input;

  router.post(
    "/:id/chapters/:chapterId/editor/rewrite-preview",
    validate({ params: chapterParamsSchema, body: rewritePreviewSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.previewChapterRewrite(id, chapterId, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Chapter editor rewrite preview generated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        if (forwardBusinessError(error, next)) {
          return;
        }
        if (
          error instanceof Error
          && [
            "小说不存在。",
            "章节不存在。",
            "当前章节正文为空，无法发起局部改写。",
            "选区范围无效，请重新选择后再试。",
            "选中文本不能为空。",
            "选中文本已发生变化，请重新选择后再试。",
            "AI 未返回足够的候选版本，请重试。",
          ].includes(error.message)
        ) {
          next(new AppError(error.message, 400));
          return;
        }
        next(error);
      }
    },
  );
}
