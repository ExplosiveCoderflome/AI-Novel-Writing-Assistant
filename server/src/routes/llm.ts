import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { z } from "zod";
import { HumanMessage } from "@langchain/core/messages";
import { prisma } from "../db/prisma";
import { authMiddleware } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { getLLM } from "../llm/factory";
import { PROVIDERS } from "../llm/providers";
import { getProviderModels } from "../llm/modelCatalog";

const router = Router();

const llmTestSchema = z.object({
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic"]),
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

router.post(
  "/test",
  validate({ body: llmTestSchema }),
  async (req, res, next) => {
    try {
      const { provider, apiKey, model } = req.body as z.infer<typeof llmTestSchema>;
      const llm = await getLLM(provider, { apiKey, model, temperature: 0 });
      const start = Date.now();
      await llm.invoke([new HumanMessage("请回复“测试成功”。")]);
      const response: ApiResponse<{ success: boolean; model: string; latency: number }> = {
        success: true,
        data: {
          success: true,
          model: model ?? PROVIDERS[provider].defaultModel,
          latency: Date.now() - start,
        },
        message: "模型连通性测试成功。",
      };
      res.status(200).json(response);
    } catch (error) {
      if (error instanceof Error && /API Key|未配置/.test(error.message)) {
        next(new AppError(error.message, 400));
        return;
      }
      next(error);
    }
  },
);

export default router;
