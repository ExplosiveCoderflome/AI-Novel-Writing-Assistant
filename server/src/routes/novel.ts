import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { NOVEL_LIST_PAGE_LIMIT_DEFAULT, NOVEL_LIST_PAGE_LIMIT_MAX } from "@ai-novel/shared/types/pagination";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { KnowledgeService } from "../services/knowledge/KnowledgeService";
import { NovelService } from "../services/novel/NovelService";
import { NovelDraftOptimizeService } from "../services/novel/NovelDraftOptimizeService";
import { registerNovelChapterRoutes } from "./novelChapterRoutes";
import { registerNovelChapterGenerationRoutes } from "./novelChapterGeneration";
import { registerNovelPlanningRoutes } from "./novelPlanningRoutes";
import { registerNovelProductionRoutes } from "./novelProductionRoutes";
import { registerNovelReviewRoutes } from "./novelReviewRoutes";
import { registerNovelSnapshotCharacterRoutes } from "./novelSnapshotCharacterRoutes";
import { registerNovelStoryMacroRoutes } from "./novelStoryMacroRoutes";
import { registerNovelStorylineRoutes } from "./novelStorylineRoutes";

const router = Router();
const novelService = new NovelService();
const novelDraftOptimizeService = new NovelDraftOptimizeService();
const knowledgeService = new KnowledgeService();

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

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(NOVEL_LIST_PAGE_LIMIT_MAX).default(NOVEL_LIST_PAGE_LIMIT_DEFAULT),
});

const bookAnalysisSectionKeySchema = z.enum([
  "overview",
  "plot_structure",
  "timeline",
  "character_system",
  "worldbuilding",
  "themes",
  "style_technique",
  "market_highlights",
]);

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

const storylineDiffQuerySchema = z.object({
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

const createNovelSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空。"),
  description: z.string().trim().optional(),
  genreId: z.string().trim().optional(),
  worldId: z.string().trim().optional(),
  writingMode: z.enum(["original", "continuation"]).optional(),
  sourceNovelId: z.string().trim().optional(),
  sourceKnowledgeDocumentId: z.string().trim().optional(),
  continuationBookAnalysisId: z.string().trim().optional(),
  continuationBookAnalysisSections: z.array(bookAnalysisSectionKeySchema).min(1).max(8).optional(),
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
});

const updateNovelSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().trim().optional(),
  status: z.enum(["draft", "published"]).optional(),
  writingMode: z.enum(["original", "continuation"]).optional(),
  sourceNovelId: z.string().trim().nullable().optional(),
  sourceKnowledgeDocumentId: z.string().trim().nullable().optional(),
  continuationBookAnalysisId: z.string().trim().nullable().optional(),
  continuationBookAnalysisSections: z.array(bookAnalysisSectionKeySchema).min(1).max(8).nullable().optional(),
  genreId: z.string().trim().nullable().optional(),
  worldId: z.string().trim().nullable().optional(),
  outline: z.string().nullable().optional(),
  structuredOutline: z.string().nullable().optional(),
  projectMode: z.enum(["ai_led", "co_pilot", "draft_mode", "auto_pipeline"]).nullable().optional(),
  narrativePov: z.enum(["first_person", "third_person", "mixed"]).nullable().optional(),
  pacePreference: z.enum(["slow", "balanced", "fast"]).nullable().optional(),
  styleTone: z.string().trim().nullable().optional(),
  emotionIntensity: z.enum(["low", "medium", "high"]).nullable().optional(),
  aiFreedom: z.enum(["low", "medium", "high"]).nullable().optional(),
  defaultChapterLength: z.number().int().min(500).max(10000).nullable().optional(),
  estimatedChapterCount: z.number().int().min(1).max(500).nullable().optional(),
  projectStatus: z.enum(["not_started", "in_progress", "completed", "rework", "blocked"]).nullable().optional(),
  storylineStatus: z.enum(["not_started", "in_progress", "completed", "rework", "blocked"]).nullable().optional(),
  outlineStatus: z.enum(["not_started", "in_progress", "completed", "rework", "blocked"]).nullable().optional(),
  resourceReadyScore: z.number().int().min(0).max(100).nullable().optional(),
});

const knowledgeBindingsSchema = z.object({
  documentIds: z.array(z.string().trim().min(1)).default([]),
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
  personality: z.string().optional(),
  background: z.string().optional(),
  development: z.string().optional(),
  currentState: z.string().optional(),
  currentGoal: z.string().optional(),
  baseCharacterId: z.string().trim().optional(),
});

const updateCharacterSchema = z.object({
  name: z.string().trim().min(1).optional(),
  role: z.string().trim().min(1).optional(),
  personality: z.string().optional(),
  background: z.string().optional(),
  development: z.string().optional(),
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
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic", "grok"]).optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
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

router.get("/", validate({ query: paginationSchema }), async (req, res, next) => {
  try {
    const query = paginationSchema.parse(req.query);
    const data = await novelService.listNovels({ page: query.page, limit: query.limit });
    const response: ApiResponse<typeof data> = {
      success: true,
      data,
      message: "获取小说列表成功。",
    };
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

router.post("/", validate({ body: createNovelSchema }), async (req, res, next) => {
  try {
    const data = await novelService.createNovel(req.body as z.infer<typeof createNovelSchema>);
    const response: ApiResponse<typeof data> = {
      success: true,
      data,
      message: "创建小说成功。",
    };
    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await novelService.getNovelById(id);
    if (!data) {
      res.status(404).json({
        success: false,
        error: "小说不存在。",
      } satisfies ApiResponse<null>);
      return;
    }
    res.status(200).json({
      success: true,
      data,
      message: "获取小说详情成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/knowledge-documents", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await knowledgeService.listBindings("novel", id);
    res.status(200).json({
      success: true,
      data,
      message: "Novel knowledge documents loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put(
  "/:id/knowledge-documents",
  validate({ params: idParamsSchema, body: knowledgeBindingsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const body = req.body as z.infer<typeof knowledgeBindingsSchema>;
      const data = await knowledgeService.replaceBindings("novel", id, body.documentIds);
      res.status(200).json({
        success: true,
        data,
        message: "Novel knowledge documents updated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/:id",
  validate({ params: idParamsSchema, body: updateNovelSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.updateNovel(id, req.body as z.infer<typeof updateNovelSchema>);
      res.status(200).json({
        success: true,
        data,
        message: "更新小说成功。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.delete("/:id", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    await novelService.deleteNovel(id);
    res.status(200).json({
      success: true,
      message: "删除小说成功。",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
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

registerNovelStorylineRoutes({
  router,
  novelService,
  idParamsSchema,
  storylineVersionParamsSchema,
  storylineDiffQuerySchema,
  storylineDraftSchema,
  storylineImpactSchema,
});

registerNovelStoryMacroRoutes({
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
