import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { validate } from "../middleware/validate";
import type { NovelService } from "../services/novel/NovelService";

interface RegisterNovelStorylineRoutesInput {
  router: Router;
  novelService: NovelService;
  idParamsSchema: z.ZodType<{ id: string }>;
  storylineVersionParamsSchema: z.ZodType<{ id: string; versionId: string }>;
  storylineDiffQuerySchema: z.ZodTypeAny;
  storylineDraftSchema: z.ZodTypeAny;
  storylineImpactSchema: z.ZodTypeAny;
}

export function registerNovelStorylineRoutes(input: RegisterNovelStorylineRoutesInput): void {
  const {
    router,
    novelService,
    idParamsSchema,
    storylineVersionParamsSchema,
    storylineDiffQuerySchema,
    storylineDraftSchema,
    storylineImpactSchema,
  } = input;

  router.get(
    "/:id/storyline/versions",
    validate({ params: idParamsSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.listStorylineVersions(id);
        res.status(200).json({
          success: true,
          data,
          message: "Storyline versions loaded.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/storyline/versions/draft",
    validate({ params: idParamsSchema, body: storylineDraftSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.createStorylineDraft(id, req.body as any);
        res.status(201).json({
          success: true,
          data,
          message: "Storyline draft created.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/storyline/versions/:versionId/activate",
    validate({ params: storylineVersionParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, versionId } = req.params as z.infer<typeof storylineVersionParamsSchema>;
        const data = await novelService.activateStorylineVersion(id, versionId);
        res.status(200).json({
          success: true,
          data,
          message: "Storyline version activated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/storyline/versions/:versionId/freeze",
    validate({ params: storylineVersionParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, versionId } = req.params as z.infer<typeof storylineVersionParamsSchema>;
        const data = await novelService.freezeStorylineVersion(id, versionId);
        res.status(200).json({
          success: true,
          data,
          message: "Storyline version frozen.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/:id/storyline/versions/:versionId/diff",
    validate({ params: storylineVersionParamsSchema, query: storylineDiffQuerySchema }),
    async (req, res, next) => {
      try {
        const { id, versionId } = req.params as z.infer<typeof storylineVersionParamsSchema>;
        const query = storylineDiffQuerySchema.parse(req.query) as { compareVersion?: number };
        const data = await novelService.getStorylineDiff(id, versionId, query.compareVersion);
        res.status(200).json({
          success: true,
          data,
          message: "Storyline diff loaded.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/storyline/impact-analysis",
    validate({ params: idParamsSchema, body: storylineImpactSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.analyzeStorylineImpact(id, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Storyline impact analysis completed.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
}
