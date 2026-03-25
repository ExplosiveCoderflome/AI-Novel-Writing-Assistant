import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { NovelService } from "../services/novel/NovelService";
import { NovelDraftOptimizeService } from "../services/novel/NovelDraftOptimizeService";
import { registerNovelBaseRoutes } from "./novelBaseRoutes";
import { registerNovelChapterRoutes } from "./novelChapterRoutes";
import { registerNovelChapterGenerationRoutes } from "./novelChapterGeneration";
import { registerNovelCharacterDynamicsRoutes } from "./novelCharacterDynamicsRoutes";
import { registerNovelCharacterPreparationRoutes } from "./novelCharacterPreparationRoutes";
import { registerNovelFramingRoutes } from "./novelFramingRoutes";
import { registerNovelPlanningRoutes } from "./novelPlanningRoutes";
import { registerNovelProductionRoutes } from "./novelProductionRoutes";
import { registerNovelReviewRoutes } from "./novelReviewRoutes";
import { registerNovelSnapshotCharacterRoutes } from "./novelSnapshotCharacterRoutes";
import { registerNovelStoryMacroRoutes } from "./novelStoryMacroRoutes";
import { registerNovelStorylineRoutes } from "./novelStorylineRoutes";
import { registerNovelVolumeRoutes } from "./novelVolumeRoutes";
import { registerNovelWorldSliceRoutes } from "./novelWorldSliceRoutes";

const router = Router();
const novelService = new NovelService();
const novelDraftOptimizeService = new NovelDraftOptimizeService();

function forwardBusinessError(error: unknown, next: (err?: unknown) => void): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const isBusiness = /请先在本小说中至少添加|基础角色不存在|请先生成小说发展走向|指定区间内没有可生成的章节|当前小说还没有章节/.test(error.message);
  if (!isBusiness) {
    return false;
  }
  next(new AppError(error.message, 400));
  return true;
}

const idParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const chapterParamsSchema = z.object({
  id: z.string().trim().min(1),
  chapterId: z.string().trim().min(1),
});

const arcPlanParamsSchema = z.object({
  id: z.string().trim().min(1),
  arcId: z.string().trim().min(1),
});

const auditIssueParamsSchema = z.object({
  id: z.string().trim().min(1),
  issueId: z.string().trim().min(1),
});

const characterParamsSchema = z.object({
  id: z.string().trim().min(1),
  charId: z.string().trim().min(1),
});

const pipelineJobParamsSchema = z.object({
  id: z.string().trim().min(1),
  jobId: z.string().trim().min(1),
});

const storylineVersionParamsSchema = z.object({
  id: z.string().trim().min(1),
  versionId: z.string().trim().min(1),
});

const volumeVersionParamsSchema = z.object({
  id: z.string().trim().min(1),
  versionId: z.string().trim().min(1),
});

const storylineDiffQuerySchema = z.object({
  compareVersion: z.coerce.number().int().min(1).optional(),
});

const volumeDiffQuerySchema = z.object({
  compareVersion: z.coerce.number().int().min(1).optional(),
});

const storylineDraftSchema = z.object({
  content: z.string().trim().min(1),
  diffSummary: z.string().trim().optional(),
  baseVersion: z.number().int().min(1).optional(),
});

const storylineImpactSchema = z.object({
  versionId: z.string().trim().optional(),
  content: z.string().trim().optional(),
});

const volumeChapterSchema = z.object({
  id: z.string().trim().optional(),
  chapterOrder: z.number().int().min(1).optional(),
  order: z.number().int().min(1).optional(),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  purpose: z.string().trim().nullable().optional(),
  conflictLevel: z.number().int().min(0).max(100).nullable().optional(),
  revealLevel: z.number().int().min(0).max(100).nullable().optional(),
  targetWordCount: z.number().int().min(200).max(20000).nullable().optional(),
  mustAvoid: z.string().trim().nullable().optional(),
  taskSheet: z.string().trim().nullable().optional(),
  payoffRefs: z.array(z.string().trim().min(1)).optional(),
}).passthrough();

