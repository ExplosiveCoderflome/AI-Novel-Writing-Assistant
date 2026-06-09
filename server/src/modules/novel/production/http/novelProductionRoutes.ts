import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { streamToSSE } from "../../../../llm/streaming";
import { validate } from "../../../../middleware/validate";
import type { NovelDraftOptimizeService } from "../../../../services/novel/NovelDraftOptimizeService";
import type { NovelApplicationServices } from "../../../../services/novel/application/NovelApplicationContracts";
import { timelineContextService, timelineRepository } from "../../../../modules/timeline";
import { prisma } from "../../../../db/prisma";

interface RegisterNovelProductionRoutesInput {
  router: Router;
  novelService: Pick<NovelApplicationServices,
    | "createOutlineStream"
    | "createStructuredOutlineStream"
    | "generateTitles"
    | "createBeatStream"
    | "generateChapterHook"
    | "startPipelineJob"
    | "getPipelineJob"
  >;
  novelDraftOptimizeService: NovelDraftOptimizeService;
  idParamsSchema: z.ZodType<{ id: string }>;
  pipelineJobParamsSchema: z.ZodType<{ id: string; jobId: string }>;
  titleGenerateSchema: z.ZodTypeAny;
  beatGenerateSchema: z.ZodTypeAny;
  pipelineRunSchema: z.ZodTypeAny;
  hookGenerateSchema: z.ZodTypeAny;
  outlineGenerateSchema: z.ZodTypeAny;
  structuredOutlineSchema: z.ZodTypeAny;
  draftOptimizeSchema: z.ZodTypeAny;
  forwardBusinessError: (error: unknown, next: (err?: unknown) => void) => boolean;
}

export function registerNovelProductionRoutes(input: RegisterNovelProductionRoutesInput): void {
  const {
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
  } = input;
  const chapterTimelineParamsSchema = z.object({
    id: z.string(),
    chapterId: z.string(),
  });

  router.get(
    "/:id/chapters/:chapterId/timeline",
    validate({ params: chapterTimelineParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterTimelineParamsSchema>;
        const chapter = await prisma.chapter.findFirst({
          where: { id: chapterId, novelId: id },
          select: { order: true },
        });
        if (!chapter) {
          res.status(404).json({
            success: false,
            error: "Chapter not found.",
          } satisfies ApiResponse<null>);
          return;
        }
        const [context, latestReport] = await Promise.all([
          timelineContextService.buildForChapter({
            novelId: id,
            chapterId,
            chapterIndex: chapter.order,
          }),
          timelineRepository.getLatestCheckReport({ novelId: id, chapterId }),
        ]);
        const data = { context, latestReport };
        res.status(200).json({
          success: true,
          data,
          message: "Chapter timeline loaded.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
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
          req.body as any,
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
        const data = await novelService.startPipelineJob(id, req.body as any);
        res.status(202).json({
          success: true,
          data,
          message: "Pipeline job created.",
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
            error: "Pipeline job not found.",
          } satisfies ApiResponse<null>);
          return;
        }
        res.status(200).json({
          success: true,
          data,
          message: "Pipeline job loaded.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/hooks/generate",
    validate({ params: idParamsSchema, body: hookGenerateSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.generateChapterHook(id, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Chapter hook generated.",
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
          req.body as any,
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
          ...(req.body as any),
          target: "outline",
        });
        res.status(200).json({
          success: true,
          data,
          message: "Outline optimization preview generated.",
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
          req.body as any,
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
          ...(req.body as any),
          target: "structured_outline",
        });
        res.status(200).json({
          success: true,
          data,
          message: "Structured outline optimization preview generated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  // ─── 开发工具：重置所有章节正文 ───────────────────────────────────────────────
  // 仅供本地测试使用。清除章节正文、生成状态、事实账本、摘要、质量报告等，
  // 让下次自动驾驶可以从零重新跑，节省重建项目的时间。
  router.post(
    "/:id/dev/reset-chapters",
    validate({ params: idParamsSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;

        // 1. 找出所有章节 id 和 order
        const chapters = await prisma.chapter.findMany({
          where: { novelId: id },
          select: { id: true, order: true },
        });
        if (chapters.length === 0) {
          res.status(200).json({
            success: true,
            data: { resetCount: 0 },
            message: "No chapters to reset.",
          } satisfies ApiResponse<{ resetCount: number }>);
          return;
        }
        const chapterIds = chapters.map((c) => c.id);
        const orders = chapters.map((c) => c.order);

        // 2. 事务内清除章节本体数据
        await prisma.$transaction(async (tx) => {
          await tx.chapter.updateMany({
            where: { id: { in: chapterIds } },
            data: {
              content: "",
              generationState: "planned",
              chapterStatus: "unplanned",
              repairHistory: null,
              qualityScore: null,
              continuityScore: null,
              characterScore: null,
              pacingScore: null,
              riskFlags: null,
              hook: null,
              expectation: null,
            },
          });
          await tx.chapterSummary.deleteMany({ where: { novelId: id, chapterId: { in: chapterIds } } });
          await tx.consistencyFact.deleteMany({ where: { novelId: id, chapterId: { in: chapterIds } } });
          await tx.characterTimeline.deleteMany({ where: { novelId: id, chapterId: { in: chapterIds } } });
          await tx.characterCandidate.deleteMany({ where: { novelId: id, sourceChapterId: { in: chapterIds } } });
          await tx.characterFactionTrack.deleteMany({ where: { novelId: id, chapterId: { in: chapterIds } } });
          await tx.characterRelationStage.deleteMany({ where: { novelId: id, chapterId: { in: chapterIds } } });
          await tx.qualityReport.deleteMany({ where: { novelId: id, chapterId: { in: chapterIds } } });
          await tx.auditReport.deleteMany({ where: { novelId: id, chapterId: { in: chapterIds } } });
          await tx.stateChangeProposal.deleteMany({ where: { novelId: id, chapterId: { in: chapterIds } } });
          await tx.openConflict.deleteMany({ where: { novelId: id, chapterId: { in: chapterIds } } });
          await tx.storyStateSnapshot.deleteMany({ where: { novelId: id, sourceChapterId: { in: chapterIds } } });
        });

        // 3. 事务外清除事实账本（按 order 范围）
        if (orders.length > 0) {
          await prisma.novelFactEntry.deleteMany({
            where: {
              novelId: id,
              chapterOrder: { in: orders },
            },
          });
        }

        res.status(200).json({
          success: true,
          data: { resetCount: chapters.length },
          message: `Reset ${chapters.length} chapters.`,
        } satisfies ApiResponse<{ resetCount: number }>);
      } catch (error) {
        next(error);
      }
    },
  );
  // ─────────────────────────────────────────────────────────────────────────────

  router.post(
    "/:id/title/generate",
    validate({ params: idParamsSchema, body: titleGenerateSchema }),
    async (req, res, next) => {
      try {
        const { id } = req.params as z.infer<typeof idParamsSchema>;
        const data = await novelService.generateTitles(id, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Titles generated.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );
}
