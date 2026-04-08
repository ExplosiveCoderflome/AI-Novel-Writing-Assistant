import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { BuiltinLLMProvider, LLMProvider } from "@ai-novel/shared/types/llm";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { setProviderSecretCache } from "../llm/factory";
import { getProviderModels, refreshProviderModels } from "../llm/modelCatalog";
import { llmProviderSchema } from "../llm/providerSchema";
import {
  getProviderEnvApiKey,
  getProviderEnvBaseUrl,
  getProviderEnvModel,
  isBuiltInProvider,
  providerRequiresApiKey,
  PROVIDERS,
  SUPPORTED_PROVIDERS,
} from "../llm/providers";
import { authMiddleware } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { ragServices } from "../services/rag";
import { providerBalanceService } from "../services/settings/ProviderBalanceService";
import { getRagEmbeddingModelOptions } from "../services/settings/RagEmbeddingModelService";
import {
  getRagEmbeddingProviders,
  getRagEmbeddingSettings,
  saveRagEmbeddingSettings,
} from "../services/settings/RagSettingsService";

const router = Router();

const providerSchema = z.object({
  provider: llmProviderSchema,
});

const upsertApiKeySchema = z.object({
  displayName: z.string().trim().min(1, "厂商名称不能为空。").optional(),
  key: z.string().trim().optional(),
  model: z.string().trim().optional(),
  baseURL: z.union([z.string().trim().url("API URL 格式不正确。"), z.literal("")]).optional(),
  isActive: z.boolean().optional(),
  reasoningEnabled: z.boolean().optional(),
});

const createCustomProviderSchema = z.object({
  name: z.string().trim().min(1, "厂商名称不能为空。"),
  key: z.string().trim().optional(),
  model: z.string().trim().min(1, "默认模型不能为空。"),
  baseURL: z.string().trim().url("API URL 格式不正确。"),
  isActive: z.boolean().optional(),
  reasoningEnabled: z.boolean().optional(),
});

