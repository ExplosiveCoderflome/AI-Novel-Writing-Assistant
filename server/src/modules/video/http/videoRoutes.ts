/**
 * 视频改编 API 路由
 *
 * 挂载在 /api/video 下，提供视频项目的 CRUD、脚本生成、渲染和 Bridge 连通性接口。
 */
import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { validate } from "../../../middleware/validate";
import { videoProjectService } from "../../../services/video/VideoProjectService";
import { videoScriptService } from "../../../services/video/VideoScriptService";
import { videoRenderService } from "../../../services/video/VideoRenderService";
import { prisma } from "../../../db/prisma";

const router = Router();

const idParamsSchema = z.object({ id: z.string().trim().min(1) });

const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(120),
  novelId: z.string().trim().min(1).optional(),
  chapterIds: z.array(z.string().trim().min(1)).optional(),
  sourceType: z.enum(["chapter_adaptation", "trailer", "custom"]).optional(),
  pipeline: z.string().trim().max(60).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const scriptOptionsSchema = z
  .object({
    provider: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    targetDurationSec: z.number().int().min(10).max(600).optional(),
    visualStyle: z.string().trim().max(60).optional(),
  })
  .optional();

// ── 项目 CRUD ─────────────────────────────────────────────

router.get("/projects", async (req, res, next) => {
  try {
    const novelId = typeof req.query.novelId === "string" ? req.query.novelId : undefined;
    const data = await videoProjectService.listProjects(novelId);
    res.status(200).json({
      success: true,
      data,
      message: "Video projects loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/projects", validate({ body: createProjectSchema }), async (req, res, next) => {
  try {
    const data = await videoProjectService.createProject(req.body as z.infer<typeof createProjectSchema>);
    res.status(201).json({
      success: true,
      data,
      message: "Video project created.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/projects/:id", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await videoProjectService.getProject(id);
    if (!data) {
      res.status(404).json({ success: false, error: "Video project not found." } satisfies ApiResponse<null>);
      return;
    }
    res.status(200).json({
      success: true,
      data,
      message: "Video project loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.delete("/projects/:id", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    await videoProjectService.deleteProject(id);
    res.status(200).json({
      success: true,
      data: null,
      message: "Video project deleted.",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

// ── 脚本生成 ──────────────────────────────────────────────

router.post(
  "/projects/:id/script",
  validate({ params: idParamsSchema, body: scriptOptionsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await videoScriptService.generateScript(id, (req.body ?? {}) as never);
      res.status(200).json({
        success: true,
        data,
        message: "Video script generated.",
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── 渲染 ──────────────────────────────────────────────────

router.post(
  "/projects/:id/render",
  validate({ params: idParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await videoRenderService.submitRender(id);
      res.status(200).json({
        success: true,
        data,
        message: "Render task submitted.",
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/projects/:id/render/status",
  validate({ params: idParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await videoRenderService.checkRenderStatus(id);
      res.status(200).json({
        success: true,
        data,
        message: "Render status loaded.",
      });
    } catch (error) {
      next(error);
    }
  },
);

// ── Bridge 连通性 ─────────────────────────────────────────

router.get("/bridge/health", async (_req, res, next) => {
  try {
    const data = await videoRenderService.checkBridgeHealth();
    res.status(200).json({
      success: true,
      data,
      message: "Bridge health checked.",
    });
  } catch (error) {
    next(error);
  }
});

router.get("/bridge/recommend-pipeline", async (req, res, next) => {
  try {
    const contentType = typeof req.query.contentType === "string"
      ? req.query.contentType
      : "chapter_adaptation";
    const data = await videoRenderService.recommendPipeline(contentType);
    res.status(200).json({
      success: true,
      data,
      message: "Pipeline recommendation loaded.",
    });
  } catch (error) {
    next(error);
  }
});

// ── Offline Settings ──────────────────────────────────────

router.get("/offline-settings", async (_req, res, next) => {
  try {
    const [offlineMode, ollamaModel, sdUrl, ttsUrl] = await Promise.all([
      prisma.appSetting.findUnique({ where: { key: "video.offlineMode" } }),
      prisma.appSetting.findUnique({ where: { key: "video.ollamaModel" } }),
      prisma.appSetting.findUnique({ where: { key: "video.sdUrl" } }),
      prisma.appSetting.findUnique({ where: { key: "video.ttsUrl" } }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        offlineMode: offlineMode?.value === "true",
        ollamaModel: ollamaModel?.value || "deepseek-r1:8b",
        sdUrl: sdUrl?.value || "http://127.0.0.1:7860",
        ttsUrl: ttsUrl?.value || "http://127.0.0.1:8000/v1",
      },
      message: "Offline settings loaded.",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/offline-settings", async (req, res, next) => {
  try {
    const { offlineMode, ollamaModel, sdUrl, ttsUrl } = req.body || {};

    const updates = [];
    if (offlineMode !== undefined) {
      updates.push(
        prisma.appSetting.upsert({
          where: { key: "video.offlineMode" },
          update: { value: String(offlineMode) },
          create: { key: "video.offlineMode", value: String(offlineMode) },
        })
      );
    }
    if (ollamaModel !== undefined) {
      updates.push(
        prisma.appSetting.upsert({
          where: { key: "video.ollamaModel" },
          update: { value: String(ollamaModel) },
          create: { key: "video.ollamaModel", value: String(ollamaModel) },
        })
      );
    }
    if (sdUrl !== undefined) {
      updates.push(
        prisma.appSetting.upsert({
          where: { key: "video.sdUrl" },
          update: { value: String(sdUrl) },
          create: { key: "video.sdUrl", value: String(sdUrl) },
        })
      );
    }
    if (ttsUrl !== undefined) {
      updates.push(
        prisma.appSetting.upsert({
          where: { key: "video.ttsUrl" },
          update: { value: String(ttsUrl) },
          create: { key: "video.ttsUrl", value: String(ttsUrl) },
        })
      );
    }

    if (updates.length > 0) {
      await Promise.all(updates);
    }

    res.status(200).json({
      success: true,
      message: "Offline settings saved.",
    });
  } catch (error) {
    next(error);
  }
});

export default router;
