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
import { providerBalanceService } from "../services/settings/ProviderBalanceService";
import { secretStore } from "../services/settings/secretStore";
import {
  getDefaultImageModel,
  getImageModelOptions,
  getProviderImageModelMap,
  saveProviderImageModel,
  supportsImageModelSettings,
} from "../services/settings/ProviderImageSettingsService";

const router = Router();
const MAX_PROVIDER_CONCURRENCY_LIMIT = 100;
const MAX_PROVIDER_REQUEST_INTERVAL_MS = 3_600_000;

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
  concurrencyLimit: z.coerce.number().int().min(0).max(MAX_PROVIDER_CONCURRENCY_LIMIT).optional(),
  requestIntervalMs: z.coerce.number().int().min(0).max(MAX_PROVIDER_REQUEST_INTERVAL_MS).optional(),
});

const createCustomProviderSchema = z.object({
  name: z.string().trim().min(1),
  key: z.string().trim().optional(),
  model: z.string().trim().min(1),
  baseURL: z.string().trim().url("API URL is invalid."),
  isActive: z.boolean().optional(),
  reasoningEnabled: z.boolean().optional(),
  concurrencyLimit: z.coerce.number().int().min(0).max(MAX_PROVIDER_CONCURRENCY_LIMIT).optional(),
  requestIntervalMs: z.coerce.number().int().min(0).max(MAX_PROVIDER_REQUEST_INTERVAL_MS).optional(),
});

type APIKeyRecordLike = {
  provider: string;
  displayName: string | null;
  key: string | null;
  model: string | null;
  baseURL: string | null;
  isActive: boolean;
  reasoningEnabled?: boolean | null;
  concurrencyLimit?: number | null;
  requestIntervalMs?: number | null;
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
  concurrencyLimit: number;
  requestIntervalMs: number;
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
  concurrencyLimit: number;
  requestIntervalMs: number;
  supportsImageGeneration: false;
};

router.use(authMiddleware);

function normalizeOptionalText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeProviderLimit(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
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
  while (await secretStore.hasProvider(candidate)) {
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
    concurrencyLimit?: number | null;
    requestIntervalMs?: number | null;
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
    concurrencyLimit: normalizeProviderLimit(item?.concurrencyLimit),
    requestIntervalMs: normalizeProviderLimit(item?.requestIntervalMs),
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
  concurrencyLimit?: number | null;
  requestIntervalMs?: number | null;
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
    concurrencyLimit: normalizeProviderLimit(item.concurrencyLimit),
    requestIntervalMs: normalizeProviderLimit(item.requestIntervalMs),
    supportsImageGeneration: false,
  };
}