const ragSettingsSchema = z.object({
  embeddingProvider: z.enum(["openai", "siliconflow"]),
  embeddingModel: z.string().trim().min(1, "嵌入模型不能为空。"),
  collectionMode: z.enum(["auto", "manual"]),
  collectionName: z.string().trim().min(1, "向量集合名称不能为空。"),
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

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

type APIKeyRecordLike = {
  provider: string;
  displayName: string | null;
  key: string | null;
  model: string | null;
  baseURL: string | null;
  isActive: boolean;
  reasoningEnabled?: boolean | null;
};

function buildCustomProviderId(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `custom_${normalized || "provider"}`;
}

async function ensureUniqueCustomProviderId(name: string): Promise<string> {
  const baseId = buildCustomProviderId(name);
  let candidate = baseId;
  let suffix = 2;
  while (await prisma.aPIKey.findUnique({ where: { provider: candidate }, select: { id: true } })) {
    candidate = `${baseId}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function getFallbackModels(provider: LLMProvider, currentModel?: string): string[] {
  const models = isBuiltInProvider(provider) ? PROVIDERS[provider].models : [];
  return Array.from(new Set([...models, currentModel ?? ""].filter(Boolean)));
}

async function buildBuiltInProviderStatus(
  provider: BuiltinLLMProvider,
  item?: {
    displayName?: string | null;
    key?: string | null;
    model?: string | null;
    baseURL?: string | null;
    isActive?: boolean;
    reasoningEnabled?: boolean | null;
  },
) {
  const savedKey = normalizeOptionalText(item?.key);
  const envKey = getProviderEnvApiKey(provider);
  const effectiveKey = savedKey ?? envKey;
  const savedBaseURL = normalizeOptionalText(item?.baseURL);
  const currentModel = normalizeOptionalText(item?.model)
    ?? getProviderEnvModel(provider)
    ?? PROVIDERS[provider].defaultModel;
  const currentBaseURL = savedBaseURL
    ?? getProviderEnvBaseUrl(provider)
    ?? PROVIDERS[provider].baseURL;
  const requiresApiKey = providerRequiresApiKey(provider);
  const models = await getProviderModels(provider, {
    apiKey: effectiveKey,
    baseURL: savedBaseURL,
    fallbackModel: currentModel,
    fallbackModels: getFallbackModels(provider, currentModel),
  });
  const isConfigured = requiresApiKey ? Boolean(effectiveKey) : Boolean(currentModel && currentBaseURL);
  return {
    provider,
    kind: "builtin" as const,
    name: PROVIDERS[provider].name,
    displayName: undefined,
    currentModel,
    currentBaseURL,
    models,
    defaultModel: PROVIDERS[provider].defaultModel,
    defaultBaseURL: PROVIDERS[provider].baseURL,
    requiresApiKey,
    isConfigured,
    isActive: item?.isActive ?? isConfigured,
    reasoningEnabled: item?.reasoningEnabled ?? true,
  };
}

async function buildCustomProviderStatus(item: {
  provider: string;
  displayName: string | null;
  key: string | null;
  model: string | null;
  baseURL: string | null;
  isActive: boolean;
  reasoningEnabled?: boolean | null;
}) {
  const currentModel = normalizeOptionalText(item.model) ?? "";
  const currentBaseURL = normalizeOptionalText(item.baseURL) ?? "";
  const models = await getProviderModels(item.provider, {
    apiKey: normalizeOptionalText(item.key),
    baseURL: currentBaseURL || undefined,
    fallbackModel: currentModel,
    fallbackModels: [currentModel],
  });
  return {
    provider: item.provider,
    kind: "custom" as const,
    name: normalizeOptionalText(item.displayName) ?? item.provider,
    displayName: normalizeOptionalText(item.displayName) ?? item.provider,
    currentModel,
    currentBaseURL,
    models,
    defaultModel: currentModel,
    defaultBaseURL: currentBaseURL,
    requiresApiKey: false,
    isConfigured: Boolean(currentModel && currentBaseURL),
    isActive: item.isActive,
    reasoningEnabled: item.reasoningEnabled ?? true,
  };
}

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
    const keys = await prisma.aPIKey.findMany({
      orderBy: [{ createdAt: "asc" }],
    });
    const keyMap = new Map(keys.map((item) => [item.provider, item]));
    const builtInProviders = await Promise.all(
      SUPPORTED_PROVIDERS.map((provider) => buildBuiltInProviderStatus(provider, keyMap.get(provider))),
    );
    const customProviders = await Promise.all(
      keys
        .filter((item) => !isBuiltInProvider(item.provider))
        .map((item) => buildCustomProviderStatus(item)),
    );
    const data = [...builtInProviders, ...customProviders];
    res.status(200).json({
      success: true,
      data,
      message: "获取模型连接配置成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/custom-providers",
  validate({ body: createCustomProviderSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createCustomProviderSchema>;
      const provider = await ensureUniqueCustomProviderId(body.name);
      const createData = {
        provider,
        displayName: body.name.trim(),
        key: normalizeOptionalText(body.key) ?? null,
        model: body.model.trim(),
        baseURL: body.baseURL.trim(),
        isActive: body.isActive ?? true,
        reasoningEnabled: body.reasoningEnabled ?? true,
      } as Record<string, unknown>;
      const data = await prisma.aPIKey.create({
        data: createData as never,
      }) as APIKeyRecordLike;
      setProviderSecretCache(provider, data.isActive ? {
        displayName: data.displayName ?? undefined,
        key: data.key ?? undefined,
        model: data.model ?? undefined,
        baseURL: data.baseURL ?? undefined,
        reasoningEnabled: data.reasoningEnabled ?? true,
      } : null);
      let models = getFallbackModels(provider, data.model ?? undefined);
      let message = "自定义厂商创建成功。";
      try {
        models = await refreshProviderModels(provider, data.key ?? undefined, data.baseURL ?? undefined);
      } catch {
        message = "自定义厂商创建成功，但模型列表刷新失败，可稍后手动刷新。";
      }
      res.status(201).json({
        success: true,
        data: {
          provider: data.provider,
          displayName: data.displayName,
          model: data.model,
          baseURL: data.baseURL,
          isActive: data.isActive,
          reasoningEnabled: data.reasoningEnabled ?? true,
          models,
        },
        message,
      } satisfies ApiResponse<{
        provider: string;
        displayName: string | null;
        model: string | null;
        baseURL: string | null;
        isActive: boolean;
        reasoningEnabled: boolean;
        models: string[];
      }>);
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  "/custom-providers/:provider",
  validate({ params: providerSchema }),
  async (req, res, next) => {
    try {
      const { provider } = req.params as z.infer<typeof providerSchema>;
      if (isBuiltInProvider(provider)) {
        throw new AppError("内置厂商不能删除。", 400);
      }
      const existing = await prisma.aPIKey.findUnique({
        where: { provider },
      });
      if (!existing) {
        throw new AppError("自定义厂商不存在。", 404);
      }
      const routeInUse = await prisma.modelRouteConfig.findFirst({
        where: { provider },
        select: { taskType: true },
      });
      if (routeInUse) {
        throw new AppError(`请先把模型路由中的 ${routeInUse.taskType} 切换到其他厂商后再删除。`, 400);
      }
      await prisma.aPIKey.delete({
        where: { provider },
      });
      setProviderSecretCache(provider, null);
      res.status(200).json({
        success: true,
        message: "自定义厂商已删除。",
      } satisfies ApiResponse<null>);
    } catch (error) {
      next(error);
    }
  },
);

router.get("/api-keys/balances", async (_req, res, next) => {
  try {
    const keys = await prisma.aPIKey.findMany({
      where: {
        provider: {
          in: SUPPORTED_PROVIDERS,
        },
      },
      select: {
        provider: true,
        key: true,
      },
    });
    const keyMap = new Map(
      SUPPORTED_PROVIDERS.map((provider) => {
        const record = keys.find((item) => item.provider === provider);
        return [provider, normalizeOptionalText(record?.key) ?? getProviderEnvApiKey(provider)] as const;
      }),
    );
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
      const existing = await prisma.aPIKey.findUnique({
        where: { provider },
      });
      const existingRecord = existing as APIKeyRecordLike | null;
      if (!isBuiltInProvider(provider) && !existing) {
        throw new AppError("自定义厂商不存在。", 404);
      }

      const nextKey = normalizeOptionalText(body.key) ?? normalizeOptionalText(existingRecord?.key);
      const envKey = getProviderEnvApiKey(provider);
      const effectiveKey = nextKey ?? envKey;
      const nextModel = normalizeOptionalText(body.model) ?? normalizeOptionalText(existingRecord?.model);
      const nextBaseURL = body.baseURL !== undefined
        ? normalizeOptionalText(body.baseURL)
        : normalizeOptionalText(existingRecord?.baseURL);
      const nextDisplayName = !isBuiltInProvider(provider)
        ? normalizeOptionalText(body.displayName) ?? normalizeOptionalText(existingRecord?.displayName) ?? provider
        : undefined;
      const nextReasoningEnabled = body.reasoningEnabled ?? existingRecord?.reasoningEnabled ?? true;
      const requiresApiKey = providerRequiresApiKey(provider);

      if (requiresApiKey && !effectiveKey) {
        throw new AppError("API Key 不能为空。", 400);
      }
      if (!isBuiltInProvider(provider) && !nextModel) {
        throw new AppError("自定义厂商的默认模型不能为空。", 400);
      }
      if (!isBuiltInProvider(provider) && !nextBaseURL) {
        throw new AppError("自定义厂商的 API URL 不能为空。", 400);
      }

      const data = (isBuiltInProvider(provider)
        ? await prisma.aPIKey.upsert({
          where: { provider },
          update: ({
            key: nextKey ?? null,
            model: nextModel ?? null,
            baseURL: nextBaseURL ?? null,
            isActive: body.isActive ?? true,
            reasoningEnabled: nextReasoningEnabled,
          } as Record<string, unknown>) as never,
          create: ({
            provider,
            key: nextKey ?? null,
            model: nextModel ?? null,
            baseURL: nextBaseURL ?? null,
            isActive: body.isActive ?? true,
            reasoningEnabled: nextReasoningEnabled,
          } as Record<string, unknown>) as never,
        })
        : await prisma.aPIKey.update({
          where: { provider },
          data: ({
            displayName: nextDisplayName,
            key: nextKey ?? null,
            model: nextModel ?? null,
            baseURL: nextBaseURL ?? null,
            isActive: body.isActive ?? existingRecord?.isActive ?? true,
            reasoningEnabled: nextReasoningEnabled,
          } as Record<string, unknown>) as never,
        })) as APIKeyRecordLike;

      setProviderSecretCache(provider, data.isActive ? {
        displayName: data.displayName ?? undefined,
        key: data.key ?? undefined,
        model: data.model ?? undefined,
        baseURL: data.baseURL ?? undefined,
        reasoningEnabled: data.reasoningEnabled ?? true,
      } : null);

      let models = getFallbackModels(provider, data.model ?? undefined);
      let message = "保存模型连接配置成功。";
      try {
        models = await refreshProviderModels(provider, effectiveKey, nextBaseURL);
      } catch {
        message = "保存模型连接配置成功，但模型列表刷新失败，可稍后手动刷新。";
      }
      res.status(200).json({
        success: true,
        data: {
          provider: data.provider,
          displayName: data.displayName,
          model: data.model,
          baseURL: data.baseURL,
          isActive: data.isActive,
          reasoningEnabled: data.reasoningEnabled ?? true,
          models,
        },
        message,
      } satisfies ApiResponse<{
        provider: string;
        displayName: string | null;
        model: string | null;
        baseURL: string | null;
        isActive: boolean;
        reasoningEnabled: boolean;
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
      if (!isBuiltInProvider(provider)) {
        throw new AppError("自定义厂商暂不支持余额查询。", 400);
      }
      const keyConfig = await prisma.aPIKey.findUnique({
        where: { provider },
        select: {
          key: true,
        },
      });
      const data = await providerBalanceService.getProviderBalance({
        provider,
        apiKey: normalizeOptionalText(keyConfig?.key) ?? getProviderEnvApiKey(provider),
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
      const effectiveKey = normalizeOptionalText(keyConfig?.key) ?? getProviderEnvApiKey(provider);
      if (providerRequiresApiKey(provider) && !effectiveKey) {
        throw new AppError("请先配置 API Key，再刷新模型列表。", 400);
      }
      const models = await refreshProviderModels(
        provider,
        effectiveKey,
        normalizeOptionalText(keyConfig?.baseURL),
      );
      const currentModel = normalizeOptionalText(keyConfig?.model)
        ?? getProviderEnvModel(provider)
        ?? (isBuiltInProvider(provider) ? PROVIDERS[provider].defaultModel : "");
      res.status(200).json({
        success: true,
        data: {
          provider,
          models,
          currentModel,
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
