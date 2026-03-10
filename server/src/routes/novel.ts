import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { KnowledgeService } from "../services/knowledge/KnowledgeService";
import { streamToSSE } from "../llm/streaming";
import { NovelService } from "../services/novel/NovelService";
import { NovelDraftOptimizeService } from "../services/novel/NovelDraftOptimizeService";

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
  limit: z.coerce.number().int().min(1).max(100).default(10),
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

const chapterGenerateSchema = llmGenerateSchema.extend({
  previousChaptersSummary: z.array(z.string()).optional(),
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
});

const hookGenerateSchema = llmGenerateSchema.extend({
  chapterId: z.string().trim().optional(),
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

router.get("/:id/chapters", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await novelService.listChapters(id);
    res.status(200).json({
      success: true,
      data,
      message: "获取章节列表成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:id/chapters",
  validate({ params: idParamsSchema, body: chapterSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.createChapter(id, req.body as z.infer<typeof chapterSchema>);
      res.status(201).json({
        success: true,
        data,
        message: "创建章节成功。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  "/:id/chapters/:chapterId",
  validate({ params: chapterParamsSchema, body: updateChapterSchema }),
  async (req, res, next) => {
    try {
      const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
      const data = await novelService.updateChapter(
        id,
        chapterId,
        req.body as z.infer<typeof updateChapterSchema>,
      );
      res.status(200).json({
        success: true,
        data,
        message: "更新章节成功。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.delete("/:id/chapters/:chapterId", validate({ params: chapterParamsSchema }), async (req, res, next) => {
  try {
    const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
    await novelService.deleteChapter(id, chapterId);
    res.status(200).json({
      success: true,
      message: "删除章节成功。",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/characters", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await novelService.listCharacters(id);
    res.status(200).json({
      success: true,
      data,
      message: "获取角色列表成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:id/characters",
  validate({ params: idParamsSchema, body: characterSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.createCharacter(id, req.body as z.infer<typeof characterSchema>);
      res.status(201).json({
        success: true,
        data,
        message: "创建角色成功。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      if (forwardBusinessError(error, next)) {
        return;
      }
      next(error);
    }
  },
);

router.put(
  "/:id/characters/:charId",
  validate({ params: characterParamsSchema, body: updateCharacterSchema }),
  async (req, res, next) => {
    try {
      const { id, charId } = req.params as z.infer<typeof characterParamsSchema>;
      const data = await novelService.updateCharacter(
        id,
        charId,
        req.body as z.infer<typeof updateCharacterSchema>,
      );
      res.status(200).json({
        success: true,
        data,
        message: "更新角色成功。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.delete("/:id/characters/:charId", validate({ params: characterParamsSchema }), async (req, res, next) => {
  try {
    const { id, charId } = req.params as z.infer<typeof characterParamsSchema>;
    await novelService.deleteCharacter(id, charId);
    res.status(200).json({
      success: true,
      message: "删除角色成功。",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

router.get(
  "/:id/characters/:charId/timeline",
  validate({ params: characterParamsSchema }),
  async (req, res, next) => {
    try {
      const { id, charId } = req.params as z.infer<typeof characterParamsSchema>;
      const data = await novelService.listCharacterTimeline(id, charId);
      res.status(200).json({
        success: true,
        data,
        message: "获取角色时间线成功。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/characters/timeline/sync",
  validate({ params: idParamsSchema, body: characterTimelineSyncSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.syncAllCharacterTimeline(
        id,
        req.body as z.infer<typeof characterTimelineSyncSchema>,
      );
      res.status(200).json({
        success: true,
        data,
        message: "全角色时间线同步完成。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/characters/:charId/timeline/sync",
  validate({ params: characterParamsSchema, body: characterTimelineSyncSchema }),
  async (req, res, next) => {
    try {
      const { id, charId } = req.params as z.infer<typeof characterParamsSchema>;
      const data = await novelService.syncCharacterTimeline(
        id,
        charId,
        req.body as z.infer<typeof characterTimelineSyncSchema>,
      );
      res.status(200).json({
        success: true,
        data,
        message: "角色时间线同步完成。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/characters/:charId/evolve",
  validate({ params: characterParamsSchema, body: llmGenerateSchema }),
  async (req, res, next) => {
    try {
      const { id, charId } = req.params as z.infer<typeof characterParamsSchema>;
      const data = await novelService.evolveCharacter(
        id,
        charId,
        req.body as z.infer<typeof llmGenerateSchema>,
      );
      res.status(200).json({
        success: true,
        data,
        message: "角色信息演进更新完成。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/world-check/characters/:charId",
  validate({ params: characterParamsSchema, body: llmGenerateSchema }),
  async (req, res, next) => {
    try {
      const { id, charId } = req.params as z.infer<typeof characterParamsSchema>;
      const data = await novelService.checkCharacterAgainstWorld(
        id,
        charId,
        req.body as z.infer<typeof llmGenerateSchema>,
      );
      res.status(200).json({
        success: true,
        data,
        message: "角色世界观一致性检查完成。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/bible/generate",
  validate({ params: idParamsSchema, body: llmGenerateSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const { stream, onDone } = await novelService.createBibleStream(
        id,
        req.body as z.infer<typeof llmGenerateSchema>,
      );
      await streamToSSE(res, stream, onDone);
    } catch (error) {
      if (forwardBusinessError(error, next)) {
        return;
      }
      next(error);
    }
  },
);

router.post(
  "/:id/beats/generate",
  validate({ params: idParamsSchema, body: beatGenerateSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const { stream, onDone } = await novelService.createBeatStream(
        id,
        req.body as z.infer<typeof beatGenerateSchema>,
      );
      await streamToSSE(res, stream, onDone);
    } catch (error) {
      if (forwardBusinessError(error, next)) {
        return;
      }
      next(error);
    }
  },
);

router.post(
  "/:id/pipeline/run",
  validate({ params: idParamsSchema, body: pipelineRunSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.startPipelineJob(
        id,
        req.body as z.infer<typeof pipelineRunSchema>,
      );
      res.status(202).json({
        success: true,
        data,
        message: "批量生成任务已创建。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      if (forwardBusinessError(error, next)) {
        return;
      }
      next(error);
    }
  },
);

router.get(
  "/:id/pipeline/jobs/:jobId",
  validate({ params: pipelineJobParamsSchema }),
  async (req, res, next) => {
    try {
      const { id, jobId } = req.params as z.infer<typeof pipelineJobParamsSchema>;
      const data = await novelService.getPipelineJob(id, jobId);
      if (!data) {
        res.status(404).json({
          success: false,
          error: "任务不存在。",
        } satisfies ApiResponse<null>);
        return;
      }
      res.status(200).json({
        success: true,
        data,
        message: "获取任务状态成功。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:id/storyline/versions",
  validate({ params: idParamsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.listStorylineVersions(id);
      res.status(200).json({
        success: true,
        data,
        message: "Storyline versions loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/storyline/versions/draft",
  validate({ params: idParamsSchema, body: storylineDraftSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.createStorylineDraft(id, req.body as z.infer<typeof storylineDraftSchema>);
      res.status(201).json({
        success: true,
        data,
        message: "Storyline draft version created.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/storyline/versions/:versionId/activate",
  validate({ params: storylineVersionParamsSchema }),
  async (req, res, next) => {
    try {
      const { id, versionId } = req.params as z.infer<typeof storylineVersionParamsSchema>;
      const data = await novelService.activateStorylineVersion(id, versionId);
      res.status(200).json({
        success: true,
        data,
        message: "Storyline version activated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/storyline/versions/:versionId/freeze",
  validate({ params: storylineVersionParamsSchema }),
  async (req, res, next) => {
    try {
      const { id, versionId } = req.params as z.infer<typeof storylineVersionParamsSchema>;
      const data = await novelService.freezeStorylineVersion(id, versionId);
      res.status(200).json({
        success: true,
        data,
        message: "Storyline version frozen.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/:id/storyline/versions/:versionId/diff",
  validate({ params: storylineVersionParamsSchema, query: storylineDiffQuerySchema }),
  async (req, res, next) => {
    try {
      const { id, versionId } = req.params as z.infer<typeof storylineVersionParamsSchema>;
      const query = storylineDiffQuerySchema.parse(req.query);
      const data = await novelService.getStorylineDiff(id, versionId, query.compareVersion);
      res.status(200).json({
        success: true,
        data,
        message: "Storyline diff loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/storyline/impact-analysis",
  validate({ params: idParamsSchema, body: storylineImpactSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.analyzeStorylineImpact(id, req.body as z.infer<typeof storylineImpactSchema>);
      res.status(200).json({
        success: true,
        data,
        message: "Storyline impact analysis completed.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/chapters/:chapterId/review",
  validate({ params: chapterParamsSchema, body: reviewSchema }),
  async (req, res, next) => {
    try {
      const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
      const data = await novelService.reviewChapter(
        id,
        chapterId,
        req.body as z.infer<typeof reviewSchema>,
      );
      res.status(200).json({
        success: true,
        data,
        message: "章节审校完成。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/chapters/:chapterId/repair",
  validate({ params: chapterParamsSchema, body: repairSchema }),
  async (req, res, next) => {
    try {
      const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
      const { stream, onDone } = await novelService.createRepairStream(
        id,
        chapterId,
        req.body as z.infer<typeof repairSchema>,
      );
      await streamToSSE(res, stream, onDone);
    } catch (error) {
      next(error);
    }
  },
);

router.get("/:id/quality-report", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await novelService.getQualityReport(id);
    res.status(200).json({
      success: true,
      data,
      message: "获取质量报告成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:id/hooks/generate",
  validate({ params: idParamsSchema, body: hookGenerateSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.generateChapterHook(
        id,
        req.body as z.infer<typeof hookGenerateSchema>,
      );
      res.status(200).json({
        success: true,
        data,
        message: "章节钩子生成成功。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/outline/generate",
  validate({ params: idParamsSchema, body: outlineGenerateSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const { stream, onDone } = await novelService.createOutlineStream(
        id,
        req.body as z.infer<typeof outlineGenerateSchema>,
      );
      await streamToSSE(res, stream, onDone);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/outline/optimize-preview",
  validate({ params: idParamsSchema, body: draftOptimizeSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelDraftOptimizeService.optimizePreview(id, {
        ...(req.body as z.infer<typeof draftOptimizeSchema>),
        target: "outline",
      });
      res.status(200).json({
        success: true,
        data,
        message: "发展走向优化预览生成成功。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/structured-outline/generate",
  validate({ params: idParamsSchema, body: structuredOutlineSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const { stream, onDone } = await novelService.createStructuredOutlineStream(
        id,
        req.body as z.infer<typeof structuredOutlineSchema>,
      );
      await streamToSSE(res, stream, onDone);
    } catch (error) {
      if (forwardBusinessError(error, next)) {
        return;
      }
      next(error);
    }
  },
);

router.post(
  "/:id/structured-outline/optimize-preview",
  validate({ params: idParamsSchema, body: draftOptimizeSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelDraftOptimizeService.optimizePreview(id, {
        ...(req.body as z.infer<typeof draftOptimizeSchema>),
        target: "structured_outline",
      });
      res.status(200).json({
        success: true,
        data,
        message: "结构化大纲优化预览生成成功。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/chapters/:chapterId/generate",
  validate({ params: chapterParamsSchema, body: chapterGenerateSchema }),
  async (req, res, next) => {
    try {
      const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
      const { stream, onDone } = await novelService.createChapterStream(
        id,
        chapterId,
        req.body as z.infer<typeof chapterGenerateSchema>,
      );
      await streamToSSE(res, stream, onDone);
    } catch (error) {
      if (forwardBusinessError(error, next)) {
        return;
      }
      next(error);
    }
  },
);

router.post(
  "/:id/title/generate",
  validate({ params: idParamsSchema, body: llmGenerateSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const data = await novelService.generateTitles(id, req.body as z.infer<typeof llmGenerateSchema>);
      res.status(200).json({
        success: true,
        data,
        message: "生成标题成功。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