router.get("/api-keys", async (_req, res, next) => {
  try {
    const keys = await secretStore.listProviders();
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

router.post(
  "/custom-providers",
  validate({ body: createCustomProviderSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createCustomProviderSchema>;
      const provider = await ensureUniqueCustomProviderId(body.name);
      const createData = {
        displayName: body.name.trim(),
        key: normalizeOptionalText(body.key) ?? null,
        model: body.model.trim(),
        baseURL: body.baseURL.trim(),
        isActive: body.isActive ?? true,
        reasoningEnabled: body.reasoningEnabled ?? true,
        concurrencyLimit: body.concurrencyLimit ?? 0,
        requestIntervalMs: body.requestIntervalMs ?? 0,
      };
      const data = await secretStore.createProvider(provider, createData) as APIKeyRecordLike;
      setProviderSecretCache(provider, data.isActive ? {
        displayName: data.displayName ?? undefined,
        key: data.key ?? undefined,
        model: data.model ?? undefined,
        baseURL: data.baseURL ?? undefined,
        reasoningEnabled: data.reasoningEnabled ?? true,
        concurrencyLimit: data.concurrencyLimit ?? 0,
        requestIntervalMs: data.requestIntervalMs ?? 0,
      } : null);
      let models = getFallbackModels(provider, data.model ?? undefined);
      let message = "Created custom provider.";
      try {
        models = await refreshProviderModels(provider, data.key ?? undefined, data.baseURL ?? undefined);
      } catch {
        message = "Created custom provider, but refreshing models failed. You can refresh them later.";
      }
      const responseData = {
        provider: data.provider,
        displayName: data.displayName,
        model: data.model,
        imageModel: null,
        baseURL: data.baseURL,
        isActive: data.isActive,
        reasoningEnabled: data.reasoningEnabled ?? true,
        concurrencyLimit: normalizeProviderLimit(data.concurrencyLimit),
        requestIntervalMs: normalizeProviderLimit(data.requestIntervalMs),
        models,
        imageModels: [],
        supportsImageGeneration: false,
      };
      res.status(201).json({
        success: true,
        data: responseData,
        message,
      } satisfies ApiResponse<typeof responseData>);
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
      const existing = await secretStore.getProvider(provider);
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
      await secretStore.deleteProvider(provider);
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
    const keys = await secretStore.listProviders({ providers: SUPPORTED_PROVIDERS });
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
      const existing = await secretStore.getProvider(provider);
      const existingRecord = existing as APIKeyRecordLike | null;
      if (!isBuiltInProvider(provider) && !existing) {
        throw new AppError("Custom provider not found.", 404);
      }

      const nextKey = normalizeOptionalText(body.key) ?? normalizeOptionalText(existingRecord?.key);
      const effectiveKey = nextKey ?? getProviderEnvApiKey(provider);
      const nextModel = normalizeOptionalText(body.model) ?? normalizeOptionalText(existingRecord?.model);
      const nextBaseURL = body.baseURL !== undefined
        ? normalizeOptionalText(body.baseURL)
        : normalizeOptionalText(existingRecord?.baseURL);
      const nextDisplayName = !isBuiltInProvider(provider)
        ? normalizeOptionalText(body.displayName) ?? normalizeOptionalText(existingRecord?.displayName) ?? provider
        : undefined;
      const nextReasoningEnabled = body.reasoningEnabled ?? existingRecord?.reasoningEnabled ?? true;
      const nextConcurrencyLimit = body.concurrencyLimit ?? normalizeProviderLimit(existingRecord?.concurrencyLimit);
      const nextRequestIntervalMs = body.requestIntervalMs ?? normalizeProviderLimit(existingRecord?.requestIntervalMs);

      if (providerRequiresApiKey(provider) && !effectiveKey) {
        throw new AppError("API key is required.", 400);
      }
      if (!isBuiltInProvider(provider) && !nextModel) {
        throw new AppError("A default model is required for custom providers.", 400);
      }
      if (!isBuiltInProvider(provider) && !nextBaseURL) {
        throw new AppError("An API URL is required for custom providers.", 400);
      }

      const data = (isBuiltInProvider(provider)
        ? await secretStore.upsertProvider(provider, {
          key: nextKey ?? null,
          model: nextModel ?? null,
          baseURL: nextBaseURL ?? null,
          isActive: body.isActive ?? true,
          reasoningEnabled: nextReasoningEnabled,
          concurrencyLimit: nextConcurrencyLimit,
          requestIntervalMs: nextRequestIntervalMs,
        })
        : await secretStore.updateProvider(provider, {
          displayName: nextDisplayName,
          key: nextKey ?? null,
          model: nextModel ?? null,
          baseURL: nextBaseURL ?? null,
          isActive: body.isActive ?? existingRecord?.isActive ?? true,
          reasoningEnabled: nextReasoningEnabled,
          concurrencyLimit: nextConcurrencyLimit,
          requestIntervalMs: nextRequestIntervalMs,
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
        concurrencyLimit: data.concurrencyLimit ?? 0,
        requestIntervalMs: data.requestIntervalMs ?? 0,
      } : null);

      let models = getFallbackModels(provider, data.model ?? undefined);
      let message = "Saved provider settings.";
      try {
        models = await refreshProviderModels(provider, effectiveKey, nextBaseURL ?? getProviderEnvBaseUrl(provider));
      } catch {
        message = "Saved provider settings, but refreshing models failed. You can refresh them later.";
      }
      const responseData = {
        provider: data.provider,
        displayName: data.displayName,
        model: data.model,
        imageModel: currentImageModel ?? null,
        baseURL: data.baseURL,
        isActive: data.isActive,
        reasoningEnabled: data.reasoningEnabled ?? true,
        concurrencyLimit: normalizeProviderLimit(data.concurrencyLimit),
        requestIntervalMs: normalizeProviderLimit(data.requestIntervalMs),
        models,
        imageModels: supportsImageModelSettings(provider) ? getImageModelOptions(provider) : [],
        supportsImageGeneration: supportsImageModelSettings(provider),
      };
      res.status(200).json({
        success: true,
        data: responseData,
        message,
      } satisfies ApiResponse<typeof responseData>);
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
      const keyConfig = await secretStore.getProvider(provider);
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
      const keyConfig = await secretStore.getProvider(provider);
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
      const data = {
        provider,
        models,
        currentModel,
      };
      res.status(200).json({
        success: true,
        data,
        message: "Refreshed provider models.",
      } satisfies ApiResponse<typeof data>);
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
