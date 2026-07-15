import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { validate } from "../../../../middleware/validate";
import type { NovelApplicationServices } from "../../../../services/novel/application/NovelApplicationContracts";

const dialogueCharacterParamsSchema = z.object({
  id: z.string().trim().min(1),
  characterId: z.string().trim().min(1),
});
const dialogueSessionParamsSchema = dialogueCharacterParamsSchema.extend({
  sessionId: z.string().trim().min(1),
});
const dialogueTurnBodySchema = z.object({
  message: z.string().trim().min(1).max(800),
});

interface RegisterNovelCharacterDialogueRoutesInput {
  router: Router;
  novelService: Pick<
    NovelApplicationServices,
    "getActiveCharacterDialogueSession" | "startCharacterDialogueSession" | "sendCharacterDialogueTurn" | "activateCharacterDialogueInfluence" | "dismissCharacterDialogueInfluence"
  >;
}

export function registerNovelCharacterDialogueRoutes(input: RegisterNovelCharacterDialogueRoutesInput): void {
  const { router, novelService } = input;
  router.get(
    "/:id/characters/:characterId/dialogue-sessions/active",
    validate({ params: dialogueCharacterParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, characterId } = req.params as z.infer<typeof dialogueCharacterParamsSchema>;
        const data = await novelService.getActiveCharacterDialogueSession(id, characterId);
        res.status(200).json({ success: true, data, message: "Character dialogue session loaded." } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/:id/characters/:characterId/dialogue-sessions",
    validate({ params: dialogueCharacterParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, characterId } = req.params as z.infer<typeof dialogueCharacterParamsSchema>;
        const data = await novelService.startCharacterDialogueSession(id, characterId);
        res.status(201).json({ success: true, data, message: "Character dialogue session started." } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/:id/characters/:characterId/dialogue-sessions/:sessionId/turns",
    validate({ params: dialogueSessionParamsSchema, body: dialogueTurnBodySchema }),
    async (req, res, next) => {
      try {
        const { id, characterId, sessionId } = req.params as z.infer<typeof dialogueSessionParamsSchema>;
        const data = await novelService.sendCharacterDialogueTurn(id, characterId, sessionId, req.body.message);
        res.status(200).json({ success: true, data, message: "Character dialogue turn completed." } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/:id/characters/:characterId/dialogue-sessions/:sessionId/influence/activate",
    validate({ params: dialogueSessionParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, characterId, sessionId } = req.params as z.infer<typeof dialogueSessionParamsSchema>;
        const data = await novelService.activateCharacterDialogueInfluence(id, characterId, sessionId);
        res.status(200).json({ success: true, data, message: "Dialogue influence activated." } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/:id/characters/:characterId/dialogue-sessions/:sessionId/influence/dismiss",
    validate({ params: dialogueSessionParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, characterId, sessionId } = req.params as z.infer<typeof dialogueSessionParamsSchema>;
        const data = await novelService.dismissCharacterDialogueInfluence(id, characterId, sessionId);
        res.status(200).json({ success: true, data, message: "Dialogue influence dismissed." } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
}
