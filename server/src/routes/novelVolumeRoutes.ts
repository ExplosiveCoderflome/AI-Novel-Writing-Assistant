import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { validate } from "../middleware/validate";
import type { NovelService } from "../services/novel/NovelService";

interface RegisterNovelVolumeRoutesInput {
  router: Router;
  novelService: NovelService;
  idParamsSchema: z.ZodType<{ id: string }>;
  volumeVersionParamsSchema: z.ZodType<{ id: string; versionId: string }>;
  volumeDiffQuerySchema: z.ZodTypeAny;
  volumeDocumentSchema: z.ZodTypeAny;
  volumeDraftSchema: z.ZodTypeAny;
  volumeImpactSchema: z.ZodTypeAny;
  volumeGenerateSchema: z.ZodTypeAny;
  volumeSyncSchema: z.ZodTypeAny;
}

export function registerNovelVolumeRoutes(input: RegisterNovelVolumeRoutesInput): void {
  const {
    router,
    novelService,
    idParamsSchema,
    volumeVersionParamsSchema,
    volumeDiffQuerySchema,
    volumeDocumentSchema,
    volumeDraftSchema,
    volumeImpactSchema,
    volumeGenerateSchema,
    volumeSyncSchema,
  } = input;

  router.get(
    "/:id/volumes",
    validate({ params: idParamsSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.getVolumes(id);
        res.status(200).json({
          success: true,
          data,
          message: "Volume workspace loaded.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.put(
    "/:id/volumes",
    validate({ params: idParamsSchema, body: volumeDocumentSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.updateVolumes(id, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Volume workspace updated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/volumes/generate",
    validate({ params: idParamsSchema, body: volumeGenerateSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.generateVolumes(id, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Volume workspace generated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/volumes/versions/draft",
    validate({ params: idParamsSchema, body: volumeDraftSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.createVolumeDraft(id, req.body as any);
        res.status(201).json({
          success: true,
          data,
          message: "Volume draft version created.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/volumes/versions/:versionId/activate",
    validate({ params: volumeVersionParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, versionId } = req.params as z.infer<typeof volumeVersionParamsSchema>;
        const data = await novelService.activateVolumeVersion(id, versionId);
        res.status(200).json({
          success: true,
          data,
          message: "Volume version activated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/volumes/versions/:versionId/freeze",
    validate({ params: volumeVersionParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, versionId } = req.params as z.infer<typeof volumeVersionParamsSchema>;
        const data = await novelService.freezeVolumeVersion(id, versionId);
        res.status(200).json({
          success: true,
          data,
          message: "Volume version frozen.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/:id/volumes/versions",
    validate({ params: idParamsSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.listVolumeVersions(id);
        res.status(200).json({
          success: true,
          data,
          message: "Volume versions loaded.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/:id/volumes/versions/:versionId/diff",
    validate({ params: volumeVersionParamsSchema, query: volumeDiffQuerySchema }),
    async (req, res, next) => {
      try {
        const { id, versionId } = req.params as z.infer<typeof volumeVersionParamsSchema>;
        const query = volumeDiffQuerySchema.parse(req.query) as { compareVersion?: number };
        const data = await novelService.getVolumeDiff(id, versionId, query.compareVersion);
        res.status(200).json({
          success: true,
          data,
          message: "Volume diff loaded.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/volumes/impact-analysis",
    validate({ params: idParamsSchema, body: volumeImpactSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.analyzeVolumeImpact(id, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Volume impact analysis completed.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/volumes/sync-chapters",
    validate({ params: idParamsSchema, body: volumeSyncSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.syncVolumeChapters(id, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Volume chapters synchronized.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/volumes/migrate-legacy",
    validate({ params: idParamsSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.migrateLegacyVolumes(id);
        res.status(200).json({
          success: true,
          data,
          message: "Legacy outline migrated to volume workspace.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
}
