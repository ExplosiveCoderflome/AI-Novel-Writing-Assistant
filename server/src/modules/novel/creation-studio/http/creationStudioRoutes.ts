import { Router } from "express";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  CreationStudioTaskProjection,
} from "@ai-novel/shared/types/creationStudio";
import { authMiddleware } from "../../../../middleware/auth";
import { validate } from "../../../../middleware/validate";
import {
  creationStudioService,
  type CreationStudioConfirmationResult,
} from "../application/CreationStudioService";

const router = Router();
router.use(authMiddleware);

const taskParamsSchema = z.object({ taskId: z.string().trim().min(1) });
const writingPlatformSchema = z.enum(["fanqie_free", "qidian_male", "jinjiang_female", "zhihu_story"]);
const writingPlatformPreferenceSchema = z.union([z.literal("ai_recommend"), writingPlatformSchema]);
const interpretSchema = z.object({
  idea: z.string().trim().min(1).max(12000),
  preferredNarrativeForm: z.enum(["short_story", "long_novel"]).optional(),
  targetWordCount: z.number().int().min(3000).max(3_000_000).optional(),
  writingPlatformPreference: writingPlatformPreferenceSchema.optional(),
});
const regenerateSchema = z.object({
  narrativeForm: z.enum(["short_story", "long_novel"]),
  targetWordCount: z.number().int().min(3000).max(3_000_000),
  feedback: z.string().trim().max(4000).optional(),
  writingPlatformPreference: writingPlatformPreferenceSchema.optional(),
});
const confirmSchema = z.object({
  directionId: z.string().trim().min(1).max(80),
  narrativeForm: z.enum(["short_story", "long_novel"]),
  targetWordCount: z.number().int().min(3000).max(3_000_000),
  idempotencyKey: z.string().trim().min(8).max(160),
  writingPlatform: writingPlatformSchema,
});

router.post("/interpret", validate({ body: interpretSchema }), async (req, res, next) => {
  try {
    const data = await creationStudioService.interpret(req.body);
    res.status(201).json({ success: true, data } satisfies ApiResponse<CreationStudioTaskProjection>);
  } catch (error) {
    next(error);
  }
});

router.get("/:taskId", validate({ params: taskParamsSchema }), async (req, res, next) => {
  try {
    const data = await creationStudioService.getProjection(String(req.params.taskId));
    res.json({ success: true, data } satisfies ApiResponse<CreationStudioTaskProjection>);
  } catch (error) {
    next(error);
  }
});

router.post("/:taskId/regenerate", validate({
  params: taskParamsSchema,
  body: regenerateSchema,
}), async (req, res, next) => {
  try {
    const data = await creationStudioService.regenerate(String(req.params.taskId), req.body);
    res.json({ success: true, data } satisfies ApiResponse<CreationStudioTaskProjection>);
  } catch (error) {
    next(error);
  }
});

router.post("/:taskId/confirm", validate({
  params: taskParamsSchema,
  body: confirmSchema,
}), async (req, res, next) => {
  try {
    const data = await creationStudioService.confirm(String(req.params.taskId), req.body);
    res.json({ success: true, data } satisfies ApiResponse<CreationStudioConfirmationResult>);
  } catch (error) {
    next(error);
  }
});

export default router;
