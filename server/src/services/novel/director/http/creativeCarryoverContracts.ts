import { Router } from "express";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { creativeCarryoverModeSchema } from "@ai-novel/shared/types/creativeCarryoverContract";
import { validate } from "../../../../middleware/validate";
import { llmProviderSchema } from "../../../../llm/providerSchema";
import {
  creativeCarryoverContractService,
  type CreativeCarryoverGenerateResult,
} from "../reference/CreativeCarryoverContractService";

const router = Router();

const generateBodySchema = z.object({
  mode: creativeCarryoverModeSchema,
  bookAnalysisId: z.string().trim().min(1),
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

function ok<T>(data: T, message: string): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
  };
}

router.post("/", validate({ body: generateBodySchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof generateBodySchema>;
    const data = await creativeCarryoverContractService.generate(body) as CreativeCarryoverGenerateResult;
    const message = data.status === "ready"
      ? "创作承接方案已生成。"
      : "拆书材料还不够，请先补齐缺失结论。";
    res.status(200).json(ok(data, message));
  } catch (error) {
    next(error);
  }
});

export default router;
