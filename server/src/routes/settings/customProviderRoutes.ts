import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { setProviderSecretCache } from "../../llm/factory";
import { refreshProviderModels } from "../../llm/modelCatalog";
import { llmProviderSchema } from "../../llm/providerSchema";
import { isBuiltInProvider } from "../../llm/providers";
import { AppError } from "../../middleware/errorHandler";
import { validate } from "../../middleware/validate";
import { secretStore } from "../../services/settings/secretStore";

const MAX_PROVIDER_CONCURRENCY_LIMIT = 100;
const MAX_PROVIDER_REQUEST_INTERVAL_MS = 3_600_000;

const providerSchema = z.object({
  provider: llmProviderSchema,
});

const createCustomProviderSchema = z.object({
  name: z.string().trim().min(1),
  key: z.string().trim().optional(),
  model: z.string().trim().optional(),
  baseURL: z.string().trim().url("API URL 格式不正确。"),
  isActive: z.boolean().optional(),
  reasoningEnabled: z.boolean().optional(),
  concurrencyLimit: z.coerce.number().int().min(0).max(MAX_PROVIDER_CONCURRENCY_LIMIT).optional(),
  requestIntervalMs: z.coerce.number().int().min(0).max(MAX_PROVIDER_REQUEST_INTERVAL_MS).optional(),
});

const customProviderModelsSchema = z.object({
  key: z.string().trim().optional(),
  baseURL: z.string().trim().url("API URL 格式不正确。"),
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

function getFallbackModels(currentModel?: string): string[] {
  return Array.from(new Set([currentModel ?? ""].filter(Boolean)));
}

function isModelFetchError(error: Error): boolean {
  return /failed|empty|失败|为空/i.test(error.message);
}

export function registerCustomProviderRoutes(router: Router): void {
  router.post(
    "/custom-providers/models",
    validate({ body: customProviderModelsSchema }),
    async (req, res, next) => {
      try {
        const body = req.body as z.infer<typeof customProviderModelsSchema>;
        const models = await refreshProviderModels(
          "custom_preview",
          normalizeOptionalText(body.key),
          body.baseURL.trim(),
        );
        res.status(200).json({
          success: true,
          data: {
            models,
            defaultModel: models[0] ?? "",
          },
          message: `已获取 ${models.length} 个模型。`,
        } satisfies ApiResponse<{
          models: string[];
          defaultModel: string;
        }>);
      } catch (error) {
        if (error instanceof Error && isModelFetchError(error)) {
          next(new AppError(error.message, 400));
          return;
        }
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
        const apiKey = normalizeOptionalText(body.key);
        const baseURL = body.baseURL.trim();
        let model = normalizeOptionalText(body.model);
        let models = getFallbackModels(model);
        let message = "自定义厂商已创建。";

        try {
          models = await refreshProviderModels(provider, apiKey, baseURL);
          model = model ?? models[0];
        } catch (error) {
          if (!model) {
            const detail = error instanceof Error ? `：${error.message}` : "。";
            throw new AppError(`未能获取模型列表，请检查 API URL，或手动填写一个默认模型${detail}`, 400);
          }
          message = "自定义厂商已创建，但模型列表刷新失败。可以稍后在厂商卡片中刷新。";
        }

        const data = await secretStore.createProvider(provider, {
          displayName: body.name.trim(),
          key: apiKey ?? null,
          model: model ?? null,
          baseURL,
          isActive: body.isActive ?? true,
          reasoningEnabled: body.reasoningEnabled ?? true,
          concurrencyLimit: body.concurrencyLimit ?? 0,
          requestIntervalMs: body.requestIntervalMs ?? 0,
        }) as APIKeyRecordLike;
        setProviderSecretCache(provider, data.isActive ? {
          displayName: data.displayName ?? undefined,
          key: data.key ?? undefined,
          model: data.model ?? undefined,
          baseURL: data.baseURL ?? undefined,
          reasoningEnabled: data.reasoningEnabled ?? true,
          concurrencyLimit: data.concurrencyLimit ?? 0,
          requestIntervalMs: data.requestIntervalMs ?? 0,
        } : null);
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
            concurrencyLimit: normalizeProviderLimit(data.concurrencyLimit),
            requestIntervalMs: normalizeProviderLimit(data.requestIntervalMs),
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
          concurrencyLimit: number;
          requestIntervalMs: number;
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
          throw new AppError("内置厂商不能删除。", 400);
        }
        const existing = await secretStore.getProvider(provider);
        if (!existing) {
          throw new AppError("没有找到这个自定义厂商。", 404);
        }
        const routeInUse = await prisma.modelRouteConfig.findFirst({
          where: { provider },
          select: { taskType: true },
        });
        if (routeInUse) {
          throw new AppError(`请先把模型路由 ${routeInUse.taskType} 改到其他厂商，再删除这个厂商。`, 400);
        }
        await secretStore.deleteProvider(provider);
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
}
