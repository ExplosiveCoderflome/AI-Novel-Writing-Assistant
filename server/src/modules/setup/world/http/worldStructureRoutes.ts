import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { WorldLayerKey, WorldStructureSectionKey } from "@ai-novel/shared/types/world";
import { z } from "zod";
import { validate } from "../../../../middleware/validate";
import {
  consistencyCheckSchema,
  consistencyIssuePatchSchema,
  deepeningAnswerSchema,
  deepeningQuestionSchema,
  issueIdSchema,
  layerGenerateSchema,
  layerParamsSchema,
  layerUpdateSchema,
  requireWorldWizard,
  structureBackfillSchema,
  structureGenerateSchema,
  structureUpdateSchema,
  suggestAxiomsSchema,
  updateAxiomsSchema,
  worldIdSchema,
  worldService,
} from "./worldHttpContext";

export function registerStructureWorldRoutes(router: Router): void {
  router.get("/:id/structure", requireWorldWizard, validate({ params: worldIdSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof worldIdSchema>;
      const data = await worldService.getStructure(id);
      res.status(200).json({
        success: true,
        data,
        message: "Structured world loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.put(
    "/:id/structure",
    requireWorldWizard,
    validate({ params: worldIdSchema, body: structureUpdateSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof worldIdSchema>;
        const data = await worldService.updateStructure(id, req.body as z.infer<typeof structureUpdateSchema>);
        res.status(200).json({
          success: true,
          data,
          message: "Structured world saved.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/structure/backfill",
    requireWorldWizard,
    validate({ params: worldIdSchema, body: structureBackfillSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof worldIdSchema>;
        const data = await worldService.backfillStructure(id, req.body as z.infer<typeof structureBackfillSchema>);
        res.status(200).json({
          success: true,
          data,
          message: "Structured world backfilled.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/structure/generate",
    requireWorldWizard,
    validate({ params: worldIdSchema, body: structureGenerateSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof worldIdSchema>;
        const data = await worldService.generateStructure(id, req.body as z.infer<typeof structureGenerateSchema> & {
          section: WorldStructureSectionKey;
        });
        res.status(200).json({
          success: true,
          data,
          message: "Structure section generated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post("/:id/axioms/suggest", requireWorldWizard, validate({ params: worldIdSchema, body: suggestAxiomsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof worldIdSchema>;
      const data = await worldService.suggestAxioms(id, req.body as z.infer<typeof suggestAxiomsSchema>);
      res.status(200).json({
        success: true,
        data,
        message: "Axioms suggested.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id/axioms", requireWorldWizard, validate({ params: worldIdSchema, body: updateAxiomsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof worldIdSchema>;
      const { axioms } = req.body as z.infer<typeof updateAxiomsSchema>;
      const data = await worldService.updateAxioms(id, axioms);
      res.status(200).json({
        success: true,
        data,
        message: "Axioms updated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/:id/layers/generate-all",
    requireWorldWizard,
    validate({ params: worldIdSchema, body: layerGenerateSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof worldIdSchema>;
        const data = await worldService.generateAllLayers(id, req.body as z.infer<typeof layerGenerateSchema>);
        res.status(200).json({
          success: true,
          data,
          message: "All layers generated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/layers/:layerKey/generate",
    requireWorldWizard,
    validate({ params: layerParamsSchema, body: layerGenerateSchema }),
    async (req, res, next) => {
      try {
        const { id, layerKey } = req.params as z.infer<typeof layerParamsSchema>;
        const data = await worldService.generateLayer(
          id,
          layerKey as WorldLayerKey,
          req.body as z.infer<typeof layerGenerateSchema>,
        );
        res.status(200).json({
          success: true,
          data,
          message: "Layer generated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.put("/:id/layers/:layerKey", requireWorldWizard, validate({ params: layerParamsSchema, body: layerUpdateSchema }), async (req, res, next) => {
    try {
      const { id, layerKey } = req.params as z.infer<typeof layerParamsSchema>;
      const data = await worldService.updateLayer(
        id,
        layerKey as WorldLayerKey,
        req.body as z.infer<typeof layerUpdateSchema>,
      );
      res.status(200).json({
        success: true,
        data,
        message: "Layer updated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/layers/:layerKey/confirm", requireWorldWizard, validate({ params: layerParamsSchema }), async (req, res, next) => {
    try {
      const { id, layerKey } = req.params as z.infer<typeof layerParamsSchema>;
      const data = await worldService.confirmLayer(id, layerKey as WorldLayerKey);
      res.status(200).json({
        success: true,
        data,
        message: "Layer confirmed.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/deepening/questions", requireWorldWizard, validate({ params: worldIdSchema, body: deepeningQuestionSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof worldIdSchema>;
      const data = await worldService.createDeepeningQuestions(id, req.body as z.infer<typeof deepeningQuestionSchema>);
      res.status(200).json({
        success: true,
        data,
        message: "Deepening questions generated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/deepening/answers", requireWorldWizard, validate({ params: worldIdSchema, body: deepeningAnswerSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof worldIdSchema>;
      const { answers } = req.body as z.infer<typeof deepeningAnswerSchema>;
      const data = await worldService.answerDeepeningQuestions(id, answers);
      res.status(200).json({
        success: true,
        data,
        message: "Answers integrated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/consistency/check", requireWorldWizard, validate({ params: worldIdSchema, body: consistencyCheckSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof worldIdSchema>;
      const data = await worldService.checkConsistency(id, req.body as z.infer<typeof consistencyCheckSchema>);
      res.status(200).json({
        success: true,
        data,
        message: "Consistency checked.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });

  router.patch(
    "/:id/consistency/issues/:issueId",
    requireWorldWizard,
    validate({ params: issueIdSchema, body: consistencyIssuePatchSchema }),
    async (req, res, next) => {
      try {
        const { id, issueId } = req.params as z.infer<typeof issueIdSchema>;
        const { status } = req.body as z.infer<typeof consistencyIssuePatchSchema>;
        const data = await worldService.updateConsistencyIssueStatus(id, issueId, status);
        res.status(200).json({
          success: true,
          data,
          message: "Issue status updated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/:id/overview", requireWorldWizard, validate({ params: worldIdSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof worldIdSchema>;
      const data = await worldService.getOverview(id);
      res.status(200).json({
        success: true,
        data,
        message: "Overview loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });
}
