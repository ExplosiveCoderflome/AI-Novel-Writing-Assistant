import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { PROVIDERS, SUPPORTED_PROVIDERS } from "../llm/providers";
import { getProviderModels, refreshProviderModels } from "../llm/modelCatalog";
import { authMiddleware } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { ragServices } from "../services/rag";
import {
  getRagEmbeddingProviders,
  getRagEmbeddingSettings,
  saveRagEmbeddingSettings,
} from "../services/settings/RagSettingsService";
import { getRagEmbeddingModelOptions } from "../services/settings/RagEmbeddingModelService";
import { providerBalanceService } from "../services/settings/ProviderBalanceService";

const router = Router();

const providerSchema = z.object({
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic", "grok", "kimi", "glm", "qwen", "gemini"]),
});

const upsertApiKeySchema = z.object({
  key: z.string().trim().min(1, "API Key 不能为空。"),
  model: z.string().trim().optional(),
  isActive: z.boolean().optional(),
});

const ragSettingsSchema = z.object({
  embeddingProvider: z.enum(["openai", "siliconflow"]),
  embeddingModel: z.string().trim().min(1, "嵌入模型不能为空。"),
  collectionMode: z.enum(["auto", "manual"]),
  collectionName: z.string().trim().min(1, "向量集合名不能为空。"),
  collectionTag: z.string().trim().min(1, "集合标识不能为空。"),
  autoReindexOnChange: z.boolean(),
  embeddingBatchSize: z.coerce.number().int().min(1).max(256),
  embeddingTimeoutMs: z.coerce.number().int().min(5000).max(300000),
  embeddingMaxRetries: z.coerce.number().int().min(0).max(8),
  embeddingRetryBaseMs: z.coerce.number().int().min(100).max(10000),
});

const ragEmbeddingProviderSchema = z.object({
  provider: z.enum(["openai", "siliconflow"]),
});

router.use(authMiddleware);

router.get("/rag", async (_req, res, next) => {
  try {
    const [settings, providers] = await Promise.all([
      getRagEmbeddingSettings(),
      getRagEmbeddingProviders(),
    ]);
    const data = {
      ...settings,
      providers,
    };
    res.status(200).json({
      success: true,
      data,
      message: "获取 RAG 设置成功。",
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
      const result = await saveRagEmbeddingSettings(body);
      let reindexQueuedCount = 0;
      let message = "RAG 设置保存成功。";
      if (result.shouldReindex && result.settings.autoReindexOnChange) {
        const reindexResult = await ragServices.ragIndexService.enqueueReindex("all");
        reindexQueuedCount = reindexResult.count;
        message = `RAG 设置保存成功，已自动触发全量重建索引（${reindexQueuedCount} 项）。`;
      }
      const data = {
        ...result.settings,
        reindexQueuedCount,
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
        message: "获取 Embedding 模型列表成功。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get("/api-keys", async (_req, res, next) => {
  try {
    const keys = await prisma.aPIKey.findMany();
    const keyMap = new Map(keys.map((item) => [item.provider, item]));
    const data = await Promise.all(SUPPORTED_PROVIDERS.map(async (provider) => {
      const item = keyMap.get(provider);
      const models = await getProviderModels(provider, {
        apiKey: item?.key,
      });
      return {
        provider,
        name: PROVIDERS[provider].name,
        currentModel: item?.model ?? PROVIDERS[provider].defaultModel,
        models,
        defaultModel: PROVIDERS[provider].defaultModel,
        isConfigured: Boolean(item?.key),
        isActive: item?.isActive ?? false,
      };
    }));
    res.status(200).json({
      success: true,
      data,
      message: "获取 API Key 配置成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/api-keys/balances", async (_req, res, next) => {
  try {
    const keys = await prisma.aPIKey.findMany({
      select: {
        provider: true,
        key: true,
      },
    });
    const keyMap = new Map(keys.map((item) => [item.provider as LLMProvider, item.key]));
    const data = await providerBalanceService.listBalances(keyMap);
    res.status(200).json({
      success: true,
      data,
      message: "获取厂商余额状态成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put(
  "/api-keys/:provider",
  validate({ params: providerSchema, body: upsertApiKeySchema }),
  async (req, res, next) => {
    try {
      const { provider } = req.params as z.infer<typeof providerSchema>;
      const body = req.body as z.infer<typeof upsertApiKeySchema>;
      const data = await prisma.aPIKey.upsert({
        where: { provider },
        update: {
          key: body.key,
          model: body.model,
          isActive: body.isActive ?? true,
        },
        create: {
          provider,
          key: body.key,
          model: body.model,
          isActive: body.isActive ?? true,
        },
      });
      let models = PROVIDERS[provider].models;
      let message = "保存 API Key 成功。";
      try {
        models = await refreshProviderModels(provider, body.key);
      } catch {
        message = "保存 API Key 成功，但模型列表更新失败，可稍后手动刷新。";
      }
      res.status(200).json({
        success: true,
        data: {
          provider: data.provider,
          model: data.model,
          isActive: data.isActive,
          models,
        },
        message,
      } satisfies ApiResponse<{
        provider: string;
        model: string | null;
        isActive: boolean;
        models: string[];
      }>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/api-keys/:provider/refresh-balance",
  validate({ params: providerSchema }),
  async (req, res, next) => {
    try {
      const { provider } = req.params as z.infer<typeof providerSchema>;
      const keyConfig = await prisma.aPIKey.findUnique({
        where: { provider },
        select: {
          key: true,
        },
      });
      const data = await providerBalanceService.getProviderBalance({
        provider,
        apiKey: keyConfig?.key,
      });
      res.status(200).json({
        success: true,
        data,
        message: data.status === "available" ? "余额刷新成功。" : data.message,
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/api-keys/:provider/refresh-models",
  validate({ params: providerSchema }),
  async (req, res, next) => {
    try {
      const { provider } = req.params as z.infer<typeof providerSchema>;
      const keyConfig = await prisma.aPIKey.findUnique({
        where: { provider },
      });
      if (!keyConfig?.key) {
        throw new AppError("请先配置 API Key，再刷新模型列表。", 400);
      }
      const models = await refreshProviderModels(provider, keyConfig.key);
      res.status(200).json({
        success: true,
        data: {
          provider,
          models,
          currentModel: keyConfig.model ?? PROVIDERS[provider].defaultModel,
        },
        message: "模型列表刷新成功。",
      } satisfies ApiResponse<{
        provider: string;
        models: string[];
        currentModel: string;
      }>);
    } catch (error) {
      if (error instanceof Error && /拉取模型列表失败|模型列表为空/.test(error.message)) {
        next(new AppError(error.message, 400));
        return;
      }
      next(error);
    }
  },
);

export default router;
