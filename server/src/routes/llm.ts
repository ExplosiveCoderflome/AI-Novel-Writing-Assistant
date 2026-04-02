import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { authMiddleware } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { llmConnectivityService } from "../llm/connectivity";
import { listModelRouteConfigs, MODEL_ROUTE_TASK_TYPES, upsertModelRouteConfig } from "../llm/modelRouter";
import { PROVIDERS } from "../llm/providers";
import { getProviderModels } from "../llm/modelCatalog";

const router = Router();

const llmTestSchema = z.object({
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic", "grok", "kimi", "glm", "qwen", "gemini"]),
  apiKey: z.string().trim().optional(),
  model: z.string().trim().optional(),
});

router.use(authMiddleware);

router.get("/providers", async (_req, res, next) => {
  try {
    const keys = await prisma.aPIKey.findMany();
    const keyMap = new Map(keys.map((item) => [item.provider, item]));
    const entries = await Promise.all(
      Object.entries(PROVIDERS).map(async ([provider, config]) => {
        const models = await getProviderModels(provider as LLMProvider, {
          apiKey: keyMap.get(provider)?.key,
        });
        return [provider, { ...config, models }] as const;
      }),
    );
    const data = Object.fromEntries(entries);
    const response: ApiResponse<typeof data> = {
      success: true,
      data,
      message: "获取模型配置成功。",
    };
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

router.get("/model-routes", async (_req, res, next) => {
  try {
    const data = {
      taskTypes: MODEL_ROUTE_TASK_TYPES,
      routes: await listModelRouteConfigs(),
    };
    res.status(200).json({
      success: true,
      data,
      message: "模型路由配置已加载。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/model-routes/connectivity", async (_req, res, next) => {
  try {
    const data = await llmConnectivityService.testModelRoutes();
    res.status(200).json({
      success: true,
      data,
      message: "模型路由连通性检测完成。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

const modelRouteUpsertSchema = z.object({
  taskType: z.string().trim().min(1),
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.union([z.number().int().min(64).max(16384), z.null()]).optional(),
});

router.put(
  "/model-routes",
  validate({ body: modelRouteUpsertSchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof modelRouteUpsertSchema>;
      await upsertModelRouteConfig(body.taskType, {
        provider: body.provider,
        model: body.model,
        temperature: body.temperature,
        maxTokens: body.maxTokens ?? null,
      });
      res.status(200).json({
        success: true,
        message: "模型路由已更新。",
      } satisfies ApiResponse<null>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/test",
  validate({ body: llmTestSchema }),
  async (req, res, next) => {
    try {
      const { provider, apiKey, model } = req.body as z.infer<typeof llmTestSchema>;
      const result = await llmConnectivityService.testConnection({ provider, apiKey, model });
      if (!result.ok) {
        if (/API Key|未配置/.test(result.error ?? "")) {
          next(new AppError(result.error ?? "未配置可用的模型连接。", 400));
          return;
        }
        next(new AppError(result.error ?? "模型连通性测试失败。", 400));
        return;
      }
      const response: ApiResponse<{ success: boolean; model: string; latency: number }> = {
        success: true,
        data: {
          success: result.ok,
          model: result.model,
          latency: result.latency ?? 0,
        },
        message: "模型连通性测试成功。",
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
