import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { ragServices } from "../services/rag";
import { getRagEmbeddingModelOptions } from "../services/settings/RagEmbeddingModelService";
import {
  getRagEmbeddingProviders,
  getRagEmbeddingSettings,
  saveRagEmbeddingSettings,
} from "../services/settings/RagSettingsService";
import {
  getRagRuntimeSettings,
  saveRagRuntimeSettings,
} from "../services/settings/RagRuntimeSettingsService";
import {
  getStyleEngineRuntimeSettings,
  MAX_STYLE_EXTRACTION_TIMEOUT_MS,
  MIN_STYLE_EXTRACTION_TIMEOUT_MS,
  saveStyleEngineRuntimeSettings,
} from "../services/settings/StyleEngineRuntimeSettingsService";

const router = Router();

const ragSettingsSchema = z.object({
  embeddingProvider: z.enum(["openai", "siliconflow"]),
  embeddingModel: z.string().trim().min(1),
  collectionMode: z.enum(["auto", "manual"]),
  collectionName: z.string().trim().min(1),
  collectionTag: z.string().trim().min(1),
  autoReindexOnChange: z.boolean(),
  embeddingBatchSize: z.coerce.number().int().min(1).max(256),
  embeddingTimeoutMs: z.coerce.number().int().min(5000).max(300000),
  embeddingMaxRetries: z.coerce.number().int().min(0).max(8),
  embeddingRetryBaseMs: z.coerce.number().int().min(100).max(10000),
  enabled: z.boolean(),
  qdrantUrl: z.string().trim().min(1),
  qdrantApiKey: z.string().optional(),
  clearQdrantApiKey: z.boolean().optional(),
  qdrantTimeoutMs: z.coerce.number().int().min(1000).max(300000),
  qdrantUpsertMaxBytes: z.coerce.number().int().min(1024 * 1024).max(64 * 1024 * 1024),
  chunkSize: z.coerce.number().int().min(200).max(4000),
  chunkOverlap: z.coerce.number().int().min(0).max(1000),
  vectorCandidates: z.coerce.number().int().min(1).max(200),
  keywordCandidates: z.coerce.number().int().min(1).max(200),
  finalTopK: z.coerce.number().int().min(1).max(50),
  workerPollMs: z.coerce.number().int().min(200).max(60000),
  workerMaxAttempts: z.coerce.number().int().min(1).max(20),
  workerRetryBaseMs: z.coerce.number().int().min(1000).max(300000),
  httpTimeoutMs: z.coerce.number().int().min(1000).max(300000),
});

const styleEngineRuntimeSettingsSchema = z.object({
  styleExtractionTimeoutMs: z.coerce
    .number()
    .int()
    .min(MIN_STYLE_EXTRACTION_TIMEOUT_MS)
    .max(MAX_STYLE_EXTRACTION_TIMEOUT_MS),
});

const ragEmbeddingProviderSchema = z.object({
  provider: z.enum(["openai", "siliconflow"]),
});

router.use(authMiddleware);

router.get("/style-engine-runtime", async (_req, res, next) => {
  try {
    const data = await getStyleEngineRuntimeSettings();
    res.status(200).json({
      success: true,
      data,
      message: "写法引擎运行设置读取成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put(
  "/style-engine-runtime",
  validate({ body: styleEngineRuntimeSettingsSchema }),
  async (req, res, next) => {
    try {
      const data = await saveStyleEngineRuntimeSettings(req.body as z.infer<typeof styleEngineRuntimeSettingsSchema>);
      res.status(200).json({
        success: true,
        data,
        message: "写法引擎运行设置保存成功。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get("/rag", async (_req, res, next) => {
  try {
    const [embeddingSettings, runtimeSettings, providers] = await Promise.all([
      getRagEmbeddingSettings(),
      getRagRuntimeSettings(),
      getRagEmbeddingProviders(),
    ]);
    const data = {
      ...embeddingSettings,
      ...runtimeSettings,
      providers,
    };
    res.status(200).json({
      success: true,
      data,
      message: "Loaded RAG settings.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put(
  "/rag",
  validate({ body: ragSettingsSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof ragSettingsSchema>;
      const [embeddingResult, runtimeResult] = await Promise.all([
        saveRagEmbeddingSettings({
          embeddingProvider: body.embeddingProvider,
          embeddingModel: body.embeddingModel,
          collectionMode: body.collectionMode,
          collectionName: body.collectionName,
          collectionTag: body.collectionTag,
          autoReindexOnChange: body.autoReindexOnChange,
          embeddingBatchSize: body.embeddingBatchSize,
          embeddingTimeoutMs: body.embeddingTimeoutMs,
          embeddingMaxRetries: body.embeddingMaxRetries,
          embeddingRetryBaseMs: body.embeddingRetryBaseMs,
        }),
        saveRagRuntimeSettings({
          enabled: body.enabled,
          qdrantUrl: body.qdrantUrl,
          qdrantApiKey: body.qdrantApiKey,
          clearQdrantApiKey: body.clearQdrantApiKey,
          qdrantTimeoutMs: body.qdrantTimeoutMs,
          qdrantUpsertMaxBytes: body.qdrantUpsertMaxBytes,
          chunkSize: body.chunkSize,
          chunkOverlap: body.chunkOverlap,
          vectorCandidates: body.vectorCandidates,
          keywordCandidates: body.keywordCandidates,
          finalTopK: body.finalTopK,
          workerPollMs: body.workerPollMs,
          workerMaxAttempts: body.workerMaxAttempts,
          workerRetryBaseMs: body.workerRetryBaseMs,
          httpTimeoutMs: body.httpTimeoutMs,
        }),
      ]);

      if (runtimeResult.settings.enabled) {
        ragServices.ragWorker.start();
      } else {
        ragServices.ragWorker.stop();
      }

      const shouldReindex = (embeddingResult.shouldReindex || runtimeResult.shouldReindex)
        && embeddingResult.settings.autoReindexOnChange
        && runtimeResult.settings.enabled;

      let reindexQueuedCount = 0;
      let message = "Saved RAG settings.";
      if (shouldReindex) {
        const reindexResult = await ragServices.ragIndexService.enqueueReindex("all");
        reindexQueuedCount = reindexResult.count;
        message = `Saved RAG settings and queued ${reindexQueuedCount} reindex job(s).`;
      } else if ((embeddingResult.shouldReindex || runtimeResult.shouldReindex) && !runtimeResult.settings.enabled) {
        message = "Saved RAG settings. Reindex was skipped because RAG is currently disabled.";
      }

      const providers = await getRagEmbeddingProviders();
      const data = {
        ...embeddingResult.settings,
        ...runtimeResult.settings,
        reindexQueuedCount,
        providers,
      };
      res.status(200).json({
        success: true,
        data,
        message,
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/rag/models/:provider",
  validate({ params: ragEmbeddingProviderSchema }),
  async (req, res, next) => {
    try {
      const { provider } = req.params as z.infer<typeof ragEmbeddingProviderSchema>;
      const data = await getRagEmbeddingModelOptions(provider);
      res.status(200).json({
        success: true,
        data,
        message: "Loaded embedding models.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