const volumeSchema = z.object({
  id: z.string().trim().optional(),
  sortOrder: z.number().int().min(1).optional(),
  title: z.string().trim().min(1),
  summary: z.string().trim().nullable().optional(),
  mainPromise: z.string().trim().nullable().optional(),
  escalationMode: z.string().trim().nullable().optional(),
  protagonistChange: z.string().trim().nullable().optional(),
  climax: z.string().trim().nullable().optional(),
  nextVolumeHook: z.string().trim().nullable().optional(),
  resetPoint: z.string().trim().nullable().optional(),
  openPayoffs: z.array(z.string().trim().min(1)).optional(),
  status: z.string().trim().optional(),
  sourceVersionId: z.string().trim().nullable().optional(),
  chapters: z.array(volumeChapterSchema).default([]),
}).passthrough();

const volumeDocumentSchema = z.object({
  volumes: z.array(volumeSchema).min(1),
});

const volumeDraftSchema = z.object({
  volumes: z.array(volumeSchema).min(1).optional(),
  diffSummary: z.string().trim().optional(),
  baseVersion: z.number().int().min(1).optional(),
});

const volumeImpactSchema = z.object({
  volumes: z.array(volumeSchema).min(1).optional(),
  versionId: z.string().trim().optional(),
});

const volumeSyncSchema = z.object({
  volumes: z.array(volumeSchema).min(1),
  preserveContent: z.boolean().optional(),
  applyDeletes: z.boolean().optional(),
});

const chapterSchema = z.object({
  title: z.string().trim().min(1, "章节标题不能为空。"),
  order: z.number().int().nonnegative(),
  content: z.string().optional(),
  expectation: z.string().optional(),
  chapterStatus: z.enum(["unplanned", "pending_generation", "generating", "pending_review", "needs_repair", "completed"]).optional(),
  targetWordCount: z.number().int().min(200).max(20000).optional(),
  conflictLevel: z.number().int().min(0).max(100).optional(),
  revealLevel: z.number().int().min(0).max(100).optional(),
  mustAvoid: z.string().optional(),
  taskSheet: z.string().optional(),
  sceneCards: z.string().optional(),
  repairHistory: z.string().optional(),
  qualityScore: z.number().int().min(0).max(100).optional(),
  continuityScore: z.number().int().min(0).max(100).optional(),
  characterScore: z.number().int().min(0).max(100).optional(),
  pacingScore: z.number().int().min(0).max(100).optional(),
  riskFlags: z.string().optional(),
});

const updateChapterSchema = z.object({
  title: z.string().trim().min(1).optional(),
  order: z.number().int().nonnegative().optional(),
  content: z.string().optional(),
  expectation: z.string().optional(),
  chapterStatus: z.enum(["unplanned", "pending_generation", "generating", "pending_review", "needs_repair", "completed"]).optional(),
  targetWordCount: z.number().int().min(200).max(20000).nullable().optional(),
  conflictLevel: z.number().int().min(0).max(100).nullable().optional(),
  revealLevel: z.number().int().min(0).max(100).nullable().optional(),
  mustAvoid: z.string().nullable().optional(),
  taskSheet: z.string().nullable().optional(),
  sceneCards: z.string().nullable().optional(),
  repairHistory: z.string().nullable().optional(),
  qualityScore: z.number().int().min(0).max(100).nullable().optional(),
  continuityScore: z.number().int().min(0).max(100).nullable().optional(),
  characterScore: z.number().int().min(0).max(100).nullable().optional(),
  pacingScore: z.number().int().min(0).max(100).nullable().optional(),
  riskFlags: z.string().nullable().optional(),
});

