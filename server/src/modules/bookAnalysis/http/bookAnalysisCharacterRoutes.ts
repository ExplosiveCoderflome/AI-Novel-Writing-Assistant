import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { llmProviderSchema } from "../../../llm/providerSchema";
import { validate } from "../../../middleware/validate";
import { bookAnalysisCharacterAppearanceService } from "../../../services/bookAnalysis/bookAnalysisCharacter/BookAnalysisCharacterAppearanceService";
import { bookAnalysisCharacterAppearanceTermService } from "../../../services/bookAnalysis/bookAnalysisCharacter/BookAnalysisCharacterAppearanceTermService";
import { bookAnalysisCharacterService } from "../../../services/bookAnalysis/bookAnalysisCharacter/BookAnalysisCharacterService";
import { bookAnalysisCharacterMediaService } from "../../../services/bookAnalysis/bookAnalysisCharacter/BookAnalysisCharacterMediaService";
import { IMAGE_SIZES } from "../../../services/image/types";

const router = Router({ mergeParams: true });

const providerSchema = llmProviderSchema;

const analysisParamsSchema = z.object({
  id: z.string().trim().min(1),
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

const analysisCharacterAppearanceSnapshotParamsSchema = z.object({
  id: z.string().trim().min(1),
  characterId: z.string().trim().min(1),
  snapshotId: z.string().trim().min(1),
});

const analysisCharacterAppearanceScanJobParamsSchema = z.object({
  id: z.string().trim().min(1),
  characterId: z.string().trim().min(1),
  jobId: z.string().trim().min(1),
});

const analysisCharacterAppearanceTermParamsSchema = z.object({
  id: z.string().trim().min(1),
  characterId: z.string().trim().min(1),
  termId: z.string().trim().min(1),
});

const characterDimensionSchema = z.enum([
  "basic",
  "appearance",
  "personality",
  "capability",
  "motivation",
  "arc",
  "relations",
  "scenes",
  "languageStyle",
  "thinkingPattern",
  "values",
  "secrets",
]);

const characterDepthSchema = z.enum(["brief", "standard", "deep", "exhaustive"]);

const characterProfileSchema = z.record(z.string(), z.unknown());

const defaultCharacterDimensions = [
  "basic",
  "appearance",
  "personality",
  "capability",
  "motivation",
  "arc",
  "relations",
  "scenes",
] as const;

const characterCreateSchema = z.object({
  name: z.string().trim().min(1).max(40),
  role: z.string().trim().min(1).max(80),
  profile: characterProfileSchema.optional(),
  generationDepth: characterDepthSchema.optional(),
  selectedDimensions: z.array(characterDimensionSchema).min(1).max(12).optional(),
});

const characterUpdateSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  role: z.string().trim().min(1).max(80).optional(),
  profile: characterProfileSchema.optional(),
  selectedDimensions: z.array(characterDimensionSchema).min(1).max(12).optional(),
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
  selectedDimensions: z.array(characterDimensionSchema).min(1).max(12).default(() => [...defaultCharacterDimensions]),
  characterNames: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
});

const characterIdentifySchema = z.object({
  limit: z.number().int().min(1).max(16).optional(),
}).default({});

const characterProfileGenerateSchema = z.object({
  generationDepth: characterDepthSchema.default("standard"),
  selectedDimensions: z.array(characterDimensionSchema).min(1).max(12).default(() => [...defaultCharacterDimensions]),
});

const characterCandidateBatchGenerateSchema = characterProfileGenerateSchema.extend({
  includeFailed: z.boolean().optional().default(true),
});

const characterImagePrepareSchema = z.object({
  provider: providerSchema.optional(),
  referenceImageAssetIds: z.array(z.string().trim().min(1)).max(6).optional(),
});

