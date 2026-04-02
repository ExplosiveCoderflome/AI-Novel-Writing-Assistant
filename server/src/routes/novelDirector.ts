import { Router } from "express";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import {
  DIRECTOR_CORRECTION_PRESETS,
  type DirectorCandidatePatchRequest,
  type DirectorCandidateTitleRefineRequest,
  type DirectorConfirmRequest,
  type DirectorRefinementRequest,
  DIRECTOR_TAKEOVER_START_PHASES,
  type DirectorTakeoverRequest,
} from "@ai-novel/shared/types/novelDirector";
import {
  BOOK_FRAMING_COMMERCIAL_TAG_MAX_LENGTH,
  BOOK_FRAMING_MAX_COMMERCIAL_TAGS,
} from "@ai-novel/shared/types/novelFraming";
import { validate } from "../middleware/validate";
import { NovelDirectorService } from "../services/novel/director/NovelDirectorService";
import { directorCandidateSchema } from "../services/novel/director/novelDirectorSchemas";

const router = Router();
const novelDirectorService = new NovelDirectorService();

const correctionPresetValues = DIRECTOR_CORRECTION_PRESETS.map((item) => item.value) as [string, ...string[]];
const takeoverStartPhaseValues = [...DIRECTOR_TAKEOVER_START_PHASES] as [string, ...string[]];

const llmOptionsSchema = z.object({
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic", "grok", "kimi", "glm", "qwen", "gemini"]).optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
  runMode: z.enum(["auto_to_ready", "auto_to_execution", "stage_review"]).optional(),
});

const projectContextSchema = z.object({
  title: z.string().trim().optional(),
  description: z.string().trim().optional(),
  targetAudience: z.string().trim().optional(),
  bookSellingPoint: z.string().trim().optional(),
  competingFeel: z.string().trim().optional(),
  first30ChapterPromise: z.string().trim().optional(),
  commercialTags: z.array(z.string().trim().min(1).max(BOOK_FRAMING_COMMERCIAL_TAG_MAX_LENGTH))
    .max(BOOK_FRAMING_MAX_COMMERCIAL_TAGS)
    .optional(),
  genreId: z.string().trim().optional(),
  worldId: z.string().trim().optional(),
  writingMode: z.enum(["original", "continuation"]).optional(),
  projectMode: z.enum(["ai_led", "co_pilot", "draft_mode", "auto_pipeline"]).optional(),
  narrativePov: z.enum(["first_person", "third_person", "mixed"]).optional(),
  pacePreference: z.enum(["slow", "balanced", "fast"]).optional(),
  styleTone: z.string().trim().optional(),
  emotionIntensity: z.enum(["low", "medium", "high"]).optional(),
  aiFreedom: z.enum(["low", "medium", "high"]).optional(),
  defaultChapterLength: z.number().int().min(500).max(10000).optional(),
  estimatedChapterCount: z.number().int().min(1).max(500).optional(),
  projectStatus: z.enum(["not_started", "in_progress", "completed", "rework", "blocked"]).optional(),
  storylineStatus: z.enum(["not_started", "in_progress", "completed", "rework", "blocked"]).optional(),
  outlineStatus: z.enum(["not_started", "in_progress", "completed", "rework", "blocked"]).optional(),
  resourceReadyScore: z.number().int().min(0).max(100).optional(),
  sourceNovelId: z.string().trim().optional(),
  sourceKnowledgeDocumentId: z.string().trim().optional(),
  continuationBookAnalysisId: z.string().trim().optional(),
  continuationBookAnalysisSections: z.array(z.enum([
    "overview",
    "plot_structure",
    "timeline",
    "character_system",
    "worldbuilding",
    "themes",
    "style_technique",
    "market_highlights",
  ])).min(1).max(8).optional(),
});

const candidatesSchema = projectContextSchema.extend({
  idea: z.string().trim().min(1),
  workflowTaskId: z.string().trim().optional(),
}).merge(llmOptionsSchema);

