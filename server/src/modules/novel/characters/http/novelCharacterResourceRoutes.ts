import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { llmProviderSchema } from "../../../../llm/providerSchema";
import { validate } from "../../../../middleware/validate";
import { characterResourceApplicationService, characterResourceLedgerService } from "../../../../services/novel/characterResource";

const characterResourceCharacterParamsSchema = z.object({
  id: z.string().trim().min(1),
  characterId: z.string().trim().min(1),
});

const characterResourceChapterParamsSchema = z.object({
  id: z.string().trim().min(1),
  chapterId: z.string().trim().min(1),
});

const characterResourceProposalParamsSchema = z.object({
  id: z.string().trim().min(1),
  proposalId: z.string().trim().min(1),
});

const resourceLlmOptionsSchema = z.object({
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const resourceExtractionSchema = resourceLlmOptionsSchema.default({});

const resourceBackfillSchema = resourceLlmOptionsSchema.extend({
  limit: z.number().int().min(1).max(10).optional(),
}).default({});

interface RegisterNovelCharacterResourceRoutesInput {
  router: Router;
  idParamsSchema: z.ZodType<{ id: string }>;
}

export function registerNovelCharacterResourceRoutes(
  input: RegisterNovelCharacterResourceRoutesInput,
): void {
  const { router, idParamsSchema } = input;

  router.get(
    "/:id/character-resources",
    validate({ params: idParamsSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await characterResourceApplicationService.getLedger(id);
        res.status(200).json({
          success: true,
          data,
          message: "角色关键资源已加载。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/:id/characters/:characterId/resources",
    validate({ params: characterResourceCharacterParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, characterId } = req.params as z.infer<typeof characterResourceCharacterParamsSchema>;
        const data = await characterResourceLedgerService.listCharacterResources(id, characterId);
        res.status(200).json({
          success: true,
          data,
          message: "角色资源已加载。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/:id/chapters/:chapterId/resource-context",
    validate({ params: characterResourceChapterParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof characterResourceChapterParamsSchema>;
        const data = await characterResourceLedgerService.getChapterResourceContext(id, chapterId);
        res.status(200).json({
          success: true,
          data,
          message: "本章关键资源已加载。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/chapters/:chapterId/resources/extract",
    validate({ params: characterResourceChapterParamsSchema, body: resourceExtractionSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof characterResourceChapterParamsSchema>;
        const body = resourceExtractionSchema.parse(req.body);
        const data = await characterResourceApplicationService.extractChapter(id, chapterId, body);
        res.status(200).json({
          success: true,
          data,
          message: "资源变化已提取，低风险变化会用于后续写作。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/character-resources/backfill",
    validate({ params: idParamsSchema, body: resourceBackfillSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const body = resourceBackfillSchema.parse(req.body);
        const data = await characterResourceApplicationService.backfill(id, body);
        res.status(200).json({
          success: true,
          data,
          message: "最近章节资源已回填。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/character-resource-proposals/:proposalId/confirm",
    validate({ params: characterResourceProposalParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, proposalId } = req.params as z.infer<typeof characterResourceProposalParamsSchema>;
        const data = await characterResourceApplicationService.confirmProposal(id, proposalId);
        res.status(200).json({
          success: true,
          data,
          message: "资源变更已确认，后续写作会参考它。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/character-resource-proposals/:proposalId/reject",
    validate({ params: characterResourceProposalParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, proposalId } = req.params as z.infer<typeof characterResourceProposalParamsSchema>;
        const data = await characterResourceApplicationService.rejectProposal(id, proposalId);
        res.status(200).json({
          success: true,
          data,
          message: "资源变更已忽略，不会影响后续写作。",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
}
