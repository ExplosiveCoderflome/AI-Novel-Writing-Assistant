import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { validate } from "../../../middleware/validate";
import { ComicProjectService } from "../../../services/comic/ComicProjectService";
import { ComicEpisodePlanService } from "../../../services/comic/ComicEpisodePlanService";
import { ComicPanelScriptService } from "../../../services/comic/ComicPanelScriptService";
import { comicPanelImageService } from "../../../services/comic/ComicPanelImageService";

const comicProjectService = new ComicProjectService();
const comicEpisodePlanService = new ComicEpisodePlanService();
const comicPanelScriptService = new ComicPanelScriptService();

const router = Router();

// ─── Param schemas ─────────────────────────────────────────────────────────

const idParams = z.object({ id: z.string().trim().min(1) });
const episodeIdParams = z.object({ episodeId: z.string().trim().min(1) });
const panelIdParams = z.object({ panelId: z.string().trim().min(1) });

// ─── Request body schemas ─────────────────────────────────────────────────

const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(120),
  sourceType: z.enum(["novel_import", "original", "text_import", "comic_import"]),
  sourceRef: z.string().trim().min(1).optional(),
  trackId: z.string().trim().max(40).optional(),
  inspiration: z.string().trim().max(4000).optional(),
  rawText: z.string().trim().max(200000).optional(),
});

const styleUpdateSchema = z.object({
  style: z.string().trim().min(1).max(120),
});

const generateOutlineSchema = z
  .object({
    startOrder: z.number().int().min(1).optional(),
    count: z.number().int().min(1).max(40).optional(),
    provider: z.string().trim().optional(),
  })
  .optional();

const sourceTextSchema = z.object({
  sourceText: z.string().max(50000),
});

const generateScriptSchema = z
  .object({
    targetPanelCount: z.number().int().min(10).max(80).optional(),
    refreshSourceText: z.boolean().optional(),
    provider: z.string().trim().optional(),
  })
  .optional();

const visualPromptSchema = z.object({
  visualPrompt: z.string().trim().min(1).max(400),
});

const dialoguesSchema = z.object({
  dialogues: z.array(z.unknown()).max(3),
});

const imageGenerateSchema = z
  .object({
    provider: z.string().trim().optional(),
  })
  .optional();

// ─── Projects ─────────────────────────────────────────────────────────────

