import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { respondWithSSEError, startSSE, streamToSSE } from "../llm/streaming";
import { validate } from "../middleware/validate";
import type { NovelService } from "../services/novel/NovelService";

interface RegisterNovelReviewRoutesInput {
  router: Router;
  novelService: NovelService;
  idParamsSchema: z.ZodType<{ id: string }>;
  chapterParamsSchema: z.ZodType<{ id: string; chapterId: string }>;
  auditIssueParamsSchema: z.ZodType<{ id: string; issueId: string }>;
  reviewSchema: z.ZodTypeAny;
  repairSchema: z.ZodTypeAny;
}

export function registerNovelReviewRoutes(input: RegisterNovelReviewRoutesInput): void {
  const {
    router,
    novelService,
    idParamsSchema,
    chapterParamsSchema,
    auditIssueParamsSchema,
    reviewSchema,
    repairSchema,
  } = input;

  router.post(
    "/:id/chapters/:chapterId/review",
    validate({ params: chapterParamsSchema, body: reviewSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.reviewChapter(id, chapterId, req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Chapter review completed.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/chapters/:chapterId/audit/continuity",
    validate({ params: chapterParamsSchema, body: reviewSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.auditChapter(id, chapterId, "continuity", req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Continuity audit completed.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/chapters/:chapterId/audit/character",
    validate({ params: chapterParamsSchema, body: reviewSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.auditChapter(id, chapterId, "character", req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Character audit completed.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/chapters/:chapterId/audit/plot",
    validate({ params: chapterParamsSchema, body: reviewSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.auditChapter(id, chapterId, "plot", req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Plot audit completed.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/chapters/:chapterId/audit/full",
    validate({ params: chapterParamsSchema, body: reviewSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.auditChapter(id, chapterId, "full", req.body as any);
        res.status(200).json({
          success: true,
          data,
          message: "Full audit completed.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/:id/chapters/:chapterId/audit-reports",
    validate({ params: chapterParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
        const data = await novelService.listChapterAuditReports(id, chapterId);
        res.status(200).json({
          success: true,
          data,
          message: "Audit reports loaded.",
        } satisfies ApiResponse<typeof data>);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:id/audit-issues/:issueId/resolve",
    validate({ params: auditIssueParamsSchema }),
    async (req, res, next) => {
      try {
        const { id, issueId } = req.params as z.infer<typeof auditIssueParamsSchema>;
        const data = await novelService.resolveAuditIssues(id, [issueId]);
        res.status(200).json({
          success: true,
          data,
          message: "Audit issue resolved.",
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
      const { id, chapterId } = req.params as z.infer<typeof chapterParamsSchema>;
      const runStatus = {
        runId: `chapter-repair:${chapterId}`,
        queuedMessage: "正在准备章节修复上下文。",
        runningMessage: "章节修复已开始流式生成。",
        failedMessage: "章节修复失败。",
      };
      const disposeHeartbeat = startSSE(res, runStatus);
      try {
        const { stream, onDone } = await novelService.createRepairStream(
          id,
          chapterId,
          req.body as any,
        );
        await streamToSSE(res, stream, onDone, { disposeHeartbeat, runStatus });
      } catch (error) {
        respondWithSSEError(res, error, {
          disposeHeartbeat,
          runStatus,
          fallbackMessage: "章节修复失败。",
        });
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
        message: "Quality report loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  });
}
