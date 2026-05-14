import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { llmProviderSchema } from "../../llm/providerSchema";
import { validate } from "../../middleware/validate";
import {
  getLLMSelectionSettings,
  saveLLMSelectionSettings,
  type LLMSelectionSettings,
} from "../../services/settings/LLMSelectionSettingsService";

const llmSelectionSchema = z.object({
  provider: llmProviderSchema,
  model: z.string().trim().min(1, "模型名称不能为空。"),
  temperature: z.coerce.number().min(0).max(2).optional(),
  maxTokens: z.coerce.number().int().min(256).max(32768).optional(),
});

export function registerLLMSelectionRoutes(router: Router): void {
  router.get("/llm-selection", async (_req, res, next) => {
    try {
      const data = await getLLMSelectionSettings();
      res.status(200).json({
        success: true,
        data,
        message: "当前模型选择已加载。",
      } satisfies ApiResponse<LLMSelectionSettings | null>);
    } catch (error) {
      next(error);
    }
  });

  router.put(
    "/llm-selection",
    validate({ body: llmSelectionSchema }),
    async (req, res, next) => {
      try {
        const data = await saveLLMSelectionSettings(req.body as z.infer<typeof llmSelectionSchema>);
        res.status(200).json({
          success: true,
          data,
          message: "当前模型选择已保存。",
        } satisfies ApiResponse<LLMSelectionSettings>);
      } catch (error) {
        next(error);
      }
    },
  );
}
