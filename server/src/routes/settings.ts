import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { PROVIDERS, SUPPORTED_PROVIDERS } from "../llm/providers";
import { getProviderModels, refreshProviderModels } from "../llm/modelCatalog";
import { authMiddleware } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";

const router = Router();

const providerSchema = z.object({
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic"]),
});

const upsertApiKeySchema = z.object({
  key: z.string().trim().min(1, "API Key 不能为空。"),
  model: z.string().trim().optional(),
  isActive: z.boolean().optional(),
});

router.use(authMiddleware);

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
