import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { NOVEL_LIST_PAGE_LIMIT_DEFAULT, NOVEL_LIST_PAGE_LIMIT_MAX } from "@ai-novel/shared/types/pagination";
import { z } from "zod";
import { validate } from "../middleware/validate";
import { KnowledgeService } from "../services/knowledge/KnowledgeService";
import { NovelService } from "../services/novel/NovelService";

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

const createNovelSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空。"),
  description: z.string().trim().optional(),
  targetAudience: z.string().trim().optional(),
  bookSellingPoint: z.string().trim().optional(),
  competingFeel: z.string().trim().optional(),
  first30ChapterPromise: z.string().trim().optional(),
  commercialTags: z.array(z.string().trim().min(1).max(20)).max(6).optional(),
  genreId: z.string().trim().optional(),
  primaryStoryModeId: z.string().trim().optional(),
  secondaryStoryModeId: z.string().trim().optional(),
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
  targetAudience: z.string().trim().nullable().optional(),
  bookSellingPoint: z.string().trim().nullable().optional(),
  competingFeel: z.string().trim().nullable().optional(),
  first30ChapterPromise: z.string().trim().nullable().optional(),
  commercialTags: z.array(z.string().trim().min(1).max(20)).max(6).nullable().optional(),
  status: z.enum(["draft", "published"]).optional(),
  writingMode: z.enum(["original", "continuation"]).optional(),
  sourceNovelId: z.string().trim().nullable().optional(),
  sourceKnowledgeDocumentId: z.string().trim().nullable().optional(),
  continuationBookAnalysisId: z.string().trim().nullable().optional(),
  continuationBookAnalysisSections: z.array(bookAnalysisSectionKeySchema).min(1).max(8).nullable().optional(),
  genreId: z.string().trim().nullable().optional(),
  primaryStoryModeId: z.string().trim().nullable().optional(),
  secondaryStoryModeId: z.string().trim().nullable().optional(),
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

interface RegisterNovelBaseRoutesInput {
  router: Router;
}

export function registerNovelBaseRoutes(input: RegisterNovelBaseRoutesInput): void {
  const { router } = input;
  const novelService = new NovelService();
  const knowledgeService = new KnowledgeService();

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
}
