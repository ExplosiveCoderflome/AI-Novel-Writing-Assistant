import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { validate } from "../../../middleware/validate";
import { dramaCharacterService } from "../../../services/drama/DramaCharacterService";
import { dramaEpisodeService } from "../../../services/drama/DramaEpisodeService";
import { dramaEpisodeOutlineService } from "../../../services/drama/DramaEpisodeOutlineService";
import { dramaExportService } from "../../../services/drama/DramaExportService";
import { dramaGuidanceService } from "../../../services/drama/guidance/DramaGuidanceService";
import { dramaProjectService } from "../../../services/drama/DramaProjectService";
import { dramaQualityGate } from "../../../services/drama/DramaQualityGate";
import { dramaRepairService } from "../../../services/drama/DramaRepairService";
import { dramaScriptService } from "../../../services/drama/DramaScriptService";
import { dramaStoryboardService } from "../../../services/drama/DramaStoryboardService";
import { dramaStrategyService } from "../../../services/drama/DramaStrategyService";
import { dramaVideoPromptService } from "../../../services/drama/DramaVideoPromptService";
import { rhythmEngine } from "../../../services/drama/engine/rhythmEngine";
import { videoProviderRegistry } from "../../../services/drama/video/VideoProviderPort";

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

const idParamsSchema = z.object({ id: z.string().trim().min(1) });
const episodeParamsSchema = z.object({
  id: z.string().trim().min(1),
  order: z.coerce.number().int().min(1),
});
const characterParamsSchema = z.object({
  id: z.string().trim().min(1),
  characterId: z.string().trim().min(1),
});
const storyboardParamsSchema = z.object({ storyboardId: z.string().trim().min(1) });
const shotParamsSchema = z.object({
  id: z.string().trim().min(1),
  shotId: z.string().trim().min(1),
});
const videoPromptParamsSchema = z.object({ videoPromptId: z.string().trim().min(1) });

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

const repairRequestSchema = z
  .object({
    instruction: z.string().trim().max(4000).optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .optional();

const episodeUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  content: z.string().max(200000).optional(),
  hookOpening: z.string().trim().max(1000).nullable().optional(),
  cliffhanger: z.string().trim().max(1000).nullable().optional(),
  durationSec: z.number().int().min(1).max(600).nullable().optional(),
});

const characterUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  archetype: z.string().trim().max(80).optional(),
  persona: z.string().trim().max(1000).optional(),
  speechStyle: z.string().trim().max(1000).optional(),
  visualAnchor: z.unknown().optional(),
  voiceProfile: z.unknown().optional(),
  relations: z.unknown().optional(),
});

const saveCharacterSchema = z
  .object({
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  })
  .optional();

const importCharacterSchema = z.object({
  libraryId: z.string().trim().min(1),
});

const providerTaskSchema = z
  .object({
    provider: z.string().trim().min(1).optional(),
  })
  .optional();

