import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import {
  hasChapterQualityLoopReplanRequiredRiskFlags,
  readChapterQualityDebtDetails,
} from "@ai-novel/shared/types/chapterQualityLoop";
import { NOVEL_LIST_PAGE_LIMIT_DEFAULT, NOVEL_LIST_PAGE_LIMIT_MAX } from "@ai-novel/shared/types/pagination";
import { z } from "zod";
import type { SimpleCreationShelfProjection } from "@ai-novel/shared/types/novel";
import { parsePersistedDirectorRiskAssessment } from "@ai-novel/shared/types/directorRisk";
import { prisma } from "../../../../db/prisma";
import { llmProviderSchema } from "../../../../llm/providerSchema";
import { validate } from "../../../../middleware/validate";
import { KnowledgeService } from "../../../../services/knowledge/KnowledgeService";
import { novelCreateResourceRecommendationService } from "../../../../services/novel/NovelCreateResourceRecommendationService";
import type { NovelApplicationServices } from "../../../../services/novel/application/NovelApplicationContracts";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(NOVEL_LIST_PAGE_LIMIT_MAX).default(NOVEL_LIST_PAGE_LIMIT_DEFAULT),
  search: z.string().trim().max(120).optional(),
  status: z.enum(["draft", "published"]).optional(),
  narrativeForm: z.enum(["short_story", "long_novel"]).optional(),
  writingMode: z.enum(["original", "continuation"]).optional(),
  sort: z.enum(["updated", "created", "progress"]).default("updated"),
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
const creationExperienceParamsSchema = idParamsSchema.extend({
  experience: z.enum(["simple", "professional"]),
});

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> | null {
  if (!value?.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

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
  referenceBookAnalysisId: z.string().trim().optional(),
  referenceBookAnalysisSections: z.array(bookAnalysisSectionKeySchema).min(1).max(8).optional(),
  projectMode: z.enum(["ai_led", "co_pilot", "draft_mode", "auto_pipeline"]).optional(),
  creationExperience: z.enum(["simple", "professional"]).optional(),
  narrativePov: z.enum(["first_person", "third_person", "mixed"]).optional(),
  pacePreference: z.enum(["slow", "balanced", "fast"]).optional(),
  styleTone: z.string().trim().optional(),
  emotionIntensity: z.enum(["low", "medium", "high"]).optional(),
  aiFreedom: z.enum(["low", "medium", "high"]).optional(),
  postGenerationStyleReviewEnabled: z.boolean().optional(),
  defaultChapterLength: z.number().int().min(500).max(10000).optional(),
  estimatedChapterCount: z.number().int().min(1).max(2000).optional(),
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
  referenceBookAnalysisId: z.string().trim().nullable().optional(),
  referenceBookAnalysisSections: z.array(bookAnalysisSectionKeySchema).min(1).max(8).nullable().optional(),
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
  postGenerationStyleReviewEnabled: z.boolean().optional(),
  defaultChapterLength: z.number().int().min(500).max(10000).nullable().optional(),
  estimatedChapterCount: z.number().int().min(1).max(2000).nullable().optional(),
  projectStatus: z.enum(["not_started", "in_progress", "completed", "rework", "blocked"]).nullable().optional(),
  storylineStatus: z.enum(["not_started", "in_progress", "completed", "rework", "blocked"]).nullable().optional(),
  outlineStatus: z.enum(["not_started", "in_progress", "completed", "rework", "blocked"]).nullable().optional(),
  resourceReadyScore: z.number().int().min(0).max(100).nullable().optional(),
});

const knowledgeBindingsSchema = z.object({
  documentIds: z.array(z.string().trim().min(1)).default([]),
});

const createResourceRecommendationSchema = z.object({
  title: z.string().trim().optional(),
  description: z.string().trim().optional(),
  targetAudience: z.string().trim().optional(),
  bookSellingPoint: z.string().trim().optional(),
  competingFeel: z.string().trim().optional(),
  first30ChapterPromise: z.string().trim().optional(),
  commercialTags: z.array(z.string().trim().min(1).max(20)).max(6).optional(),
  genreId: z.string().trim().optional(),
  primaryStoryModeId: z.string().trim().optional(),
  secondaryStoryModeId: z.string().trim().optional(),
  writingMode: z.enum(["original", "continuation"]).optional(),
  projectMode: z.enum(["ai_led", "co_pilot", "draft_mode", "auto_pipeline"]).optional(),
  narrativePov: z.enum(["first_person", "third_person", "mixed"]).optional(),
  pacePreference: z.enum(["slow", "balanced", "fast"]).optional(),
  styleTone: z.string().trim().optional(),
  emotionIntensity: z.enum(["low", "medium", "high"]).optional(),
  aiFreedom: z.enum(["low", "medium", "high"]).optional(),
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
}).refine(
  (value) => [
    value.title,
    value.description,
    value.targetAudience,
    value.bookSellingPoint,
    value.competingFeel,
    value.first30ChapterPromise,
    value.styleTone,
    ...(value.commercialTags ?? []),
  ].some((item) => typeof item === "string" && item.trim().length > 0),
  { message: "至少提供一句话概述、卖点、读者定位或类似开书信息，系统才能推荐资源组合。" },
);