const characterImageGenerateSchema = z.object({
  provider: providerSchema.optional(),
  count: z.number().int().min(1).max(4).optional(),
  stylePreset: z.string().trim().max(120).optional(),
  promptOverride: z.string().trim().max(30000).optional(),
  negativePromptOverride: z.string().trim().max(8000).optional(),
  providerOverride: providerSchema.optional(),
  sizeOverride: z.enum(IMAGE_SIZES).optional(),
  referenceImageAssetIds: z.array(z.string().trim().min(1)).max(6).optional(),
  excludedReferenceImageUrls: z.array(z.string().trim().min(1)).max(6).optional(),
});

const characterPromoteSchema = z.object({
  includePrimaryImage: z.boolean().optional().default(true),
});

const characterAppearanceScanSchema = z.object({
  targetPercent: z.number().int().min(0).max(100),
});

const characterAppearanceTermStatusSchema = z.enum(["pending", "accepted", "rejected", "merged"]);

const characterAppearanceTermsQuerySchema = z.object({
  status: characterAppearanceTermStatusSchema.optional(),
});

const characterAppearanceTermMergeSchema = z.object({
  termIds: z.array(z.string().trim().min(1)).min(1).max(24),
});

const characterAppearanceTermUpdateSchema = z.object({
  status: z.enum(["pending", "accepted", "rejected"]),
});