const candidateBatchSchema = z.object({
  id: z.string().trim().min(1),
  round: z.number().int().min(1),
  roundLabel: z.string().trim().min(1),
  idea: z.string().trim().min(1),
  refinementSummary: z.string().trim().nullable().optional(),
  presets: z.array(z.enum(correctionPresetValues)).default([]),
  candidates: z.array(directorCandidateSchema).min(1),
  createdAt: z.string().trim().min(1),
});

const refineSchema = projectContextSchema.extend({
  idea: z.string().trim().min(1),
  previousBatches: z.array(candidateBatchSchema).min(1),
  presets: z.array(z.enum(correctionPresetValues)).default([]),
  feedback: z.string().trim().max(500).optional(),
  workflowTaskId: z.string().trim().optional(),
}).merge(llmOptionsSchema);

const patchCandidateSchema = projectContextSchema.extend({
  idea: z.string().trim().min(1),
  previousBatches: z.array(candidateBatchSchema).min(1),
  batchId: z.string().trim().min(1),
  candidateId: z.string().trim().min(1),
  presets: z.array(z.enum(correctionPresetValues)).default([]),
  feedback: z.string().trim().min(1).max(500),
  workflowTaskId: z.string().trim().optional(),
}).merge(llmOptionsSchema);

const refineTitleSchema = projectContextSchema.extend({
  idea: z.string().trim().min(1),
  previousBatches: z.array(candidateBatchSchema).min(1),
  batchId: z.string().trim().min(1),
  candidateId: z.string().trim().min(1),
  feedback: z.string().trim().min(1).max(500),
  workflowTaskId: z.string().trim().optional(),
}).merge(llmOptionsSchema);

const confirmSchema = projectContextSchema.extend({
  idea: z.string().trim().min(1),
  batchId: z.string().trim().optional(),
  round: z.number().int().min(1).optional(),
  candidate: directorCandidateSchema,
  workflowTaskId: z.string().trim().optional(),
}).merge(llmOptionsSchema);

const takeoverParamsSchema = z.object({
  novelId: z.string().trim().min(1),
});

const takeoverSchema = z.object({
  novelId: z.string().trim().min(1),
  startPhase: z.enum(takeoverStartPhaseValues),
}).merge(llmOptionsSchema);

router.post("/candidates", validate({ body: candidatesSchema }), async (req, res, next) => {
  try {
    const data = await novelDirectorService.generateCandidates(req.body as z.infer<typeof candidatesSchema>);
    res.status(200).json({
      success: true,
      data,
      message: "Director candidates generated.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/refine", validate({ body: refineSchema }), async (req, res, next) => {
  try {
    const data = await novelDirectorService.refineCandidates(req.body as DirectorRefinementRequest);
    res.status(200).json({
      success: true,
      data,
      message: "Director candidates regenerated.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/patch-candidate", validate({ body: patchCandidateSchema }), async (req, res, next) => {
  try {
    const data = await novelDirectorService.patchCandidate(req.body as DirectorCandidatePatchRequest);
    res.status(200).json({
      success: true,
      data,
      message: "Director candidate patched.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/refine-titles", validate({ body: refineTitleSchema }), async (req, res, next) => {
  try {
    const data = await novelDirectorService.refineCandidateTitleOptions(req.body as DirectorCandidateTitleRefineRequest);
    res.status(200).json({
      success: true,
      data,
      message: "Director title options regenerated.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/confirm", validate({ body: confirmSchema }), async (req, res, next) => {
  try {
    const data = await novelDirectorService.confirmCandidate(req.body as DirectorConfirmRequest);
    res.status(200).json({
      success: true,
      data,
      message: "Director candidate confirmed.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/takeover-readiness/:novelId", validate({ params: takeoverParamsSchema }), async (req, res, next) => {
  try {
    const { novelId } = req.params as z.infer<typeof takeoverParamsSchema>;
    const data = await novelDirectorService.getTakeoverReadiness(novelId);
    res.status(200).json({
      success: true,
      data,
      message: "Director takeover readiness loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/takeover", validate({ body: takeoverSchema }), async (req, res, next) => {
  try {
    const data = await novelDirectorService.startTakeover(req.body as DirectorTakeoverRequest);
    res.status(200).json({
      success: true,
      data,
      message: "Director takeover started.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

export default router;
