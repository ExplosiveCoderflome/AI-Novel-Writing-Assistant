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
  z.object({
    sceneType: z.literal("book_analysis_character"),
    sceneId: z.string().trim().min(1),
    promptMode: z.enum(["character_chain", "direct"]).optional(),
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

const promptAssistSchema = z.object({
  action: z.enum(["explain", "optimize"]),
  title: z.string().trim().max(120).optional(),
  kind: z.string().trim().max(80).optional(),
  prompt: z.string().trim().min(1).max(30000),
  negativePrompt: z.string().trim().max(8000).optional(),
  optimizationInstruction: z.string().trim().max(2000).optional(),
  provider: llmProviderSchema.optional(),
  size: z.enum(IMAGE_SIZES).optional(),
  referenceImages: z.array(z.object({
    kind: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(160),
  })).max(12).default([]),
});

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
  z.object({
    sceneType: z.literal("book_analysis_character"),
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
    } else if (body.sceneType === "book_analysis_character") {
      task = await imageGenerationService.createBookAnalysisCharacterTask({
        sceneType: "book_analysis_character",
        bookAnalysisCharacterId: body.sceneId,
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

router.post("/prompt-assist", validate({ body: promptAssistSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof promptAssistSchema>;
    const data = await imagePromptOptimizationService.assistGenerationPrompt({
      action: body.action,
      title: body.title,
      kind: body.kind,
      prompt: body.prompt,
      negativePrompt: body.negativePrompt,
      optimizationInstruction: body.optimizationInstruction,
      provider: body.provider,
      size: body.size,
      referenceImages: body.referenceImages,
    });
    res.status(200).json({
      success: true,
      data,
      message: body.action === "optimize" ? "Image prompt optimized." : "Image prompt explained.",
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
      : query.sceneType === "book_analysis_character"
        ? await imageGenerationService.listBookAnalysisCharacterAssets(query.sceneId)
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

const editSchema = z.object({
  assetId: z.string().trim().optional(),
  imageBase64: z.string().trim().optional(),
  prompt: z.string().trim().min(1),
  negativePrompt: z.string().trim().optional(),
  provider: llmProviderSchema.default("sensenova"),
  model: z.string().trim().optional(),
  size: z.enum(IMAGE_SIZES).default("1024x1024"),
});

router.get("/diagnostics", async (req, res, next) => {
  try {
    const { systemDiagnosticService } = await import("../services/image/local/SystemDiagnosticService");
    const data = await systemDiagnosticService.runDiagnostic();
    res.status(200).json({
      success: true,
      data,
      message: "System hardware diagnostics completed.",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/edit", validate({ body: editSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof editSchema>;
    let localImagePath = "";
    let isTempFile = false;

    if (body.assetId) {
      const assetFile = await imageGenerationService.getAssetFile(body.assetId).catch(() => null);
      if (assetFile?.localPath) {
        localImagePath = assetFile.localPath;
      } else {
        // Fallback: 检查是否为漫画格子的 ID
        const path = await import("path");
        const fs = await import("fs/promises");
        const { resolveGeneratedImagesRoot } = await import("../runtime/appPaths");
        const dir = path.join(resolveGeneratedImagesRoot(), "comic-panels", body.assetId);
        try {
          const entries = await fs.readdir(dir);
          const panelFile = entries.find((f) => /^panel\.(png|jpg|webp)$/i.test(f));
          if (panelFile) {
            localImagePath = path.join(dir, panelFile);
          }
        } catch {
          // ignore
        }
      }
    }

    if (!localImagePath && body.imageBase64) {
      const fs = await import("fs/promises");
      const path = await import("path");
      const crypto = await import("crypto");
      const { resolveGeneratedImagesRoot } = await import("../runtime/appPaths");

      const base64Data = body.imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      
      const tempDir = path.join(resolveGeneratedImagesRoot(), "temp");
      await fs.mkdir(tempDir, { recursive: true });
      
      localImagePath = path.join(tempDir, `edit_${crypto.randomUUID()}.png`);
      await fs.writeFile(localImagePath, buffer);
      isTempFile = true;
    }

    if (!localImagePath) {
      return res.status(400).json({ success: false, error: "Must provide either assetId or imageBase64." });
    }

    const { generateImagesByProvider, resolveImageModel } = await import("../services/image/provider");
    const resolvedModel = await resolveImageModel(body.provider, body.model);

    const result = await generateImagesByProvider({
      sceneType: "chapter_illustration",
      provider: body.provider,
      model: resolvedModel,
      prompt: body.prompt,
      negativePrompt: body.negativePrompt,
      size: body.size,
      count: 1,
      refImagePaths: [localImagePath],
    });

    const imageUrl = result.images?.[0]?.url;
    if (imageUrl) {
      // 下载生成的图片并覆写回对应的位置
      const { saveImageToDisk } = await import("../services/image/runtime/utils");
      await saveImageToDisk(imageUrl, localImagePath);

      // 如果是漫画格子，同步更新数据库状态
      if (body.assetId) {
        const { prisma } = await import("../db/prisma");
        const panel = await prisma.comicPanel.findUnique({ where: { id: body.assetId } });
        if (panel) {
          const oldState = JSON.parse(panel.imageData || "{}");
          const nextVersion = (oldState.version ?? 0) + 1;
          const newState = {
            ...oldState,
            status: "done",
            version: nextVersion,
            url: `/api/comic/panel-images/${body.assetId}/panel`,
            prompt: body.prompt,
            provider: body.provider,
            generatedAt: new Date().toISOString(),
          };
          await prisma.comicPanel.update({
            where: { id: body.assetId },
            data: { imageData: JSON.stringify(newState) },
          });
        }
      }
    }

    if (isTempFile && localImagePath) {
      const fs = await import("fs/promises");
      await fs.rm(localImagePath, { force: true }).catch(() => {});
    }

    res.status(200).json({
      success: true,
      data: result,
      message: "Image edited successfully.",
    });
  } catch (error) {
    next(error);
  }
});

export default router;

