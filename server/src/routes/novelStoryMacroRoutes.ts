import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { StoryMacroPlanService } from "../services/novel/storyMacro/StoryMacroPlanService";

const llmGenerateSchema = z.object({
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic", "grok"]).optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const storyMacroFieldSchema = z.enum([
  "selling_point",
  "core_conflict",
  "main_hook",
  "growth_path",
  "major_payoffs",
  "ending_flavor",
]);

const storyMacroFieldParamsSchema = z.object({
  id: z.string().trim().min(1),
  field: storyMacroFieldSchema,
});

const storyMacroDecomposeSchema = llmGenerateSchema.extend({
  storyInput: z.string().trim().min(1),
});

const storyMacroBuildSchema = llmGenerateSchema;

const storyMacroUpdateSchema = z.object({
  storyInput: z.string().trim().nullable().optional(),
  decomposition: z.object({
    selling_point: z.string().trim().optional(),
    core_conflict: z.string().trim().optional(),
    main_hook: z.string().trim().optional(),
    growth_path: z.string().trim().optional(),
    major_payoffs: z.array(z.string().trim().min(1)).min(1).max(5).optional(),
    ending_flavor: z.string().trim().optional(),
  }).optional(),
  lockedFields: z.object({
    selling_point: z.boolean().optional(),
    core_conflict: z.boolean().optional(),
    main_hook: z.boolean().optional(),
    growth_path: z.boolean().optional(),
    major_payoffs: z.boolean().optional(),
    ending_flavor: z.boolean().optional(),
  }).optional(),
});

const storyMacroStateUpdateSchema = z.object({
  currentPhase: z.number().int().min(0).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  protagonistState: z.string().trim().optional(),
});

interface RegisterNovelStoryMacroRoutesInput {
  router: Router;
  idParamsSchema: z.ZodType<{ id: string }>;
}

export function registerNovelStoryMacroRoutes(input: RegisterNovelStoryMacroRoutesInput): void {
  const { router, idParamsSchema } = input;
  const storyMacroService = new StoryMacroPlanService();

  router.get("/:id/story-macro", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await storyMacroService.getPlan(id);
      res.status(200).json({
        success: true,
        data,
        message: "Story macro plan loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:id/story-macro/decompose",
    validate({ params: idParamsSchema, body: storyMacroDecomposeSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const body = req.body as z.infer<typeof storyMacroDecomposeSchema>;
        const data = await storyMacroService.decompose(id, body.storyInput, body);
        res.status(200).json({
          success: true,
          data,
          message: "Story decomposition completed.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/story-macro/constraint/build",
    validate({ params: idParamsSchema, body: storyMacroBuildSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await storyMacroService.buildConstraintEngine(id);
        res.status(200).json({
          success: true,
          data,
          message: "Story constraint engine built.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/:id/story-macro",
    validate({ params: idParamsSchema, body: storyMacroUpdateSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await storyMacroService.updatePlan(id, req.body as z.infer<typeof storyMacroUpdateSchema>);
        res.status(200).json({
          success: true,
          data,
          message: "Story macro plan updated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/story-macro/fields/:field/regenerate",
    validate({ params: storyMacroFieldParamsSchema, body: llmGenerateSchema }),
    async (req, res, next) => {
      try {
        const { id, field } = req.params as z.infer<typeof storyMacroFieldParamsSchema>;
        const data = await storyMacroService.regenerateField(id, field, req.body as z.infer<typeof llmGenerateSchema>);
        res.status(200).json({
          success: true,
          data,
          message: "Story macro field regenerated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/:id/story-macro/state", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await storyMacroService.getState(id);
      res.status(200).json({
        success: true,
        data,
        message: "Story macro state loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.patch(
    "/:id/story-macro/state",
    validate({ params: idParamsSchema, body: storyMacroStateUpdateSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await storyMacroService.updateState(id, req.body as z.infer<typeof storyMacroStateUpdateSchema>);
        res.status(200).json({
          success: true,
          data,
          message: "Story macro state updated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
}
