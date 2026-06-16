import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { z } from "zod";
import { validate } from "../../../middleware/validate";
import { ComicProjectService } from "../../../services/comic/ComicProjectService";
import { ComicEpisodePlanService } from "../../../services/comic/ComicEpisodePlanService";
import { ComicPanelScriptService } from "../../../services/comic/ComicPanelScriptService";
import { comicPanelImageService } from "../../../services/comic/ComicPanelImageService";
import { comicBubbleLayoutService } from "../../../services/comic/ComicBubbleLayoutService";
import { comicExportService } from "../../../services/comic/ComicExportService";
import { comicCharacterImageService } from "../../../services/comic/ComicCharacterImageService";
import { comicBatchOrchestrator } from "../../../services/comic/ComicBatchOrchestrator";

const comicProjectService = new ComicProjectService();
const comicEpisodePlanService = new ComicEpisodePlanService();
const comicPanelScriptService = new ComicPanelScriptService();

const router = Router();

// ─── Param schemas ─────────────────────────────────────────────────────────

const idParams = z.object({ id: z.string().trim().min(1) });
const episodeIdParams = z.object({ episodeId: z.string().trim().min(1) });
const panelIdParams = z.object({ panelId: z.string().trim().min(1) });
const charIdParams = z.object({ charId: z.string().trim().min(1) });
const charSheetVersionParams = z.object({ charId: z.string().trim().min(1), version: z.coerce.number().int().min(1) });

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