const characterSchema = z.object({
  name: z.string().trim().min(1, "角色名称不能为空。"),
  role: z.string().trim().min(1, "角色定位不能为空。"),
  castRole: z.enum(["protagonist", "antagonist", "ally", "foil", "mentor", "love_interest", "pressure_source", "catalyst"]).optional(),
  storyFunction: z.string().optional(),
  relationToProtagonist: z.string().optional(),
  personality: z.string().optional(),
  background: z.string().optional(),
  development: z.string().optional(),
  outerGoal: z.string().optional(),
  innerNeed: z.string().optional(),
  fear: z.string().optional(),
  wound: z.string().optional(),
  misbelief: z.string().optional(),
  secret: z.string().optional(),
  moralLine: z.string().optional(),
  firstImpression: z.string().optional(),
  arcStart: z.string().optional(),
  arcMidpoint: z.string().optional(),
  arcClimax: z.string().optional(),
  arcEnd: z.string().optional(),
  currentState: z.string().optional(),
  currentGoal: z.string().optional(),
  baseCharacterId: z.string().trim().optional(),
});

const updateCharacterSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: z.string().trim().min(1).optional(),
  castRole: z.enum(["protagonist", "antagonist", "ally", "foil", "mentor", "love_interest", "pressure_source", "catalyst"]).optional(),
  storyFunction: z.string().optional(),
  relationToProtagonist: z.string().optional(),
  personality: z.string().optional(),
  background: z.string().optional(),
  development: z.string().optional(),
  outerGoal: z.string().optional(),
  innerNeed: z.string().optional(),
  fear: z.string().optional(),
  wound: z.string().optional(),
  misbelief: z.string().optional(),
  secret: z.string().optional(),
  moralLine: z.string().optional(),
  firstImpression: z.string().optional(),
  arcStart: z.string().optional(),
  arcMidpoint: z.string().optional(),
  arcClimax: z.string().optional(),
  arcEnd: z.string().optional(),
  currentState: z.string().optional(),
  currentGoal: z.string().optional(),
  baseCharacterId: z.string().trim().optional(),
});

const characterTimelineSyncSchema = z.object({
  startOrder: z.number().int().min(1).optional(),
  endOrder: z.number().int().min(1).optional(),
}).refine((value) => {
  if (typeof value.startOrder === "number" && typeof value.endOrder === "number") {
    return value.startOrder <= value.endOrder;
  }
  return true;
}, {
  message: "起始章节必须小于或等于结束章节。",
});

const llmGenerateSchema = z.object({
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic", "grok", "kimi", "glm", "qwen", "gemini"]).optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const volumeGenerateSchema = llmGenerateSchema.extend({
  guidance: z.string().trim().max(4000).optional(),
});

const outlineGenerateSchema = llmGenerateSchema.extend({
  initialPrompt: z.string().trim().max(2000).optional(),
});

const structuredOutlineSchema = llmGenerateSchema.extend({
  totalChapters: z.number().int().min(1).max(200).optional(),
});

const beatGenerateSchema = llmGenerateSchema.extend({
  targetChapters: z.number().int().min(1).max(500).optional(),
});

const pipelineRunSchema = llmGenerateSchema.extend({
  startOrder: z.number().int().min(1),
  endOrder: z.number().int().min(1),
  maxRetries: z.number().int().min(0).max(5).optional(),
  runMode: z.enum(["fast", "polish"]).optional(),
  autoReview: z.boolean().optional(),
  autoRepair: z.boolean().optional(),
  skipCompleted: z.boolean().optional(),
  qualityThreshold: z.number().int().min(0).max(100).optional(),
  repairMode: z.enum(["detect_only", "light_repair", "heavy_repair", "continuity_only", "character_only", "ending_only"]).optional(),
}).refine((value) => value.startOrder <= value.endOrder, {
  message: "起始章节必须小于或等于结束章节。",
});

