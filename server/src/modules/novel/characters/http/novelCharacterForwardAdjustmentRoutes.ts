import type { Router } from "express";
import type { ZodType } from "zod";
import { characterForwardApplySchema, type CharacterForwardApply } from "@ai-novel/shared/types/characterForwardAdjustment";
import { validate } from "../../../../middleware/validate";
import {
  applyCharacterForwardAdjustment, previewCharacterForwardAdjustment,
} from "../../../../services/novel/characters/forwardAdjustments/CharacterForwardAdjustmentService";

export function registerNovelCharacterForwardAdjustmentRoutes(router: Router, params: ZodType<{ id: string; charId: string }>) {
  const path = "/:id/characters/:charId/forward-adjust";
  router.get(`${path}/preview`, validate({ params }), async (req, res) => {
    const { id, charId } = req.params as { id: string; charId: string };
    const data = await previewCharacterForwardAdjustment(id, charId);
    res.json({ success: true, data });
  });
  router.post(path, validate({ params, body: characterForwardApplySchema }), async (req, res) => {
    const { id, charId } = req.params as { id: string; charId: string };
    const data = await applyCharacterForwardAdjustment(id, charId, req.body as CharacterForwardApply);
    res.json({ success: true, data });
  });
}