const presetUpdateSchema = z.object({
  format: z.string().trim().min(1).max(60).optional(),
  style: z.string().trim().max(120).optional(),
  promptKeywords: z.string().trim().max(400).optional(),
  imageSize: z.string().trim().max(20).optional(),
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

// ─── Preset (format + style) ──────────────────────────────────────────────

router.patch(
  "/projects/:id/preset",
  validate({ params: idParams, body: presetUpdateSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParams>;
      const patch = req.body as z.infer<typeof presetUpdateSchema>;
      const data = await comicProjectService.updateProjectPreset(id, patch);
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

// ─── Character sheet images ───────────────────────────────────────────────────

const charSheetGenerateSchema = z
  .object({
    provider: z.string().trim().optional(),
    prompt: z.string().trim().max(4000).optional(),
    useCurrentImageAsReference: z.boolean().optional(),
    lockAppearance: z.boolean().optional(),
    appearanceOverride: z.string().trim().max(1000).optional(),
  })
  .optional();
const charExpressionGenerateSchema = z.object({ provider: z.string().trim().optional() }).optional();

router.post(
  "/characters/:charId/sheet/generate",
  validate({ params: charIdParams, body: charSheetGenerateSchema }),
  async (req, res, next) => {
    try {
      const { charId } = req.params as z.infer<typeof charIdParams>;
      const body = (req.body ?? {}) as z.infer<typeof charSheetGenerateSchema>;
      const data = await comicCharacterImageService.generateCharacterSheet(
        charId,
        body?.provider as Parameters<typeof comicCharacterImageService.generateCharacterSheet>[1] | undefined,
        {
          prompt: body?.prompt,
          useCurrentImageAsReference: body?.useCurrentImageAsReference,
          lockAppearance: body?.lockAppearance,
          appearanceOverride: body?.appearanceOverride,
        },
      );
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

router.get("/characters/:charId/sheet", validate({ params: charIdParams }), async (req, res, next) => {
  try {
    const { charId } = req.params as z.infer<typeof charIdParams>;
    const data = await comicCharacterImageService.getSheetData(charId);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.post(
  "/characters/:charId/expressions/generate",
  validate({ params: charIdParams, body: charExpressionGenerateSchema }),
  async (req, res, next) => {
    try {
      const { charId } = req.params as z.infer<typeof charIdParams>;
      const body = (req.body ?? {}) as z.infer<typeof charExpressionGenerateSchema>;
      const data = await comicCharacterImageService.generateExpressionSheet(
        charId,
        body?.provider as Parameters<typeof comicCharacterImageService.generateExpressionSheet>[1] | undefined,
      );
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

router.get("/characters/:charId/expressions", validate({ params: charIdParams }), async (req, res, next) => {
  try {
    const { charId } = req.params as z.infer<typeof charIdParams>;
    const data = await comicCharacterImageService.getExpressionData(charId);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

// 设计稿图片文件（供 <img src> 直接访问）
router.get("/character-images/:charId/sheet", validate({ params: charIdParams }), async (req, res, next) => {
  try {
    const { charId } = req.params as z.infer<typeof charIdParams>;
    const file = await comicCharacterImageService.resolveSheetFile(charId);
    if (!file) {
      res.status(404).json({ success: false, error: "设计稿尚未生成。" } satisfies ApiResponse<null>);
      return;
    }
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(await import("fs/promises").then((fs) => fs.readFile(file.filePath)));
  } catch (err) { next(err); }
});

router.get("/character-images/:charId/expressions", validate({ params: charIdParams }), async (req, res, next) => {
  try {
    const { charId } = req.params as z.infer<typeof charIdParams>;
    const file = await comicCharacterImageService.resolveExpressionFile(charId);
    if (!file) {
      res.status(404).json({ success: false, error: "表情设计稿尚未生成。" } satisfies ApiResponse<null>);
      return;
    }
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(await import("fs/promises").then((fs) => fs.readFile(file.filePath)));
  } catch (err) { next(err); }
});

router.get("/character-images/:charId/face", validate({ params: charIdParams }), async (req, res, next) => {
  try {
    const { charId } = req.params as z.infer<typeof charIdParams>;
    const file = await comicCharacterImageService.resolveFaceRegionFile(charId);
    if (!file) {
      res.status(404).json({ success: false, error: "角色面部参考图尚未生成。" } satisfies ApiResponse<null>);
      return;
    }
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(await import("fs/promises").then((fs) => fs.readFile(file.filePath)));
  } catch (err) { next(err); }
});

router.get("/character-images/:charId/sheet/v:version", validate({ params: charSheetVersionParams }), async (req, res, next) => {
  try {
    const parsed = charSheetVersionParams.parse(req.params);
    const { charId, version } = parsed;
    const file = await comicCharacterImageService.resolveArchivedSheetFile(charId, version);
    if (!file) {
      res.status(404).json({ success: false, error: "历史设计稿不存在。" } satisfies ApiResponse<null>);
      return;
    }
    res.setHeader("Content-Type", file.mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(await import("fs/promises").then((fs) => fs.readFile(file.filePath)));
  } catch (err) { next(err); }
});

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

// ─── Bubble lettering ─────────────────────────────────────────────────────────

const letterPanelSchema = z
  .object({
    bubbleOpacity: z.number().min(0).max(1).optional(),
    maxBubbleWidthRatio: z.number().min(0.2).max(0.8).optional(),
  })
  .optional();

router.post(
  "/panels/:panelId/letter",
  validate({ params: panelIdParams, body: letterPanelSchema }),
  async (req, res, next) => {
    try {
      const { panelId } = req.params as z.infer<typeof panelIdParams>;
      const opts = (req.body ?? {}) as z.infer<typeof letterPanelSchema>;
      const result = await comicBubbleLayoutService.letterPanel(panelId, opts ?? {});
      res.json({
        success: true,
        data: { url: `/api/comic/panel-images/${panelId}/lettered`, width: result.width, height: result.height },
      } satisfies ApiResponse<{ url: string; width: number; height: number }>);
    } catch (err) { next(err); }
  },
);

router.get("/panel-images/:panelId/lettered", validate({ params: panelIdParams }), async (req, res, next) => {
  try {
    const { panelId } = req.params as z.infer<typeof panelIdParams>;
    const buf = await comicBubbleLayoutService.getLetteredImageFile(panelId);
    if (!buf) {
      res.status(404).json({ success: false, error: "排版图尚未生成。" } satisfies ApiResponse<null>);
      return;
    }
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buf);
  } catch (err) { next(err); }
});

// ─── Export ────────────────────────────────────────────────────────────────────

const exportEpisodeSchema = z.object({
  format: z.enum(["long_image", "sliced"]).optional(),
  spec: z.object({
    sliceWidth: z.number().int().min(400).max(2048).optional(),
    sliceMaxHeight: z.number().int().min(0).max(100000).optional(),
    outputFormat: z.enum(["png", "jpg", "webp"]).optional(),
    quality: z.number().int().min(1).max(100).optional(),
  }).optional(),
});

const exportJobIdParams = z.object({ jobId: z.string().trim().min(1) });
const artifactParams = z.object({
  jobId: z.string().trim().min(1),
  filename: z.string().trim().min(1),
});

router.post(
  "/episodes/:episodeId/export",
  validate({ params: episodeIdParams, body: exportEpisodeSchema }),
  async (req, res, next) => {
    try {
      const { episodeId } = req.params as z.infer<typeof episodeIdParams>;
      const body = req.body as z.infer<typeof exportEpisodeSchema>;
      const data = await comicExportService.exportEpisode(episodeId, body?.format, body?.spec);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

router.get("/projects/:id/export-jobs", validate({ params: idParams }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParams>;
    const data = await comicExportService.listExportJobs(id);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.get("/export-jobs/:jobId", validate({ params: exportJobIdParams }), async (req, res, next) => {
  try {
    const { jobId } = req.params as z.infer<typeof exportJobIdParams>;
    const data = await comicExportService.getExportJob(jobId);
    if (!data) {
      res.status(404).json({ success: false, error: "导出任务不存在。" } satisfies ApiResponse<null>);
      return;
    }
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.get(
  "/export-jobs/:jobId/artifacts/:filename",
  validate({ params: artifactParams }),
  async (req, res, next) => {
    try {
      const { jobId, filename } = req.params as z.infer<typeof artifactParams>;
      const file = await comicExportService.getArtifactFile(jobId, filename);
      if (!file) {
        res.status(404).json({ success: false, error: "产物文件不存在。" } satisfies ApiResponse<null>);
        return;
      }
      const mimeMap: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
      res.setHeader("Content-Type", mimeMap[file.ext] ?? "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(file.buffer);
    } catch (err) { next(err); }
  },
);

// ─── Batch jobs ────────────────────────────────────────────────────────────────

const batchJobIdParams = z.object({ jobId: z.string().trim().min(1) });

const startBatchSchema = z
  .object({
    provider: z.string().trim().optional(),
    concurrency: z.number().int().min(1).max(10).optional(),
    skipDone: z.boolean().optional(),
  })
  .optional();

const retryBatchSchema = z.object({ provider: z.string().trim().optional() }).optional();

const estimateCostSchema = z.object({ provider: z.string().trim().optional() }).optional();

router.post(
  "/episodes/:episodeId/batch/start",
  validate({ params: episodeIdParams, body: startBatchSchema }),
  async (req, res, next) => {
    try {
      const { episodeId } = req.params as z.infer<typeof episodeIdParams>;
      const body = (req.body ?? {}) as z.infer<typeof startBatchSchema>;
      const data = await comicBatchOrchestrator.startEpisodeBatch(episodeId, {
        provider: body?.provider as LLMProvider | undefined,
        concurrency: body?.concurrency,
        skipDone: body?.skipDone,
      });
      res.status(202).json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

router.post(
  "/batch-jobs/:jobId/retry",
  validate({ params: batchJobIdParams, body: retryBatchSchema }),
  async (req, res, next) => {
    try {
      const { jobId } = req.params as z.infer<typeof batchJobIdParams>;
      const body = (req.body ?? {}) as z.infer<typeof retryBatchSchema>;
      const data = await comicBatchOrchestrator.retryFailed(jobId, {
        provider: body?.provider as LLMProvider | undefined,
      });
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

router.get("/batch-jobs/:jobId", validate({ params: batchJobIdParams }), async (req, res, next) => {
  try {
    const { jobId } = req.params as z.infer<typeof batchJobIdParams>;
    const data = await comicBatchOrchestrator.getBatchJob(jobId);
    if (!data) {
      res.status(404).json({ success: false, error: "批量任务不存在。" } satisfies ApiResponse<null>);
      return;
    }
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.get("/projects/:id/batch-jobs", validate({ params: idParams }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParams>;
    const data = await comicBatchOrchestrator.listBatchJobs(id);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (err) { next(err); }
});

router.get(
  "/episodes/:episodeId/batch/estimate",
  validate({ params: episodeIdParams }),
  async (req, res, next) => {
    try {
      const { episodeId } = req.params as z.infer<typeof episodeIdParams>;
      const provider = typeof req.query.provider === "string" ? req.query.provider : "openai";
      const data = await comicBatchOrchestrator.estimateCost(episodeId, provider);
      res.json({ success: true, data } satisfies ApiResponse<typeof data>);
    } catch (err) { next(err); }
  },
);

export default router;
