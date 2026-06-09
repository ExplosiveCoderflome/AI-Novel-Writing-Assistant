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
import { dramaStrategyService } from "../../../services/drama/DramaStrategyService";
import { dramaEpisodeOutlineService } from "../../../services/drama/DramaEpisodeOutlineService";
import { rhythmEngine } from "../../../services/drama/engine/rhythmEngine";

const router = Router();

const llmOptionsSchema = z
  .object({
    provider: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .optional();

const outlineRequestSchema = z
  .object({
    startOrder: z.number().int().min(1).optional(),
    count: z.number().int().min(1).max(40).optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .optional();

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

// 赛道库（供前端选赛道）
router.get("/tracks", (_req, res) => {
  res.status(200).json({
    success: true,
    data: rhythmEngine.listTracks(),
    message: "Drama tracks loaded.",
  });
});

// 钩子类型库
router.get("/hooks", (_req, res) => {
  res.status(200).json({
    success: true,
    data: rhythmEngine.listHooks(),
    message: "Drama hooks loaded.",
  });
});

// 生成改编策略
router.post(
  "/projects/:id/strategy",
  validate({ params: idParamsSchema, body: llmOptionsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await dramaStrategyService.generateStrategy(id, (req.body ?? {}) as never);
      res.status(200).json({
        success: true,
        data,
        message: "Drama strategy generated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

// 生成分集大纲
router.post(
  "/projects/:id/outline",
  validate({ params: idParamsSchema, body: outlineRequestSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const body = (req.body ?? {}) as {
        startOrder?: number;
        count?: number;
      };
      const data = await dramaEpisodeOutlineService.generateOutline(
        id,
        { startOrder: body.startOrder, count: body.count },
        (req.body ?? {}) as never,
      );
      res.status(200).json({
        success: true,
        data,
        message: "Drama episode outline generated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