router.get("/", validate({ params: analysisParamsSchema }), async (req, res, next) => {
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
  "/",
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
  "/identify",
  validate({ params: analysisParamsSchema, body: characterIdentifySchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof analysisParamsSchema>;
      const body = req.body as z.infer<typeof characterIdentifySchema>;
      const data = await bookAnalysisCharacterService.identifyCharacterCandidates(id, body);
      res.status(200).json({
        success: true,
        data,
        message: "Book analysis character candidates identified.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/generate",
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

router.post(
  "/generate-candidates",
  validate({ params: analysisParamsSchema, body: characterCandidateBatchGenerateSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof analysisParamsSchema>;
      const body = req.body as z.infer<typeof characterCandidateBatchGenerateSchema>;
      const data = await bookAnalysisCharacterService.generateAllCandidates(id, body);
      res.status(201).json({
        success: true,
        data,
        message: "Book analysis character candidate profiles generated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:characterId/generate-profile",
  validate({ params: analysisCharacterParamsSchema, body: characterProfileGenerateSchema }),
  async (req, res, next) => {
    try {
      const { id, characterId } = req.params as z.infer<typeof analysisCharacterParamsSchema>;
      const body = req.body as z.infer<typeof characterProfileGenerateSchema>;
      const data = await bookAnalysisCharacterService.generateCharacterProfile(id, characterId, body);
      res.status(201).json({
        success: true,
        data,
        message: "Book analysis character profile generated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:characterId",
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
  "/:characterId",
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
  "/:characterId/images/prepare",
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
  "/:characterId/images/generate",
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
  "/:characterId/images",
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
  "/:characterId/images/:assetId",
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
  "/:characterId/images/:assetId",
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
  "/:characterId/promote",
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

router.get(
  "/:characterId/appearance",
  validate({ params: analysisCharacterParamsSchema }),
  async (req, res, next) => {
    try {
      const { id, characterId } = req.params as z.infer<typeof analysisCharacterParamsSchema>;
      const data = await bookAnalysisCharacterAppearanceService.getAppearance(id, characterId);
      res.status(200).json({
        success: true,
        data,
        message: "Book analysis character appearance loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:characterId/appearance/terms",
  validate({ params: analysisCharacterParamsSchema, query: characterAppearanceTermsQuerySchema }),
  async (req, res, next) => {
    try {
      const { id, characterId } = req.params as z.infer<typeof analysisCharacterParamsSchema>;
      const { status } = req.query as z.infer<typeof characterAppearanceTermsQuerySchema>;
      const data = await bookAnalysisCharacterAppearanceTermService.listTerms(id, characterId, status);
      res.status(200).json({
        success: true,
        data,
        message: "Book analysis character appearance terms loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:characterId/appearance/terms/merge",
  validate({ params: analysisCharacterParamsSchema, body: characterAppearanceTermMergeSchema }),
  async (req, res, next) => {
    try {
      const { id, characterId } = req.params as z.infer<typeof analysisCharacterParamsSchema>;
      const body = req.body as z.infer<typeof characterAppearanceTermMergeSchema>;
      const data = await bookAnalysisCharacterAppearanceTermService.mergeTerms(id, characterId, body.termIds);
      res.status(200).json({
        success: true,
        data,
        message: "Book analysis character appearance terms merged.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/:characterId/appearance/terms/:termId",
  validate({ params: analysisCharacterAppearanceTermParamsSchema, body: characterAppearanceTermUpdateSchema }),
  async (req, res, next) => {
    try {
      const { id, characterId, termId } = req.params as z.infer<typeof analysisCharacterAppearanceTermParamsSchema>;
      const body = req.body as z.infer<typeof characterAppearanceTermUpdateSchema>;
      const data = await bookAnalysisCharacterAppearanceTermService.updateTermStatus(id, characterId, termId, body.status);
      res.status(200).json({
        success: true,
        data,
        message: "Book analysis character appearance term updated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:characterId/appearance/scan",
  validate({ params: analysisCharacterParamsSchema, body: characterAppearanceScanSchema }),
  async (req, res, next) => {
    try {
      const { id, characterId } = req.params as z.infer<typeof analysisCharacterParamsSchema>;
      const body = req.body as z.infer<typeof characterAppearanceScanSchema>;
      const data = await bookAnalysisCharacterAppearanceService.enqueueAppearanceScan(id, characterId, body);
      res.status(202).json({
        success: true,
        data,
        message: "Book analysis character appearance scan queued.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:characterId/appearance/scan-jobs/:jobId",
  validate({ params: analysisCharacterAppearanceScanJobParamsSchema }),
  async (req, res, next) => {
    try {
      const { id, characterId, jobId } = req.params as z.infer<typeof analysisCharacterAppearanceScanJobParamsSchema>;
      const data = bookAnalysisCharacterAppearanceService.getAppearanceScanJob(jobId);
      if (!data || data.analysisId !== id || data.characterId !== characterId) {
        res.status(404).json({
          success: false,
          error: "Book analysis character appearance scan job not found.",
        } satisfies ApiResponse<null>);
        return;
      }
      res.status(200).json({
        success: true,
        data,
        message: "Book analysis character appearance scan job loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:characterId/appearance/snapshots/:snapshotId/images/prepare",
  validate({ params: analysisCharacterAppearanceSnapshotParamsSchema, body: characterImagePrepareSchema }),
  async (req, res, next) => {
    try {
      const { id, characterId, snapshotId } = req.params as z.infer<typeof analysisCharacterAppearanceSnapshotParamsSchema>;
      const body = req.body as z.infer<typeof characterImagePrepareSchema>;
      const data = await bookAnalysisCharacterMediaService.prepareAppearanceSnapshotImage(id, characterId, snapshotId, body);
      res.status(200).json({
        success: true,
        data,
        message: "Book analysis character appearance image preview prepared.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:characterId/appearance/snapshots/:snapshotId/images/generate",
  validate({ params: analysisCharacterAppearanceSnapshotParamsSchema, body: characterImageGenerateSchema }),
  async (req, res, next) => {
    try {
      const { id, characterId, snapshotId } = req.params as z.infer<typeof analysisCharacterAppearanceSnapshotParamsSchema>;
      const body = req.body as z.infer<typeof characterImageGenerateSchema>;
      const data = await bookAnalysisCharacterMediaService.generateAppearanceSnapshotImage(id, characterId, snapshotId, {
        provider: body.provider,
        count: body.count,
        stylePreset: body.stylePreset,
        overrides: {
          promptOverride: body.promptOverride,
          negativePromptOverride: body.negativePromptOverride,
          providerOverride: body.providerOverride,
          sizeOverride: body.sizeOverride,
          excludedReferenceImageUrls: body.excludedReferenceImageUrls,
        },
        referenceImageAssetIds: body.referenceImageAssetIds,
      });
      res.status(202).json({
        success: true,
        data,
        message: "Book analysis character appearance image generation queued.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export const bookAnalysisCharacterRouter = router;
