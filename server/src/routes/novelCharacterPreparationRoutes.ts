import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { validate } from "../middleware/validate";
import type { NovelService } from "../services/novel/NovelService";
import {
  supplementalCharacterCandidateSchema,
  supplementalCharacterGenerationInputSchema,
} from "../prompting/prompts/novel/characterPreparation.promptSchemas";

const optionParamsSchema = z.object({
  id: z.string().trim().min(1),
  optionId: z.string().trim().min(1),
});

const castOptionGenerateSchema = z.object({
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic", "grok", "kimi", "glm", "qwen", "gemini"]).optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
  storyInput: z.string().trim().max(4000).optional(),
});

interface RegisterNovelCharacterPreparationRoutesInput {
  router: Router;
  novelService: NovelService;
  idParamsSchema: z.ZodType<{ id: string }>;
}

export function registerNovelCharacterPreparationRoutes(
  input: RegisterNovelCharacterPreparationRoutesInput,
): void {
  const { router, novelService, idParamsSchema } = input;

  router.get("/:id/character-relations", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.listCharacterRelations(id);
      res.status(200).json({
        success: true,
        data,
        message: "角色关系列表已加载。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/character-prep/cast-options", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.listCharacterCastOptions(id);
      res.status(200).json({
        success: true,
        data,
        message: "角色阵容方案已加载。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:id/character-prep/cast-options/generate",
    validate({ params: idParamsSchema, body: castOptionGenerateSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const body = req.body as z.infer<typeof castOptionGenerateSchema>;
        const data = await novelService.generateCharacterCastOptions(id, body);
        res.status(200).json({
          success: true,
          data,
          message: "角色阵容方案已生成。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/character-prep/cast-options/:optionId/apply",
    validate({ params: optionParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, optionId } = req.params as z.infer<typeof optionParamsSchema>;
        const data = await novelService.applyCharacterCastOption(id, optionId);
        res.status(200).json({
          success: true,
          data,
          message: "角色阵容方案已应用。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/character-prep/supplemental-characters/generate",
    validate({ params: idParamsSchema, body: supplementalCharacterGenerationInputSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.generateSupplementalCharacters(id, req.body as z.infer<typeof supplementalCharacterGenerationInputSchema>);
        res.status(200).json({
          success: true,
          data,
          message: "补充角色候选已生成。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/character-prep/supplemental-characters/apply",
    validate({ params: idParamsSchema, body: supplementalCharacterCandidateSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.applySupplementalCharacter(id, req.body as z.infer<typeof supplementalCharacterCandidateSchema>);
        res.status(200).json({
          success: true,
          data,
          message: "补充角色已创建。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete(
    "/:id/character-prep/cast-options/:optionId",
    validate({ params: optionParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, optionId } = req.params as z.infer<typeof optionParamsSchema>;
        const data = await novelService.deleteCharacterCastOption(id, optionId);
        res.status(200).json({
          success: true,
          data,
          message: "角色阵容方案已删除。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.delete("/:id/character-prep/cast-options", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.clearCharacterCastOptions(id);
      res.status(200).json({
        success: true,
        data,
        message: "角色阵容方案已清空。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });
}
