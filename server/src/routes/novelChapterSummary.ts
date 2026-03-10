import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { NovelChapterSummaryService } from "../services/novel/NovelChapterSummaryService";

const router = Router();
const novelChapterSummaryService = new NovelChapterSummaryService();

const chapterParamsSchema = z.object({
  id: z.string().trim().min(1),
  chapterId: z.string().trim().min(1),
});

const llmGenerateSchema = z.object({
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic", "grok"]).optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

router.use(authMiddleware);

router.post(
  "/:id/chapters/:chapterId/summary/generate",
  validate({ params: chapterParamsSchema, body: llmGenerateSchema }),
  async (req, res, next) => {
    try {
      const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
      const data = await novelChapterSummaryService.generateChapterSummary(
        id,
        chapterId,
        req.body as z.infer<typeof llmGenerateSchema>,
      );
      res.status(200).json({
        success: true,
        data,
        message: "章节摘要生成成功。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