const trackRecommendationSchema = z.object({
  title: z.string().trim().min(1).max(120),
  sourceType: z.enum(["novel_import", "original", "text_import"]),
  sourceDigest: z.string().trim().max(20000).optional(),
  theme: z.string().trim().max(120).optional(),
  targetEpisodes: z.number().int().min(1).max(500).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const sourceSupplementSchema = z
  .object({
    userSupplement: z.string().trim().max(8000).optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .optional();

router.get("/projects", async (_req, res, next) => {
  try {
    const data = await dramaProjectService.listProjects();
    res.status(200).json({ success: true, data, message: "Drama projects loaded." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/projects", validate({ body: createProjectSchema }), async (req, res, next) => {
  try {
    const data = await dramaProjectService.createProject(req.body as z.infer<typeof createProjectSchema>);
    res.status(201).json({ success: true, data, message: "Drama project created." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/projects/:id", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await dramaProjectService.getProject(id);
    if (!data) {
      res.status(404).json({ success: false, error: "Drama project not found." } satisfies ApiResponse<null>);
      return;
    }
    res.status(200).json({ success: true, data, message: "Drama project loaded." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/source-bundle", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await dramaProjectService.assembleSourceBundle(id);
    res.status(200).json({ success: true, data, message: "Drama source bundle assembled." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/projects/:id/source-supplement",
  validate({ params: idParamsSchema, body: sourceSupplementSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await dramaGuidanceService.analyzeSourceSupplement(id, (req.body ?? {}) as never);
      res.status(200).json({ success: true, data, message: "Drama source supplement guidance generated." });
    } catch (error) {
      next(error);
    }
  },
);

router.get("/tracks", (_req, res) => {
  res.status(200).json({ success: true, data: rhythmEngine.listTracks(), message: "Drama tracks loaded." });
});

router.get("/hooks", (_req, res) => {
  res.status(200).json({ success: true, data: rhythmEngine.listHooks(), message: "Drama hooks loaded." });
});

router.get("/video-providers", (_req, res) => {
  const data = videoProviderRegistry.listProviders();
  res.status(200).json({ success: true, data, message: "Drama video providers loaded." });
});

router.post("/track-recommendation", validate({ body: trackRecommendationSchema }), async (req, res, next) => {
  try {
    const data = await dramaGuidanceService.recommendTrack(req.body as z.infer<typeof trackRecommendationSchema>);
    res.status(200).json({ success: true, data, message: "Drama track recommendation generated." });
  } catch (error) {
    next(error);
  }
});

router.get("/character-library", async (req, res, next) => {
  try {
    const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
    const data = await dramaCharacterService.listLibrary(projectId);
    res.status(200).json({ success: true, data, message: "Drama character library loaded." });
  } catch (error) {
    next(error);
  }
});

router.get("/projects/:id/characters", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await dramaCharacterService.listProjectCharacters(id);
    res.status(200).json({ success: true, data, message: "Drama characters loaded." });
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/projects/:id/characters/:characterId",
  validate({ params: characterParamsSchema, body: characterUpdateSchema }),
  async (req, res, next) => {
    try {
      const { characterId } = req.params as z.infer<typeof characterParamsSchema>;
      const data = await dramaCharacterService.updateProjectCharacter(characterId, req.body);
      res.status(200).json({ success: true, data, message: "Drama character updated." });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/projects/:id/characters/:characterId/save-to-library",
  validate({ params: characterParamsSchema, body: saveCharacterSchema }),
  async (req, res, next) => {
    try {
      const { characterId } = req.params as z.infer<typeof characterParamsSchema>;
      const data = await dramaCharacterService.saveCharacterToLibrary(characterId, req.body?.tags);
      res.status(201).json({ success: true, data, message: "Drama character saved to library." });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/projects/:id/character-library/import",
  validate({ params: idParamsSchema, body: importCharacterSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const body = req.body as z.infer<typeof importCharacterSchema>;
      const data = await dramaCharacterService.importLibraryCharacter(id, body.libraryId);
      res.status(201).json({ success: true, data, message: "Drama character imported." });
    } catch (error) {
      next(error);
    }
  },
);

router.post("/projects/:id/strategy", validate({ params: idParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await dramaStrategyService.generateStrategy(id, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama strategy generated." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/outline", validate({ params: idParamsSchema, body: outlineRequestSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const body = (req.body ?? {}) as { startOrder?: number; count?: number };
    const data = await dramaEpisodeOutlineService.generateOutline(
      id,
      { startOrder: body.startOrder, count: body.count },
      (req.body ?? {}) as never,
    );
    res.status(200).json({ success: true, data, message: "Drama episode outline generated." } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/episodes/:order/script", validate({ params: episodeParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const data = await dramaScriptService.generateEpisodeScript(id, order, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama episode script generated." });
  } catch (error) {
    next(error);
  }
});

router.patch("/projects/:id/episodes/:order", validate({ params: episodeParamsSchema, body: episodeUpdateSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const data = await dramaEpisodeService.updateEpisode(id, order, req.body as z.infer<typeof episodeUpdateSchema>);
    res.status(200).json({ success: true, data, message: "Drama episode updated." });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/episodes/:order/review", validate({ params: episodeParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const data = await dramaQualityGate.reviewEpisode(id, order, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama episode reviewed." });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/episodes/:order/repair", validate({ params: episodeParamsSchema, body: repairRequestSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const body = (req.body ?? {}) as { instruction?: string };
    const data = await dramaRepairService.repairEpisode(id, order, body.instruction, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama episode repaired." });
  } catch (error) {
    next(error);
  }
});

router.get("/projects/:id/export", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const format = req.query.format === "json" ? "json" : "markdown";
    const data = await dramaExportService.exportProject(id, format);
    res.setHeader("Content-Type", data.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(data.filename)}"`);
    res.status(200).send(data.body);
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/episodes/:order/storyboard", validate({ params: episodeParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id, order } = req.params as unknown as z.infer<typeof episodeParamsSchema>;
    const data = await dramaStoryboardService.generateStoryboard(id, order, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama storyboard generated." });
  } catch (error) {
    next(error);
  }
});

router.get("/storyboards/:storyboardId", validate({ params: storyboardParamsSchema }), async (req, res, next) => {
  try {
    const { storyboardId } = req.params as z.infer<typeof storyboardParamsSchema>;
    const data = await dramaStoryboardService.getStoryboard(storyboardId);
    res.status(200).json({ success: true, data, message: "Drama storyboard loaded." });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:id/shots/:shotId/video-prompt", validate({ params: shotParamsSchema, body: llmOptionsSchema }), async (req, res, next) => {
  try {
    const { id, shotId } = req.params as z.infer<typeof shotParamsSchema>;
    const data = await dramaVideoPromptService.generateVideoPromptForShot(id, shotId, (req.body ?? {}) as never);
    res.status(200).json({ success: true, data, message: "Drama video prompt generated." });
  } catch (error) {
    next(error);
  }
});

router.post("/video-prompts/:videoPromptId/provider-task", validate({ params: videoPromptParamsSchema, body: providerTaskSchema }), async (req, res, next) => {
  try {
    const { videoPromptId } = req.params as z.infer<typeof videoPromptParamsSchema>;
    const body = (req.body ?? {}) as { provider?: string };
    const data = await dramaVideoPromptService.createProviderTask(videoPromptId, body.provider ?? "mock");
    res.status(200).json({ success: true, data, message: "Drama video task created." });
  } catch (error) {
    next(error);
  }
});

router.post("/video-prompts/:videoPromptId/provider-task/refresh", validate({ params: videoPromptParamsSchema }), async (req, res, next) => {
  try {
    const { videoPromptId } = req.params as z.infer<typeof videoPromptParamsSchema>;
    const data = await dramaVideoPromptService.refreshProviderTask(videoPromptId);
    res.status(200).json({ success: true, data, message: "Drama video task refreshed." });
  } catch (error) {
    next(error);
  }
});

export default router;
