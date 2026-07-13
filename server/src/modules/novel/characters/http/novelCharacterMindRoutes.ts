import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { validate } from "../../../../middleware/validate";
import type { NovelApplicationServices } from "../../../../services/novel/application/NovelApplicationContracts";

const characterMindParamsSchema = z.object({
  id: z.string().trim().min(1),
  characterId: z.string().trim().min(1),
});

interface RegisterNovelCharacterMindRoutesInput {
  router: Router;
  novelService: Pick<NovelApplicationServices, "getCharacterMindState" | "refreshCharacterMindState">;
}
export function registerNovelCharacterMindRoutes(input: RegisterNovelCharacterMindRoutesInput): void {
  const { router, novelService } = input;
  router.get(
    "/:id/characters/:characterId/mind-state",
    validate({ params: characterMindParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, characterId } = req.params as z.infer<typeof characterMindParamsSchema>;
        const data = await novelService.getCharacterMindState(id, characterId);
        res.status(200).json({ success: true, data, message: "Character mind state loaded." } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/:id/characters/:characterId/mind-state/refresh",
    validate({ params: characterMindParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, characterId } = req.params as z.infer<typeof characterMindParamsSchema>;
        const data = await novelService.refreshCharacterMindState(id, characterId);
        res.status(200).json({ success: true, data, message: "Character mind state refreshed." } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
}
