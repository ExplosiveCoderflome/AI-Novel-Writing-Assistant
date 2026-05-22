import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { ImageAsset, ImageGenerationTask } from "@ai-novel/shared/types/image";
import { z } from "zod";
import { llmProviderSchema } from "../llm/providerSchema";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { imageGenerationService } from "../services/image/ImageGenerationService";
import { imagePromptOptimizationService } from "../services/image/ImagePromptOptimizationService";
import {
  IMAGE_PROMPT_OUTPUT_LANGUAGES,
  IMAGE_SIZES,
} from "../services/image/types";

const router = Router();

const baseGenerateSchema = {
  prompt: z.string().trim().min(1),
  negativePrompt: z.string().trim().optional(),
  stylePreset: z.string().trim().optional(),
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  size: z.enum(IMAGE_SIZES).optional(),
  count: z.number().int().min(1).max(4).optional(),
  seed: z.number().int().min(0).optional(),
  maxRetries: z.number().int().min(0).max(3).optional(),
} as const;

const generateSchema = z.discriminatedUnion("sceneType", [
  z.object({
    sceneType: z.literal("character"),
    sceneId: z.string().trim().min(1),
    promptMode: z.enum(["character_chain", "direct"]).optional(),
    ...baseGenerateSchema,
  }),
  z.object({
    sceneType: z.literal("novel_cover"),
    sceneId: z.string().trim().min(1),
    promptMode: z.enum(["novel_cover_chain", "direct"]).optional(),
    ...baseGenerateSchema,
  }),
]);

const optimizePromptSchema = z.discriminatedUnion("sceneType", [
  z.object({
    sceneType: z.literal("character"),
    sceneId: z.string().trim().min(1),
    sourcePrompt: z.string().trim().min(1),
    stylePreset: z.string().trim().optional(),
    outputLanguage: z.enum(IMAGE_PROMPT_OUTPUT_LANGUAGES).default("zh"),
  }),
  z.object({
    sceneType: z.literal("novel_cover"),
    sceneId: z.string().trim().min(1),
    sourcePrompt: z.string().trim().min(1),
    stylePreset: z.string().trim().optional(),
    outputLanguage: z.enum(IMAGE_PROMPT_OUTPUT_LANGUAGES).default("zh"),
  }),
]);

const taskParamsSchema = z.object({
  taskId: z.string().trim().min(1),
});

const assetQuerySchema = z.discriminatedUnion("sceneType", [
  z.object({
    sceneType: z.literal("character"),
    sceneId: z.string().trim().min(1),
  }),
  z.object({
    sceneType: z.literal("novel_cover"),
    sceneId: z.string().trim().min(1),
  }),
]);

const assetParamsSchema = z.object({
  assetId: z.string().trim().min(1),
});

router.use(authMiddleware);

router.post("/generate", validate({ body: generateSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof generateSchema>;
    let task: ImageGenerationTask;
    if (body.sceneType === "character") {
      task = await imageGenerationService.createCharacterTask({
        sceneType: "character",
        baseCharacterId: body.sceneId,
        prompt: body.prompt,
        promptMode: body.promptMode,
        negativePrompt: body.negativePrompt,
        stylePreset: body.stylePreset,
        provider: body.provider,
        model: body.model,
        size: body.size,
        count: body.count,
        seed: body.seed,
        maxRetries: body.maxRetries,
      });
    } else {
      task = await imageGenerationService.createNovelCoverTask({
        sceneType: "novel_cover",
        novelId: body.sceneId,
        prompt: body.prompt,
        promptMode: body.promptMode,
        negativePrompt: body.negativePrompt,
        stylePreset: body.stylePreset,
        provider: body.provider,
        model: body.model,
        size: body.size,
        count: body.count,
        seed: body.seed,
        maxRetries: body.maxRetries,
      });
    }
    res.status(202).json({
      success: true,
      data: task,
      message: "Image generation task queued.",
    } satisfies ApiResponse<typeof task>);
  } catch (error) {
    next(error);
  }
});

router.post("/optimize-prompt", validate({ body: optimizePromptSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof optimizePromptSchema>;
    const data = body.sceneType === "character"
      ? await imagePromptOptimizationService.optimizeCharacterPrompt({
        sceneType: "character",
        baseCharacterId: body.sceneId,
        sourcePrompt: body.sourcePrompt,
        stylePreset: body.stylePreset,
        outputLanguage: body.outputLanguage,
      })
      : await imagePromptOptimizationService.optimizeNovelCoverPrompt({
        sceneType: "novel_cover",
        novelId: body.sceneId,
        sourcePrompt: body.sourcePrompt,
        stylePreset: body.stylePreset,
        outputLanguage: body.outputLanguage,
      });
    res.status(200).json({
      success: true,
      data,
      message: "Image prompt optimized.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/tasks/:taskId", validate({ params: taskParamsSchema }), async (req, res, next) => {
  try {
    const { taskId } = req.params as z.infer<typeof taskParamsSchema>;
    const data = await imageGenerationService.getTask(taskId);
    res.status(200).json({
      success: true,
      data,
      message: "Task fetched.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/assets", validate({ query: assetQuerySchema }), async (req, res, next) => {
  try {
    const query = req.query as z.infer<typeof assetQuerySchema>;
    const data: ImageAsset[] = query.sceneType === "character"
      ? await imageGenerationService.listCharacterAssets(query.sceneId)
      : await imageGenerationService.listNovelCoverAssets(query.sceneId);
    res.status(200).json({
      success: true,
      data,
      message: "Assets fetched.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/assets/:assetId/file", validate({ params: assetParamsSchema }), async (req, res, next) => {
  try {
    const { assetId } = req.params as z.infer<typeof assetParamsSchema>;
    const data = await imageGenerationService.getAssetFile(assetId);
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (data.mimeType) {
      res.type(data.mimeType);
    }
    if (data.localPath) {
      res.sendFile(data.localPath);
      return;
    }
    if (data.stream) {
      data.stream.on("error", next);
      data.stream.pipe(res);
      return;
    }
    next(new Error("Image asset file was not found."));
  } catch (error) {
    next(error);
  }
});

router.delete("/assets/:assetId", validate({ params: assetParamsSchema }), async (req, res, next) => {
  try {
    const { assetId } = req.params as z.infer<typeof assetParamsSchema>;
    const data = await imageGenerationService.deleteAsset(assetId);
    res.status(200).json({
      success: true,
      data,
      message: "Image asset deleted.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/assets/:assetId/set-primary", validate({ params: assetParamsSchema }), async (req, res, next) => {
  try {
    const { assetId } = req.params as z.infer<typeof assetParamsSchema>;
    const data = await imageGenerationService.setPrimaryAsset(assetId);
    res.status(200).json({
      success: true,
      data,
      message: "Primary image updated.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

export default router;
