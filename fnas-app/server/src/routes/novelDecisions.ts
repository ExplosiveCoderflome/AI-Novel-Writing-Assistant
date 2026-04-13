import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { novelDecisionService } from "../services/novel/NovelDecisionService";

const router = Router();

const novelParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const decisionParamsSchema = z.object({
  id: z.string().trim().min(1),
  decisionId: z.string().trim().min(1),
});

const decisionSchema = z.object({
  chapterId: z.string().trim().min(1).nullable().optional(),
  category: z.string().trim().min(1),
  content: z.string().trim().min(1),
  importance: z.string().trim().min(1).optional(),
  expiresAt: z.number().int().nullable().optional(),
  sourceType: z.string().trim().min(1).nullable().optional(),
  sourceRefId: z.string().trim().min(1).nullable().optional(),
});

const decisionUpdateSchema = decisionSchema.partial();

const batchInvalidateSchema = z.object({
  decisionIds: z.array(z.string().trim().min(1)).min(1).max(100),
});

router.use(authMiddleware);

router.get("/:id/creative-decisions", validate({ params: novelParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof novelParamsSchema>;
    const data = await novelDecisionService.list(id);
    res.status(200).json({
      success: true,
      data,
      message: "创作决策已加载。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:id/creative-decisions",
  validate({ params: novelParamsSchema, body: decisionSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof novelParamsSchema>;
      const data = await novelDecisionService.create(id, req.body as z.infer<typeof decisionSchema>);
      res.status(201).json({
        success: true,
        data,
        message: "创作决策已创建。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/:id/creative-decisions/:decisionId",
  validate({ params: decisionParamsSchema, body: decisionUpdateSchema }),
  async (req, res, next) => {
    try {
      const { id, decisionId } = req.params as z.infer<typeof decisionParamsSchema>;
      const data = await novelDecisionService.update(id, decisionId, req.body as z.infer<typeof decisionUpdateSchema>);
      res.status(200).json({
        success: true,
        data,
        message: "创作决策已更新。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/:id/creative-decisions/:decisionId",
  validate({ params: decisionParamsSchema }),
  async (req, res, next) => {
    try {
      const { id, decisionId } = req.params as z.infer<typeof decisionParamsSchema>;
      await novelDecisionService.remove(id, decisionId);
      res.status(200).json({
        success: true,
        message: "创作决策已删除。",
      } satisfies ApiResponse<null>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/creative-decisions/batch-invalidate",
  validate({ params: novelParamsSchema, body: batchInvalidateSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof novelParamsSchema>;
      const { decisionIds } = req.body as z.infer<typeof batchInvalidateSchema>;
      const data = await novelDecisionService.batchInvalidate(id, decisionIds);
      res.status(200).json({
        success: true,
        data,
        message: "创作决策已批量失效。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
