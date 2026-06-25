import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { llmProviderSchema } from "../llm/providerSchema";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { bookAnalysisService } from "../services/bookAnalysis/BookAnalysisService";
import { bookAnalysisCharacterService } from "../services/bookAnalysis/bookAnalysisCharacter/BookAnalysisCharacterService";
import { bookAnalysisCharacterMediaService } from "../services/bookAnalysis/bookAnalysisCharacter/BookAnalysisCharacterMediaService";
import { IMAGE_SIZES } from "../services/image/types";

const router = Router();

const providerSchema = llmProviderSchema;
const bookAnalysisStatusSchema = z.enum(["draft", "queued", "running", "succeeded", "failed", "cancelled", "archived"]);
const sectionKeySchema = z.enum([
  "overview",
  "plot_structure",
  "timeline",
  "character_system",
  "worldbuilding",
  "themes",
  "style_technique",
  "market_highlights",
]);

const analysisParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const analysisSectionParamsSchema = z.object({
  id: z.string().trim().min(1),
  sectionKey: sectionKeySchema,
});

const analysisCharacterParamsSchema = z.object({
  id: z.string().trim().min(1),
  characterId: z.string().trim().min(1),
});

const analysisCharacterImageParamsSchema = z.object({
  id: z.string().trim().min(1),
  characterId: z.string().trim().min(1),
  assetId: z.string().trim().min(1),
});

const listQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  status: bookAnalysisStatusSchema.optional(),
  documentId: z.string().trim().optional(),
});


const sourceRangeSchema = z.object({
  startChapterIndex: z.number().int().min(0),
  endChapterIndex: z.number().int().min(0),
}).refine((value) => value.endChapterIndex >= value.startChapterIndex, {
  message: "End chapter must be greater than or equal to start chapter.",
});
const createSchema = z.object({
  documentId: z.string().trim().min(1),
  versionId: z.string().trim().optional(),
  provider: providerSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(256).max(32768).optional(),
  userFocusInstruction: z.string().trim().optional(),
  sourceRange: sourceRangeSchema.nullable().optional(),
  includeTimeline: z.boolean().optional().default(false),
  enabledSectionKeys: z.array(sectionKeySchema).min(1).optional(),
});

const publishSchema = z.object({
  novelId: z.string().trim().min(1),
});

const sectionUpdateSchema = z.object({
  editedContent: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  focusInstruction: z.string().nullable().optional(),
  frozen: z.boolean().optional(),
}).refine(
  (value) =>
    value.editedContent !== undefined ||
    value.notes !== undefined ||
    value.focusInstruction !== undefined ||
    value.frozen !== undefined,
  {
    message: "At least one field must be provided.",
  },
);

const sectionRegenerateSchema = z.object({
  focusInstruction: z.string().nullable().optional(),
});

const sectionOptimizePreviewSchema = z.object({
  currentDraft: z.string(),
  instruction: z.string().trim().min(1),
});

const statusUpdateSchema = z.object({
  status: z.enum(["archived"]),
});

const exportQuerySchema = z.object({
  format: z.enum(["markdown", "json"]).default("markdown"),
});

const characterDimensionSchema = z.enum([
  "basic",
  "appearance",
  "personality",
  "motivation",
  "arc",
  "relations",
  "scenes",
]);

const characterDepthSchema = z.enum(["quick", "standard", "deep"]);

const characterProfileSchema = z.record(z.string(), z.unknown());

const characterCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  role: z.string().trim().min(1).max(80),
  profile: characterProfileSchema.optional(),
  generationDepth: characterDepthSchema.optional(),
  selectedDimensions: z.array(characterDimensionSchema).min(1).max(7).optional(),
});

const characterUpdateSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  role: z.string().trim().min(1).max(80).optional(),
  profile: characterProfileSchema.optional(),
  selectedDimensions: z.array(characterDimensionSchema).min(1).max(7).optional(),
}).refine(
  (value) =>
    value.name !== undefined ||
    value.role !== undefined ||
    value.profile !== undefined ||
    value.selectedDimensions !== undefined,
  {
    message: "At least one field must be provided.",
  },
);

const characterGenerateSchema = z.object({
  generationDepth: characterDepthSchema.default("standard"),
  selectedDimensions: z.array(characterDimensionSchema).min(1).max(7).default([
    "basic",
    "appearance",
    "personality",
    "motivation",
    "arc",
    "relations",
    "scenes",
  ]),
  characterNames: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
});

const characterImagePrepareSchema = z.object({
  provider: providerSchema.optional(),
});

