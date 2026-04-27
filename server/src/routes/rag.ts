import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { ragServices } from "../services/rag";
import { ragConfig } from "../config/rag";

const router = Router();

const reindexSchema = z.object({
  scope: z.enum(["novel", "world", "all"]),
  id: z.string().trim().optional(),
  tenantId: z.string().trim().optional(),
});

const jobsQuerySchema = z.object({
  status: z.enum(["queued", "running", "succeeded", "failed", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const jobParamsSchema = z.object({
  jobId: z.string().trim().min(1),
});

router.use(authMiddleware);

router.post("/reindex", validate({ body: reindexSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof reindexSchema>;
    const data = await ragServices.ragIndexService.enqueueReindex(body.scope, body.id, body.tenantId);
    res.status(202).json({
      success: true,
      data,
      message: "RAG reindex jobs queued.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/jobs", validate({ query: jobsQuerySchema }), async (req, res, next) => {
  try {
    const query = jobsQuerySchema.parse(req.query);
    const data = await ragServices.ragIndexService.listJobSummaries(query.limit, query.status);
    res.status(200).json({
      success: true,
      data,
      message: "RAG job list loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.delete("/jobs/finished", async (_req, res, next) => {
  try {
    const data = await ragServices.ragJobCleanupService.clearFinishedJobs();
    res.status(200).json({
      success: true,
      data,
      message: data.deletedCount > 0
        ? `已清理 ${data.deletedCount} 个已结束任务。`
        : "没有可清理的已结束任务。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.delete("/jobs/:jobId", validate({ params: jobParamsSchema }), async (req, res, next) => {
  try {
    const { jobId } = req.params as z.infer<typeof jobParamsSchema>;
    const data = await ragServices.ragJobCleanupService.deleteFinishedJob(jobId);
    if (data.deletedCount === 0) {
      throw new AppError("排队中或执行中的任务不能删除。", 409);
    }
    res.status(200).json({
      success: true,
      data: {
        jobId,
        ...data,
      },
      message: "任务记录已删除。",
    } satisfies ApiResponse<{ jobId: string; deletedCount: number; status: string }>);
  } catch (error) {
    if (error instanceof Error && error.message === "RAG job not found.") {
      next(new AppError("没有找到这个任务。", 404));
      return;
    }
    next(error);
  }
});

router.get("/health", async (_req, res, next) => {
  try {
    const [embedding, qdrant] = await Promise.all([
      ragServices.embeddingService.healthCheck(),
      ragServices.vectorStoreService.healthCheck(),
    ]);
    const data = {
      embedding: {
        ...embedding,
        timeoutMs: ragConfig.embeddingTimeoutMs,
        batchSize: ragConfig.embeddingBatchSize,
        maxRetries: ragConfig.embeddingMaxRetries,
      },
      qdrant: {
        ...qdrant,
        timeoutMs: ragConfig.qdrantTimeoutMs,
      },
      ok: embedding.ok && qdrant.ok,
    };
    res.status(data.ok ? 200 : 503).json({
      success: data.ok,
      data,
      message: data.ok ? "RAG health check passed." : "RAG health check failed.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

export default router;
