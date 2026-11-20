import { Router } from "express";
import { z } from "zod";
import { impactGenerateSchema, impactSubmissionSchema } from "@ai-novel/shared/types/outlineCharacterImpact";
import { AppError } from "../../../../middleware/errorHandler";
import { prisma } from "../../../../db/prisma";
import { CharacterImpactService } from "./CharacterImpactService";

const router = Router({mergeParams: true});
const service = new CharacterImpactService(prisma);
const selection = z.object({characterId: z.string().min(1), baseVersion: z.coerce.number().int().positive()});
const route = (action: (projectId: string, input: unknown) => Promise<unknown>, created = false): import("express").RequestHandler =>
  async (req, res, next) => {
    try {
      const data = await action(String(req.params.id), req.method === "GET" ? req.query : req.body);
      res.status(created ? 201 : 200).json({success: true, data});
    } catch (error) { next(error instanceof z.ZodError ? new AppError("人物联动请求格式有误。", 400, error.issues) : error); }
  };

router.get("/context", route((id, input) => {
  const {characterId, baseVersion} = selection.parse(input);
  return service.context(id, characterId, baseVersion);
}));
router.get("/proposals", route((id, input) => {
  const {characterId, baseVersion} = selection.parse(input);
  return service.pending(id, characterId, baseVersion);
}));
router.post("/generate", route((id, input) => service.generate(id, impactGenerateSchema.parse(input)), true));
router.post("/proposals", route((id, input) => service.submit(id, impactSubmissionSchema.parse(input)), true));
export default router;
