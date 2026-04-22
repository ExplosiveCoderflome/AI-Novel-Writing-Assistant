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
import {
  getDefaultImageModel,
  getImageModelOptions,
  getProviderImageModelMap,
  saveProviderImageModel,
  supportsImageModelSettings,
} from "../services/settings/ProviderImageSettingsService";
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
  getAutoDirectorChannelSettings,
  saveAutoDirectorChannelSettings,
} from "../services/settings/AutoDirectorChannelSettingsService";

const router = Router();

const providerSchema = z.object({
  provider: llmProviderSchema,
});

const upsertApiKeySchema = z.object({
  displayName: z.string().trim().min(1).optional(),
  key: z.string().trim().optional(),
  model: z.string().trim().optional(),
  imageModel: z.string().trim().optional(),
  baseURL: z.union([z.string().trim().url("API URL is invalid."), z.literal("")]).optional(),
  isActive: z.boolean().optional(),
  reasoningEnabled: z.boolean().optional(),
});

const createCustomProviderSchema = z.object({
  name: z.string().trim().min(1),
  key: z.string().trim().optional(),
  model: z.string().trim().min(1),
  baseURL: z.string().trim().url("API URL is invalid."),
  isActive: z.boolean().optional(),
  reasoningEnabled: z.boolean().optional(),
});

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

const ragEmbeddingProviderSchema = z.object({
  provider: z.enum(["openai", "siliconflow"]),
});

const autoDirectorChannelSchema = z.object({
  webhookUrl: z.string().trim().optional(),
  callbackToken: z.string().trim().optional(),
  operatorMapJson: z.string().trim().optional(),
  eventTypes: z.array(z.string().trim().min(1)).optional(),
});

const autoDirectorChannelSettingsSchema = z.object({
  baseUrl: z.union([z.string().trim().url("Base URL is invalid."), z.literal("")]).optional(),
  dingtalk: autoDirectorChannelSchema.optional(),
  wecom: autoDirectorChannelSchema.optional(),
});

type APIKeyRecordLike = {
  provider: string;
  displayName: string | null;
  key: string | null;
  model: string | null;
  baseURL: string | null;
  isActive: boolean;
  reasoningEnabled?: boolean | null;
};

type BuiltInProviderStatus = {
  provider: BuiltinLLMProvider;
  kind: "builtin";
  name: string;
  displayName?: string;
  currentModel: string;
  currentImageModel: string | null;
  currentBaseURL: string;
  models: string[];
  imageModels: string[];
  defaultModel: string;
  defaultImageModel: string | null;
  defaultBaseURL: string;
  requiresApiKey: boolean;
  isConfigured: boolean;
  isActive: boolean;
  reasoningEnabled: boolean;
  supportsImageGeneration: boolean;
};

type CustomProviderStatus = {
  provider: string;
  kind: "custom";
  name: string;
  displayName?: string;
  currentModel: string;
  currentImageModel: null;
  currentBaseURL: string;
  models: string[];
  imageModels: string[];
  defaultModel: string;
  defaultImageModel: null;
  defaultBaseURL: string;
  requiresApiKey: boolean;
  isConfigured: boolean;
  isActive: boolean;
  reasoningEnabled: boolean;
  supportsImageGeneration: false;
};

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

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
  item: {
    displayName?: string | null;
    key?: string | null;
    model?: string | null;
    baseURL?: string | null;
    isActive?: boolean;
    reasoningEnabled?: boolean | null;
  } | undefined,
  imageModel: string | undefined,
): Promise<BuiltInProviderStatus> {
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
    baseURL: currentBaseURL,
    fallbackModel: currentModel,
    fallbackModels: getFallbackModels(provider, currentModel),
  });
  const supportsImageGeneration = supportsImageModelSettings(provider);
  const isConfigured = requiresApiKey ? Boolean(effectiveKey) : Boolean(currentModel && currentBaseURL);

  return {
    provider,
    kind: "builtin",
    name: PROVIDERS[provider].name,
    displayName: undefined,
    currentModel,
    currentImageModel: supportsImageGeneration ? imageModel ?? getDefaultImageModel(provider) ?? null : null,
    currentBaseURL,
    models,
    imageModels: supportsImageGeneration ? getImageModelOptions(provider) : [],
    defaultModel: PROVIDERS[provider].defaultModel,
    defaultImageModel: supportsImageGeneration ? getDefaultImageModel(provider) ?? null : null,
    defaultBaseURL: PROVIDERS[provider].baseURL,
    requiresApiKey,
    isConfigured,
    isActive: item?.isActive ?? isConfigured,
    reasoningEnabled: item?.reasoningEnabled ?? true,
    supportsImageGeneration,
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
}): Promise<CustomProviderStatus> {
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
    kind: "custom",
    name: normalizeOptionalText(item.displayName) ?? item.provider,
    displayName: normalizeOptionalText(item.displayName) ?? item.provider,
    currentModel,
    currentImageModel: null,
    currentBaseURL,
    models,
    imageModels: [],
    defaultModel: currentModel,
    defaultImageModel: null,
    defaultBaseURL: currentBaseURL,
    requiresApiKey: false,
    isConfigured: Boolean(currentModel && currentBaseURL),
    isActive: item.isActive,
    reasoningEnabled: item.reasoningEnabled ?? true,
    supportsImageGeneration: false,
  };
}

router.use(authMiddleware);

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