router.get("/projects", async (_req, res, next) => {
  try {
    const data = await comicProjectService.listProjects();
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.post("/projects", validate({ body: createProjectSchema }), async (req, res, next) => {
  try {
    const data = await comicProjectService.createProject(req.body as z.infer<typeof createProjectSchema>);
    res.status(201).json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.get("/projects/:id", validate({ params: idParams }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParams>;
    const data = await comicProjectService.getProject(id);
    if (!data) {
      res.status(404).json({ success: false, error: "漫画项目不存在。" } satisfies ApiResponse<null>);
      return;
    }
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.delete("/projects/:id", validate({ params: idParams }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParams>;
    await comicProjectService.deleteProject(id);
    res.json({ success: true, data: null } satisfies ApiResponse<null>);
  } catch (err) { next(err); }
});

// ─── Source bundle ─────────────────────────────────────────────────────────

router.post("/projects/:id/source-bundle", validate({ params: idParams }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParams>;
    const data = await comicProjectService.importSourceBundle(id);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

// ─── Style ─────────────────────────────────────────────────────────────────

router.patch(
  "/projects/:id/style",
  validate({ params: idParams, body: styleUpdateSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const { style } = req.body as z.infer<typeof styleUpdateSchema>;
      const data = await comicProjectService.updateProjectStyle(id, JSON.stringify({ style }));
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

// ─── Episodes ─────────────────────────────────────────────────────────────

router.get("/projects/:id/episodes", validate({ params: idParams }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParams>;
    const data = await comicEpisodePlanService.listEpisodes(id);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.post(
  "/projects/:id/episodes/generate-outline",
  validate({ params: idParams, body: generateOutlineSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const body = (req.body ?? {}) as z.infer<typeof generateOutlineSchema>;
      const { provider, ...planInput } = body ?? {};
      const data = await comicEpisodePlanService.generateOutline(
        id,
        planInput,
        provider as Parameters<typeof comicEpisodePlanService.generateOutline>[2],
      );
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

router.get("/episodes/:episodeId", validate({ params: episodeIdParams }), async (req, res, next) => {
  try {
    const { episodeId } = req.params as z.infer<typeof episodeIdParams>;
    const data = await comicEpisodePlanService.getEpisode(episodeId);
    if (!data) {
      res.status(404).json({ success: false, error: "漫画话数不存在。" } satisfies ApiResponse<null>);
      return;
    }
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.patch(
  "/episodes/:episodeId/source-text",
  validate({ params: episodeIdParams, body: sourceTextSchema }),
  async (req, res, next) => {
    try {
      const { episodeId } = req.params as z.infer<typeof episodeIdParams>;
      const { sourceText } = req.body as z.infer<typeof sourceTextSchema>;
      const data = await comicEpisodePlanService.updateEpisodeSourceText(episodeId, sourceText);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

// ─── Panels ─────────────────────────────────────────────────────────────────

router.get("/episodes/:episodeId/panels", validate({ params: episodeIdParams }), async (req, res, next) => {
  try {
    const { episodeId } = req.params as z.infer<typeof episodeIdParams>;
    const data = await comicPanelScriptService.getPanels(episodeId);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.post(
  "/episodes/:episodeId/generate-script",
  validate({ params: episodeIdParams, body: generateScriptSchema }),
  async (req, res, next) => {
    try {
      const { episodeId } = req.params as z.infer<typeof episodeIdParams>;
      const body = (req.body ?? {}) as z.infer<typeof generateScriptSchema>;
      const { provider, ...scriptInput } = body ?? {};
      const data = await comicPanelScriptService.generatePanelScript(
        episodeId,
        scriptInput,
        provider as Parameters<typeof comicPanelScriptService.generatePanelScript>[2],
      );
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

router.get("/panels/:panelId", validate({ params: panelIdParams }), async (req, res, next) => {
  try {
    const { panelId } = req.params as z.infer<typeof panelIdParams>;
    const data = await comicPanelScriptService.getPanel(panelId);
    if (!data) {
      res.status(404).json({ success: false, error: "漫画格子不存在。" } satisfies ApiResponse<null>);
      return;
    }
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.patch(
  "/panels/:panelId/visual-prompt",
  validate({ params: panelIdParams, body: visualPromptSchema }),
  async (req, res, next) => {
    try {
      const { panelId } = req.params as z.infer<typeof panelIdParams>;
      const { visualPrompt } = req.body as z.infer<typeof visualPromptSchema>;
      const data = await comicPanelScriptService.updatePanelVisualPrompt(panelId, visualPrompt);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

router.patch(
  "/panels/:panelId/dialogues",
  validate({ params: panelIdParams, body: dialoguesSchema }),
  async (req, res, next) => {
    try {
      const { panelId } = req.params as z.infer<typeof panelIdParams>;
      const { dialogues } = req.body as z.infer<typeof dialoguesSchema>;
      const data = await comicPanelScriptService.updatePanelDialogues(panelId, dialogues);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

// ─── Panel images ──────────────────────────────────────────────────────────

router.post(
  "/panels/:panelId/image/generate",
  validate({ params: panelIdParams, body: imageGenerateSchema }),
  async (req, res, next) => {
    try {
      const { panelId } = req.params as z.infer<typeof panelIdParams>;
      const body = (req.body ?? {}) as z.infer<typeof imageGenerateSchema>;
      const data = await comicPanelImageService.generatePanelImage(
        panelId,
        body?.provider as Parameters<typeof comicPanelImageService.generatePanelImage>[1] | undefined,
      );
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

router.get("/panels/:panelId/image", validate({ params: panelIdParams }), async (req, res, next) => {
  try {
    const { panelId } = req.params as z.infer<typeof panelIdParams>;
    const data = await comicPanelImageService.getPanelImageData(panelId);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

// 图片文件服务（供前端 <img src> 使用）
router.get("/panel-images/:panelId/panel", validate({ params: panelIdParams }), async (req, res, next) => {
  try {
    const { panelId } = req.params as z.infer<typeof panelIdParams>;
    const file = await comicPanelImageService.getPanelImageFile(panelId);
    if (!file) {
      res.status(404).json({ success: false, error: "图片尚未生成。" } satisfies ApiResponse<null>);
      return;
    }
    const mimeMap: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
    res.setHeader("Content-Type", mimeMap[file.ext] ?? "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(file.buffer);
  } catch (err) { next(err); }
});

export default router;