const reviewIssueSchema = z.object({
  severity: z.enum(["low", "medium", "high", "critical"]),
  category: z.enum(["coherence", "repetition", "pacing", "voice", "engagement", "logic"]),
  evidence: z.string().trim().min(1),
  fixSuggestion: z.string().trim().min(1),
});

const reviewSchema = llmGenerateSchema.extend({
  content: z.string().optional(),
});

const repairSchema = llmGenerateSchema.extend({
  reviewIssues: z.array(reviewIssueSchema).optional(),
  auditIssueIds: z.array(z.string().trim().min(1)).optional(),
});

const replanSchema = llmGenerateSchema.extend({
  chapterId: z.string().trim().optional(),
  triggerType: z.string().trim().optional(),
  sourceIssueIds: z.array(z.string().trim().min(1)).optional(),
  windowSize: z.number().int().min(1).max(5).optional(),
  reason: z.string().trim().min(1),
});

const hookGenerateSchema = llmGenerateSchema.extend({
  chapterId: z.string().trim().optional(),
});

const titleGenerateSchema = llmGenerateSchema.extend({
  count: z.number().int().min(3).max(24).optional(),
  maxTokens: z.number().int().min(256).max(32768).optional(),
});

const draftOptimizeSchema = llmGenerateSchema.extend({
  currentDraft: z.string().trim().min(1),
  instruction: z.string().trim().min(1),
  mode: z.enum(["full", "selection"]).default("full"),
  selectedText: z.string().trim().optional(),
});

router.use(authMiddleware);

registerNovelBaseRoutes({
  router,
});

registerNovelFramingRoutes({
  router,
});

registerNovelChapterRoutes({
  router,
  novelService,
  idParamsSchema,
  chapterParamsSchema,
  chapterSchema,
  updateChapterSchema,
});

registerNovelSnapshotCharacterRoutes({
  router,
  novelService,
  idParamsSchema,
  characterParamsSchema,
  characterSchema,
  updateCharacterSchema,
  characterTimelineSyncSchema,
  llmGenerateSchema,
  forwardBusinessError,
});

registerNovelCharacterDynamicsRoutes({
  router,
  novelService,
  idParamsSchema,
});

registerNovelCharacterPreparationRoutes({
  router,
  novelService,
  idParamsSchema,
});

registerNovelStorylineRoutes({
  router,
  novelService,
  idParamsSchema,
  storylineVersionParamsSchema,
  storylineDiffQuerySchema,
  storylineDraftSchema,
  storylineImpactSchema,
});

registerNovelVolumeRoutes({
  router,
  novelService,
  idParamsSchema,
  volumeVersionParamsSchema,
  volumeDiffQuerySchema,
  volumeDocumentSchema,
  volumeDraftSchema,
  volumeImpactSchema,
  volumeGenerateSchema,
  volumeSyncSchema,
});

registerNovelStoryMacroRoutes({
  router,
  idParamsSchema,
});

registerNovelWorldSliceRoutes({
  router,
  idParamsSchema,
});

registerNovelChapterGenerationRoutes({
  router,
  novelService,
  chapterParamsSchema,
  forwardBusinessError,
});

registerNovelPlanningRoutes({
  router,
  novelService,
  idParamsSchema,
  chapterParamsSchema,
  arcPlanParamsSchema,
  llmGenerateSchema,
  replanSchema,
});

registerNovelReviewRoutes({
  router,
  novelService,
  idParamsSchema,
  chapterParamsSchema,
  auditIssueParamsSchema,
  reviewSchema,
  repairSchema,
});

registerNovelProductionRoutes({
  router,
  novelService,
  novelDraftOptimizeService,
  idParamsSchema,
  pipelineJobParamsSchema,
  titleGenerateSchema,
  beatGenerateSchema,
  pipelineRunSchema,
  hookGenerateSchema,
  outlineGenerateSchema,
  structuredOutlineSchema,
  draftOptimizeSchema,
  forwardBusinessError,
});

export default router;
