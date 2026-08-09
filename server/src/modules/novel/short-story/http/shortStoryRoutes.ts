import type { Router } from "express";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  DeriveLongFormResponse,
  ShortStoryProjection,
  ShortStoryRevisionImpact,
} from "@ai-novel/shared/types/creationStudio";
import { validate } from "../../../../middleware/validate";
import { creationStudioService } from "../../creation-studio/application/CreationStudioService";
import { shortStoryStudioService } from "../application/ShortStoryStudioService";

const novelParams = z.object({ id: z.string().trim().min(1) });
const segmentParams = z.object({
  id: z.string().trim().min(1),
  segmentId: z.string().trim().min(1),
});
const revisionParams = z.object({
  id: z.string().trim().min(1),
  intentVersionId: z.string().trim().min(1),
});
const updateSegmentSchema = z.object({
  content: z.string().min(1).max(200000),
  expectedVersion: z.number().int().min(1),
});
const revisionPreviewSchema = z.object({
  instruction: z.string().trim().min(1).max(8000),
});
const revisionApplySchema = z.object({
  confirmed: z.literal(true),
});

export function registerShortStoryRoutes(router: Router): void {
  router.get("/:id/short-story", validate({ params: novelParams }), async (req, res, next) => {
    try {
      const data = await shortStoryStudioService.getProjection(String(req.params.id));
      res.json({ success: true, data } satisfies ApiResponse<ShortStoryProjection>);
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id/short-story/segments/:segmentId", validate({
    params: segmentParams,
    body: updateSegmentSchema,
  }), async (req, res, next) => {
    try {
      const data = await shortStoryStudioService.updateSegment(
        String(req.params.id),
        String(req.params.segmentId),
        req.body,
      );
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/short-story/revision-preview", validate({
    params: novelParams,
    body: revisionPreviewSchema,
  }), async (req, res, next) => {
    try {
      const data = await shortStoryStudioService.previewRevision(
        String(req.params.id),
        req.body.instruction,
      );
      res.json({ success: true, data } satisfies ApiResponse<ShortStoryRevisionImpact>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/short-story/retry", validate({ params: novelParams }), async (req, res, next) => {
    try {
      const data = await shortStoryStudioService.retryProduction(String(req.params.id));
      res.status(202).json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/short-story/revisions/:intentVersionId/apply", validate({
    params: revisionParams,
    body: revisionApplySchema,
  }), async (req, res, next) => {
    try {
      const data = await shortStoryStudioService.applyRevision(
        String(req.params.id),
        String(req.params.intentVersionId),
      );
      res.status(202).json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/short-story/derive-long-form", validate({ params: novelParams }), async (req, res, next) => {
    try {
      const task = await creationStudioService.createDerivedLongForm(String(req.params.id));
      const data: DeriveLongFormResponse = {
        taskId: task.taskId,
        resumeRoute: `/create?taskId=${task.taskId}`,
      };
      res.status(201).json({ success: true, data } satisfies ApiResponse<DeriveLongFormResponse>);
    } catch (error) {
      next(error);
    }
  });
}