interface RegisterNovelBaseRoutesInput {
  router: Router;
  novelService: Pick<NovelApplicationServices,
    | "listNovels"
    | "createNovel"
    | "getNovelById"
    | "updateNovel"
    | "deleteNovel"
  >;
}

export function registerNovelBaseRoutes(input: RegisterNovelBaseRoutesInput): void {
  const { router, novelService } = input;
  const knowledgeService = new KnowledgeService();

  router.get("/", validate({ query: paginationSchema }), async (req, res, next) => {
    try {
      const query = paginationSchema.parse(req.query);
      const data = await novelService.listNovels(query);
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
      const createInput = req.body as z.infer<typeof createNovelSchema>;
      const foundation = await novelCreateResourceRecommendationService.resolveRequired(createInput);
      const data = await novelService.createNovel({
        ...createInput,
        genreId: foundation.genreId,
        primaryStoryModeId: foundation.primaryStoryModeId,
        secondaryStoryModeId: foundation.secondaryStoryModeId,
      });
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

  router.post("/resource-recommendation", validate({ body: createResourceRecommendationSchema }), async (req, res, next) => {
    try {
      const data = await novelCreateResourceRecommendationService.recommend(
        req.body as z.infer<typeof createResourceRecommendationSchema>,
      );
      res.status(200).json({
        success: true,
        data,
        message: "AI 已生成开书资源推荐。",
      } satisfies ApiResponse<typeof data>);
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

  router.get("/:id/simple-shelf", validate({ params: idParamsSchema }), async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamsSchema>;
      const novel = await prisma.novel.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          description: true,
          bookSellingPoint: true,
          competingFeel: true,
          first30ChapterPromise: true,
          creationExperience: true,
          estimatedChapterCount: true,
          world: {
            select: {
              name: true,
              overviewSummary: true,
              description: true,
            },
          },
          bookContract: {
            select: {
              readingPromise: true,
              protagonistFantasy: true,
              coreSellingPoint: true,
            },
          },
          characters: {
            orderBy: { createdAt: "asc" },
            take: 12,
            select: {
              id: true,
              name: true,
              role: true,
              storyFunction: true,
              currentGoal: true,
              personality: true,
            },
          },
          volumePlans: {
            where: { status: "active" },
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              sortOrder: true,
              title: true,
              summary: true,
              mainPromise: true,
              _count: {
                select: { chapters: true },
              },
            },
          },
          chapters: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              order: true,
              title: true,
              content: true,
              chapterStatus: true,
              generationState: true,
              riskFlags: true,
              updatedAt: true,
            },
          },
          _count: {
            select: {
              characters: true,
              volumePlans: true,
            },
          },
          workflowTasks: {
            where: { lane: "auto_director" },
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              progress: true,
              currentItemLabel: true,
              pendingManualRecovery: true,
              lastError: true,
              checkpointType: true,
              seedPayloadJson: true,
              directorEvents: {
                orderBy: { occurredAt: "desc" },
                take: 80,
                select: { id: true, metadataJson: true },
              },
            },
          },
        },
      });
      if (!novel) {
        res.status(404).json({ success: false, error: "小说不存在。" } satisfies ApiResponse<null>);
        return;
      }
      const task = novel.workflowTasks[0] ?? null;
      const seedPayload = parseJsonRecord(task?.seedPayloadJson);
      const autoExecution = seedPayload?.autoExecution;
      const autoExecutionRecord = autoExecution && typeof autoExecution === "object" && !Array.isArray(autoExecution)
        ? autoExecution as Record<string, unknown>
        : null;
      const riskHistory = task?.directorEvents.flatMap((event) => {
        const metadata = parseJsonRecord(event.metadataJson);
        const assessment = parsePersistedDirectorRiskAssessment(metadata?.riskAssessment);
        return assessment ? [{ ...assessment, eventId: event.id }] : [];
      }) ?? [];
      const completedChapters = novel.chapters.filter((chapter) => (
        chapter.chapterStatus === "completed"
        || chapter.generationState === "approved"
        || chapter.generationState === "published"
      )).length;
      const totalChapters = Math.max(
        novel.chapters.length,
        novel.estimatedChapterCount ?? 0,
        completedChapters,
      );
      const taskStatus = task?.status;
      const progressStatus: SimpleCreationShelfProjection["progress"]["status"] =
        taskStatus === "failed" ? "failed"
          : taskStatus === "succeeded" ? "completed"
            : task?.pendingManualRecovery || taskStatus === "waiting_approval" ? "paused"
              : taskStatus === "running" ? "running"
                : "queued";
      const chapters: SimpleCreationShelfProjection["chapters"] = novel.chapters.map((chapter) => {
        const isCompleted = chapter.chapterStatus === "completed"
          || chapter.generationState === "approved"
          || chapter.generationState === "published";
        const content = chapter.content?.trim() || null;
        const qualityDebt = content ? readChapterQualityDebtDetails(chapter.riskFlags) : null;
        const requiresReplan = hasChapterQualityLoopReplanRequiredRiskFlags(chapter.riskFlags);
        const status: SimpleCreationShelfProjection["chapters"][number]["status"] = requiresReplan
          ? "replan_required"
          : qualityDebt
            ? "quality_debt"
            : isCompleted
              ? "completed"
              : chapter.chapterStatus === "needs_repair" || chapter.chapterStatus === "pending_review"
                ? "reviewing"
                : chapter.chapterStatus === "generating"
                  ? "generating"
                  : chapter.chapterStatus === "pending_generation"
                    ? "waiting_writing"
                    : progressStatus === "failed" && task?.checkpointType?.includes("chapter")
                      ? "error"
                      : "waiting_planning";
        return {
          id: chapter.id,
          order: chapter.order,
          title: chapter.title,
          status,
          wordCount: content ? Array.from(content).length : 0,
          content,
          updatedAt: chapter.updatedAt.toISOString(),
          qualityDebt,
        };
      });
      const data: SimpleCreationShelfProjection = {
        novel: {
          id: novel.id,
          title: novel.title,
          creationExperience: novel.creationExperience,
          estimatedChapterCount: novel.estimatedChapterCount,
        },
        progress: {
          directorTaskId: task?.id ?? null,
          percent: task ? Math.max(0, Math.min(100, Math.round(task.progress))) : 0,
          completedChapters,
          totalChapters,
          currentAction: task?.currentItemLabel ?? (progressStatus === "completed" ? "整本书已完成" : "等待 AI 开始处理"),
          status: progressStatus,
          canRetry: progressStatus === "failed" || progressStatus === "paused",
          recoveryAction: task?.checkpointType === "replan_required" ? "replan_and_continue" : "continue",
          safetyMessage: task?.lastError ?? null,
          latestRiskAssessment: riskHistory[0] ?? null,
          riskHistory,
        },
        chapters,
        materials: {
          description: novel.description,
          characterCount: novel._count.characters,
          volumeCount: novel._count.volumePlans,
          openQualityDebtCount: chapters.filter((chapter) => chapter.qualityDebt).length,
          story: {
            coreSellingPoint: novel.bookContract?.coreSellingPoint ?? novel.bookSellingPoint,
            readingPromise: novel.bookContract?.readingPromise ?? novel.competingFeel,
            first30ChapterPromise: novel.first30ChapterPromise,
            protagonistFantasy: novel.bookContract?.protagonistFantasy ?? null,
          },
          world: novel.world
            ? {
                name: novel.world.name,
                summary: novel.world.overviewSummary ?? novel.world.description,
              }
            : null,
          characters: novel.characters,
          volumes: novel.volumePlans.map((volume) => ({
            id: volume.id,
            order: volume.sortOrder,
            title: volume.title,
            summary: volume.summary,
            mainPromise: volume.mainPromise,
            chapterCount: volume._count.chapters,
          })),
        },
      };
      res.status(200).json({ success: true, data, message: "章节书架已更新。" } satisfies ApiResponse<typeof data>);
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

  router.post(
    "/:id/creation-experience/:experience",
    validate({ params: creationExperienceParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, experience } = req.params as z.infer<typeof creationExperienceParamsSchema>;
        const current = await novelService.getNovelById(id);
        if (!current) {
          res.status(404).json({
            success: false,
            error: "小说不存在。",
          } satisfies ApiResponse<null>);
          return;
        }
        const data = current.creationExperience === experience
          ? current
          : await novelService.updateNovel(id, { creationExperience: experience });
        res.status(200).json({
          success: true,
          data,
        message: experience === "simple"
            ? "已切换到简易模式，将优先展示章节进度与成稿。"
            : "已切换到专业模式，将展示完整创作工作台。",
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