const characterImageGenerateSchema = z.object({
  provider: providerSchema.optional(),
  count: z.number().int().min(1).max(4).optional(),
  stylePreset: z.string().trim().max(120).optional(),
  promptOverride: z.string().trim().max(30000).optional(),
  negativePromptOverride: z.string().trim().max(8000).optional(),
  providerOverride: providerSchema.optional(),
  sizeOverride: z.enum(IMAGE_SIZES).optional(),
});

const characterPromoteSchema = z.object({
  includePrimaryImage: z.boolean().optional().default(true),
});

router.use(authMiddleware);

router.get("/", validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const data = await bookAnalysisService.listAnalyses(query);
    res.status(200).json({
      success: true,
      data,
      message: "Book analyses loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/", validate({ body: createSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createSchema>;
    const data = await bookAnalysisService.createAnalysis(body);
    res.status(201).json({
      success: true,
      data,
      message: "Book analysis created.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", validate({ params: analysisParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof analysisParamsSchema>;
    const data = await bookAnalysisService.getAnalysisById(id);
    if (!data) {
      res.status(404).json({
        success: false,
        error: "Book analysis not found.",
      } satisfies ApiResponse<null>);
      return;
    }
    res.status(200).json({
      success: true,
      data,
      message: "Book analysis loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/characters", validate({ params: analysisParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof analysisParamsSchema>;
    const data = await bookAnalysisCharacterService.listCharacters(id);
    res.status(200).json({
      success: true,
      data,
      message: "Book analysis characters loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:id/characters",
  validate({ params: analysisParamsSchema, body: characterCreateSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof analysisParamsSchema>;
      const body = req.body as z.infer<typeof characterCreateSchema>;
      const data = await bookAnalysisCharacterService.createCharacter(id, body);
      res.status(201).json({
        success: true,
        data,
        message: "Book analysis character created.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/characters/generate",
  validate({ params: analysisParamsSchema, body: characterGenerateSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof analysisParamsSchema>;
      const body = req.body as z.infer<typeof characterGenerateSchema>;
      const data = await bookAnalysisCharacterService.generateCharacters(id, body);
      res.status(201).json({
        success: true,
        data,
        message: "Book analysis characters generated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:id/characters/:characterId",
  validate({ params: analysisCharacterParamsSchema, body: characterUpdateSchema }),
  async (req, res, next) => {
    try {
      const { id, characterId } = req.params as z.infer<typeof analysisCharacterParamsSchema>;
      const body = req.body as z.infer<typeof characterUpdateSchema>;
      const data = await bookAnalysisCharacterService.updateCharacter(id, characterId, body);
      res.status(200).json({
        success: true,
        data,
        message: "Book analysis character updated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/:id/characters/:characterId",
  validate({ params: analysisCharacterParamsSchema }),
  async (req, res, next) => {
    try {
      const { id, characterId } = req.params as z.infer<typeof analysisCharacterParamsSchema>;
      await bookAnalysisCharacterService.deleteCharacter(id, characterId);
      res.status(200).json({
        success: true,
        data: null,
        message: "Book analysis character deleted.",
      } satisfies ApiResponse<null>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/characters/:characterId/images/prepare",
  validate({ params: analysisCharacterParamsSchema, body: characterImagePrepareSchema }),
  async (req, res, next) => {
    try {
      const { id, characterId } = req.params as z.infer<typeof analysisCharacterParamsSchema>;
      const body = req.body as z.infer<typeof characterImagePrepareSchema>;
      const data = await bookAnalysisCharacterMediaService.prepareImage(id, characterId, body);
      res.status(200).json({
        success: true,
        data,
        message: "Book analysis character image preview prepared.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/characters/:characterId/images/generate",
  validate({ params: analysisCharacterParamsSchema, body: characterImageGenerateSchema }),
  async (req, res, next) => {
    try {
      const { id, characterId } = req.params as z.infer<typeof analysisCharacterParamsSchema>;
      const body = req.body as z.infer<typeof characterImageGenerateSchema>;
      const data = await bookAnalysisCharacterMediaService.generateImage(id, characterId, {
        provider: body.provider,
        count: body.count,
        stylePreset: body.stylePreset,
        overrides: {
          promptOverride: body.promptOverride,
          negativePromptOverride: body.negativePromptOverride,
          providerOverride: body.providerOverride,
          sizeOverride: body.sizeOverride,
        },
      });
      res.status(202).json({
        success: true,
        data,
        message: "Book analysis character image generation queued.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:id/characters/:characterId/images",
  validate({ params: analysisCharacterParamsSchema }),
  async (req, res, next) => {
    try {
      const { id, characterId } = req.params as z.infer<typeof analysisCharacterParamsSchema>;
      const data = await bookAnalysisCharacterMediaService.listImages(id, characterId);
      res.status(200).json({
        success: true,
        data,
        message: "Book analysis character images loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:id/characters/:characterId/images/:assetId",
  validate({ params: analysisCharacterImageParamsSchema }),
  async (req, res, next) => {
    try {
      const { id, characterId, assetId } = req.params as z.infer<typeof analysisCharacterImageParamsSchema>;
      const data = await bookAnalysisCharacterMediaService.setPrimaryImage(id, characterId, assetId);
      res.status(200).json({
        success: true,
        data,
        message: "Book analysis character primary image updated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/:id/characters/:characterId/images/:assetId",
  validate({ params: analysisCharacterImageParamsSchema }),
  async (req, res, next) => {
    try {
      const { id, characterId, assetId } = req.params as z.infer<typeof analysisCharacterImageParamsSchema>;
      const data = await bookAnalysisCharacterMediaService.deleteImage(id, characterId, assetId);
      res.status(200).json({
        success: true,
        data,
        message: "Book analysis character image deleted.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/characters/:characterId/promote",
  validate({ params: analysisCharacterParamsSchema, body: characterPromoteSchema }),
  async (req, res, next) => {
    try {
      const { id, characterId } = req.params as z.infer<typeof analysisCharacterParamsSchema>;
      const body = req.body as z.infer<typeof characterPromoteSchema>;
      const data = await bookAnalysisCharacterMediaService.promoteToBaseCharacter(id, characterId, body);
      res.status(201).json({
        success: true,
        data,
        message: "Book analysis character promoted to base character.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post("/:id/rebuild", validate({ params: analysisParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof analysisParamsSchema>;
    const data = await bookAnalysisService.rebuildAnalysis(id);
    res.status(202).json({
      success: true,
      data,
      message: "Book analysis rebuild queued.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/copy", validate({ params: analysisParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof analysisParamsSchema>;
    const data = await bookAnalysisService.copyAnalysis(id);
    res.status(201).json({
      success: true,
      data,
      message: "Book analysis copied.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:id/publish",
  validate({ params: analysisParamsSchema, body: publishSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof analysisParamsSchema>;
      const body = req.body as z.infer<typeof publishSchema>;
      const data = await bookAnalysisService.publishToNovelKnowledge(id, body.novelId);
      res.status(200).json({
        success: true,
        data,
        message: "Book analysis published to novel knowledge.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/sections/:sectionKey/optimize-preview",
  validate({ params: analysisSectionParamsSchema, body: sectionOptimizePreviewSchema }),
  async (req, res, next) => {
    try {
      const { id, sectionKey } = req.params as z.infer<typeof analysisSectionParamsSchema>;
      const body = req.body as z.infer<typeof sectionOptimizePreviewSchema>;
      const data = await bookAnalysisService.optimizeSectionPreview(id, sectionKey, body);
      res.status(200).json({
        success: true,
        data,
        message: "Book analysis section optimize preview generated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/sections/:sectionKey/regenerate",
  validate({ params: analysisSectionParamsSchema, body: sectionRegenerateSchema }),
  async (req, res, next) => {
    try {
      const { id, sectionKey } = req.params as z.infer<typeof analysisSectionParamsSchema>;
      const body = req.body as z.infer<typeof sectionRegenerateSchema>;
      const data = await bookAnalysisService.regenerateSection(id, sectionKey, body);
      res.status(202).json({
        success: true,
        data,
        message: "Book analysis section regeneration queued.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:id/sections/:sectionKey",
  validate({ params: analysisSectionParamsSchema, body: sectionUpdateSchema }),
  async (req, res, next) => {
    try {
      const { id, sectionKey } = req.params as z.infer<typeof analysisSectionParamsSchema>;
      const body = req.body as z.infer<typeof sectionUpdateSchema>;
      const data = await bookAnalysisService.updateSection(id, sectionKey, body);
      res.status(200).json({
        success: true,
        data,
        message: "Book analysis section updated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:id",
  validate({ params: analysisParamsSchema, body: statusUpdateSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof analysisParamsSchema>;
      const body = req.body as z.infer<typeof statusUpdateSchema>;
      const data = await bookAnalysisService.updateAnalysisStatus(id, body.status);
      res.status(200).json({
        success: true,
        data,
        message: "Book analysis updated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get("/:id/export", validate({ params: analysisParamsSchema, query: exportQuerySchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof analysisParamsSchema>;
    const query = exportQuerySchema.parse(req.query);
    const data = await bookAnalysisService.buildExportContent(id, query.format);
    res.setHeader("Content-Type", data.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(data.fileName)}"`);
    res.status(200).send(data.content);
  } catch (error) {
    next(error);
  }
});

export default router;