router.get("/api-keys", async (_req, res, next) => {
  try {
    const keys = await prisma.aPIKey.findMany({
      orderBy: [{ createdAt: "asc" }],
    });
    const keyMap = new Map(keys.map((item) => [item.provider, item]));
    const imageModelMap = await getProviderImageModelMap(SUPPORTED_PROVIDERS);
    const builtInProviders = await Promise.all(
      SUPPORTED_PROVIDERS.map((provider) =>
        buildBuiltInProviderStatus(provider, keyMap.get(provider), imageModelMap.get(provider))),
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
      message: "Loaded provider settings.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/auto-director/channels", async (_req, res, next) => {
  try {
    const data = await getAutoDirectorChannelSettings();
    res.status(200).json({
      success: true,
      data,
      message: "Loaded auto director channel settings.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put(
  "/auto-director/channels",
  validate({ body: autoDirectorChannelSettingsSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof autoDirectorChannelSettingsSchema>;
      const data = await saveAutoDirectorChannelSettings(body);
      res.status(200).json({
        success: true,
        data,
        message: "Auto director channel settings saved.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

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
      let message = "Created custom provider.";
      try {
        models = await refreshProviderModels(provider, data.key ?? undefined, data.baseURL ?? undefined);
      } catch {
        message = "Created custom provider, but refreshing models failed. You can refresh them later.";
      }
      res.status(201).json({
        success: true,
        data: {
          provider: data.provider,
          displayName: data.displayName,
          model: data.model,
          imageModel: null,
          baseURL: data.baseURL,
          isActive: data.isActive,
          reasoningEnabled: data.reasoningEnabled ?? true,
          models,
          imageModels: [],
          supportsImageGeneration: false,
        },
        message,
      } satisfies ApiResponse<{
        provider: string;
        displayName: string | null;
        model: string | null;
        imageModel: string | null;
        baseURL: string | null;
        isActive: boolean;
        reasoningEnabled: boolean;
        models: string[];
        imageModels: string[];
        supportsImageGeneration: boolean;
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
        throw new AppError("Built-in providers cannot be deleted.", 400);
      }
      const existing = await prisma.aPIKey.findUnique({
        where: { provider },
      });
      if (!existing) {
        throw new AppError("Custom provider not found.", 404);
      }
      const routeInUse = await prisma.modelRouteConfig.findFirst({
        where: { provider },
        select: { taskType: true },
      });
      if (routeInUse) {
        throw new AppError(`Please reassign model route ${routeInUse.taskType} before deleting this provider.`, 400);
      }
      await prisma.aPIKey.delete({
        where: { provider },
      });
      setProviderSecretCache(provider, null);
      res.status(200).json({
        success: true,
        message: "Deleted custom provider.",
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
      message: "Loaded provider balances.",
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
        throw new AppError("Custom provider not found.", 404);
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
        throw new AppError("API key is required.", 400);
      }
      if (!isBuiltInProvider(provider) && !nextModel) {
        throw new AppError("A default model is required for custom providers.", 400);
      }
      if (!isBuiltInProvider(provider) && !nextBaseURL) {
        throw new AppError("An API URL is required for custom providers.", 400);
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

      const currentImageModel = body.imageModel !== undefined
        ? await saveProviderImageModel(provider, body.imageModel)
        : await getProviderImageModelMap([provider]).then((map) => map.get(provider) ?? null);

      setProviderSecretCache(provider, data.isActive ? {
        displayName: data.displayName ?? undefined,
        key: data.key ?? undefined,
        model: data.model ?? undefined,
        baseURL: data.baseURL ?? undefined,
        reasoningEnabled: data.reasoningEnabled ?? true,
      } : null);

      let models = getFallbackModels(provider, data.model ?? undefined);
      let message = "Saved provider settings.";
      try {
        models = await refreshProviderModels(provider, effectiveKey, nextBaseURL ?? getProviderEnvBaseUrl(provider));
      } catch {
        message = "Saved provider settings, but refreshing models failed. You can refresh them later.";
      }

      res.status(200).json({
        success: true,
        data: {
          provider: data.provider,
          displayName: data.displayName,
          model: data.model,
          imageModel: currentImageModel ?? null,
          baseURL: data.baseURL,
          isActive: data.isActive,
          reasoningEnabled: data.reasoningEnabled ?? true,
          models,
          imageModels: supportsImageModelSettings(provider) ? getImageModelOptions(provider) : [],
          supportsImageGeneration: supportsImageModelSettings(provider),
        },
        message,
      } satisfies ApiResponse<{
        provider: string;
        displayName: string | null;
        model: string | null;
        imageModel: string | null;
        baseURL: string | null;
        isActive: boolean;
        reasoningEnabled: boolean;
        models: string[];
        imageModels: string[];
        supportsImageGeneration: boolean;
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
        throw new AppError("Balance refresh is not supported for custom providers.", 400);
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
        message: data.status === "available" ? "Refreshed provider balance." : data.message,
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
        throw new AppError("Configure an API key before refreshing models.", 400);
      }
      const models = await refreshProviderModels(
        provider,
        effectiveKey,
        normalizeOptionalText(keyConfig?.baseURL) ?? getProviderEnvBaseUrl(provider),
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
        message: "Refreshed provider models.",
      } satisfies ApiResponse<{
        provider: string;
        models: string[];
        currentModel: string;
      }>);
    } catch (error) {
      if (error instanceof Error && /failed|empty/i.test(error.message)) {
        next(new AppError(error.message, 400));
        return;
      }
      next(error);
    }
  },
);

export default router;
