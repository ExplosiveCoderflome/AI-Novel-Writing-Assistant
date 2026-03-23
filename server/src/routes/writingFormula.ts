import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { streamToSSE } from "../llm/streaming";
import { WritingFormulaService } from "../services/writingFormula/WritingFormulaService";

const router = Router();
const writingFormulaService = new WritingFormulaService();

const idSchema = z.object({
  id: z.string().trim().min(1),
});

const extractSchema = z.object({
  name: z.string().trim().min(1),
  sourceText: z.string().trim().min(1),
  extractLevel: z.enum(["basic", "standard", "deep"]),
  focusAreas: z.array(z.string().trim().min(1)).min(1),
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic", "grok", "kimi", "glm", "qwen", "gemini"]).optional(),
  model: z.string().optional(),
});

const applySchema = z
  .object({
    formulaId: z.string().trim().optional(),
    formulaContent: z.string().optional(),
    mode: z.enum(["rewrite", "generate"]),
    sourceText: z.string().optional(),
    topic: z.string().optional(),
    targetLength: z.number().int().min(100).max(8000).optional(),
    provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic", "grok", "kimi", "glm", "qwen", "gemini"]).optional(),
    model: z.string().optional(),
  })
  .refine((value) => value.formulaId || value.formulaContent, {
    message: "必须提供 formulaId 或 formulaContent。",
    path: ["formulaId"],
  });

router.use(authMiddleware);

router.get("/", async (_req, res, next) => {
  try {
    const data = await writingFormulaService.listFormulas();
    res.status(200).json({
      success: true,
      data,
      message: "获取写作公式列表成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", validate({ params: idSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idSchema>;
    const data = await writingFormulaService.getFormulaById(id);
    if (!data) {
      res.status(404).json({
        success: false,
        error: "写作公式不存在。",
      } satisfies ApiResponse<null>);
      return;
    }
    res.status(200).json({
      success: true,
      data,
      message: "获取写作公式详情成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", validate({ params: idSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idSchema>;
    await writingFormulaService.deleteFormula(id);
    res.status(200).json({
      success: true,
      message: "删除写作公式成功。",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

router.post("/extract", validate({ body: extractSchema }), async (req, res, next) => {
  try {
    const { stream, onDone } = await writingFormulaService.createExtractStream(
      req.body as z.infer<typeof extractSchema>,
    );
    await streamToSSE(res, stream, onDone);
  } catch (error) {
    next(error);
  }
});

router.post("/apply", validate({ body: applySchema }), async (req, res, next) => {
  try {
    const { stream } = await writingFormulaService.createApplyStream(
      req.body as z.infer<typeof applySchema>,
    );
    await streamToSSE(res, stream);
  } catch (error) {
    next(error);
  }
});

export default router;
