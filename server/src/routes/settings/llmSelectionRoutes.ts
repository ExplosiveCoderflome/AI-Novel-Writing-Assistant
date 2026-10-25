import type { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { MODEL_ROUTE_REQUEST_PROTOCOLS } from "@ai-novel/shared/types/novel";
import { llmProviderSchema } from "../../llm/providerSchema";
import { validate } from "../../middleware/validate";
import { getModelTokenSettings, saveModelTokenSettings } from "../../services/settings/modelTokens";
import {
  getLLMSelectionSettings,
  saveLLMSelectionSettings,
  type LLMSelectionSettings,
} from "../../services/settings/LLMSelectionSettingsService";

const llmSelectionSchema = z.object({
  provider: llmProviderSchema,
  model: z.string().trim().min(1, "模型名称不能为空。"),
  temperature: z.coerce.number().min(0).max(2).optional(),
  maxTokens: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
});

export function registerLLMSelectionRoutes(router: Router): void {
  router.get("/model-token-settings", async (req, res, next) => {
    try { res.json({ success: true, data: await getModelTokenSettings(String(req.query.provider ?? ""), String(req.query.model ?? "")) }); }
    catch (error) { next(error); }
  });
  const tokenSettingsSchema = z.object({ provider: llmProviderSchema, model: z.string().trim().min(1),
    maxOutputTokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
    contextWindowTokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
    maxInputTokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
    maxReasoningTokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
    budgetSharing: z.enum(["unknown", "shared", "separate"]),
    requestProtocol: z.enum(MODEL_ROUTE_REQUEST_PROTOCOLS).optional(),
    chatReasoningFormat: z.enum(["none","reasoning_effort"]).optional(),
    thinkingMode: z.enum(["default", "disabled", "enabled", "adaptive"]).optional(),
    thinkingEffort: z.enum(["default", "none", "minimal", "low", "medium", "high", "xhigh", "max"]).optional(),
    thinkingBudgetTokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    outputTokenParameter: z.enum(["auto", "max_tokens", "max_completion_tokens"]).optional(),
  });
  router.put("/model-token-settings", validate({ body: tokenSettingsSchema }), async (req, res, next) => {
    try { const {provider, model, ...settings} = req.body as z.infer<typeof tokenSettingsSchema>;
      res.json({ success: true, data: await saveModelTokenSettings(provider, model, settings) }); }
    catch (error) { next(error); }
  });
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
