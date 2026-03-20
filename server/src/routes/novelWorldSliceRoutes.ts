import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import {
  storyWorldSliceBuilderModeSchema,
  storyWorldSliceOverridesSchema,
} from "@ai-novel/shared/types/storyWorldSlice";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { NovelService } from "../services/novel/NovelService";

const llmGenerateSchema = z.object({
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic", "grok"]).optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const refreshWorldSliceSchema = llmGenerateSchema.extend({
  storyInput: z.string().trim().optional(),
  builderMode: storyWorldSliceBuilderModeSchema.optional(),
});

interface RegisterNovelWorldSliceRoutesInput {
  router: Router;
  idParamsSchema: z.ZodType<{ id: string }>;
}

export function registerNovelWorldSliceRoutes(input: RegisterNovelWorldSliceRoutesInput): void {
  const { router, idParamsSchema } = input;
  const novelService = new NovelService();

  router.get("/:id/world-slice", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.getWorldSlice(id);
      res.status(200).json({
        success: true,
        data,
        message: "Novel world slice loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:id/world-slice/refresh",
    validate({ params: idParamsSchema, body: refreshWorldSliceSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const body = req.body as z.infer<typeof refreshWorldSliceSchema>;
        const data = await novelService.refreshWorldSlice(id, body);
        res.status(200).json({
          success: true,
          data,
          message: "Novel world slice refreshed.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/:id/world-slice/overrides",
    validate({ params: idParamsSchema, body: storyWorldSliceOverridesSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.updateWorldSliceOverrides(
          id,
          req.body as z.infer<typeof storyWorldSliceOverridesSchema>,
        );
        res.status(200).json({
          success: true,
          data,
          message: "Novel world slice preferences updated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
}
