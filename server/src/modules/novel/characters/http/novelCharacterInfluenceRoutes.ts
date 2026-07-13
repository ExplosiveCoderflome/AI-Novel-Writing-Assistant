import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { validate } from "../../../../middleware/validate";
import type { NovelApplicationServices } from "../../../../services/novel/application/NovelApplicationContracts";

const influenceParamsSchema = z.object({
  id: z.string().trim().min(1),
  characterId: z.string().trim().min(1),
});
const influenceProposalParamsSchema = influenceParamsSchema.extend({
  proposalId: z.string().trim().min(1),
});
const acceptInfluenceProposalBodySchema = z.object({
  authorIntent: z.string().trim().min(1).max(160).optional(),
});

interface RegisterNovelCharacterInfluenceRoutesInput {
  router: Router;
  novelService: Pick<
    NovelApplicationServices,
    "listCharacterInfluenceProposals" | "generateCharacterInfluenceProposals" | "acceptCharacterInfluenceProposal" | "dismissCharacterInfluenceProposal"
  >;
}

export function registerNovelCharacterInfluenceRoutes(input: RegisterNovelCharacterInfluenceRoutesInput): void {
  const { router, novelService } = input;
  router.get(
    "/:id/characters/:characterId/influence-proposals",
    validate({ params: influenceParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, characterId } = req.params as z.infer<typeof influenceParamsSchema>;
        const data = await novelService.listCharacterInfluenceProposals(id, characterId);
        res.status(200).json({ success: true, data, message: "Character influence proposals loaded." } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/:id/characters/:characterId/influence-proposals/generate",
    validate({ params: influenceParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, characterId } = req.params as z.infer<typeof influenceParamsSchema>;
        const data = await novelService.generateCharacterInfluenceProposals(id, characterId);
        res.status(201).json({ success: true, data, message: "Character influence proposals generated." } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/:id/characters/:characterId/influence-proposals/:proposalId/accept",
    validate({ params: influenceProposalParamsSchema, body: acceptInfluenceProposalBodySchema }),
    async (req, res, next) => {
      try {
        const { id, characterId, proposalId } = req.params as z.infer<typeof influenceProposalParamsSchema>;
        const data = await novelService.acceptCharacterInfluenceProposal(id, characterId, proposalId, req.body);
        res.status(200).json({ success: true, data, message: "Character influence proposal accepted." } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/:id/characters/:characterId/influence-proposals/:proposalId/dismiss",
    validate({ params: influenceProposalParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, characterId, proposalId } = req.params as z.infer<typeof influenceProposalParamsSchema>;
        const data = await novelService.dismissCharacterInfluenceProposal(id, characterId, proposalId);
        res.status(200).json({ success: true, data, message: "Character influence proposal dismissed." } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
}
