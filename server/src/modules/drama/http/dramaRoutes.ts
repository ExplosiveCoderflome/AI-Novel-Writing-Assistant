/**
 * 短剧模块 HTTP 路由（P0 骨架）
 *
 * 独立挂载于 /api/drama，与 novel 路由解耦。
 * P0 仅提供项目基础生命周期 + 内容包装配；策略/分集/台本见 P1/P2。
 */
import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { validate } from "../../../middleware/validate";
import { dramaProjectService } from "../../../services/drama/DramaProjectService";

const router = Router();

const idParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(120),
  source: z.enum(["novel_import", "original", "text_import"]),
  sourceRef: z.string().trim().min(1).optional(),
  track: z.string().trim().max(40).optional(),
  theme: z.string().trim().max(120).optional(),
  targetEpisodes: z.number().int().min(1).max(500).optional(),
  inspiration: z.string().trim().max(4000).optional(),
  rawText: z.string().trim().max(200000).optional(),
});

router.get("/projects", async (_req, res, next) => {
  try {
    const data = await dramaProjectService.listProjects();
    res.status(200).json({
      success: true,
      data,
      message: "Drama projects loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/projects",
  validate({ body: createProjectSchema }),
  async (req, res, next) => {
    try {
      const data = await dramaProjectService.createProject(req.body as z.infer<typeof createProjectSchema>);
      res.status(201).json({
        success: true,
        data,
        message: "Drama project created.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/projects/:id",
  validate({ params: idParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await dramaProjectService.getProject(id);
      if (!data) {
        res.status(404).json({
          success: false,
          error: "Drama project not found.",
        } satisfies ApiResponse<null>);
        return;
      }
      res.status(200).json({
        success: true,
        data,
        message: "Drama project loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/projects/:id/source-bundle",
  validate({ params: idParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await dramaProjectService.assembleSourceBundle(id);
      res.status(200).json({
        success: true,
        data,
        message: "Drama source bundle assembled.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
