import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { llmProviderSchema } from "../llm/providerSchema";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { GenreService } from "../services/genre/GenreService";
import { generateGenreTreeDraft } from "../services/genre/genreGenerate";

const router = Router();
const genreService = new GenreService();

interface GenreCreateNodeInput {
  name: string;
  description?: string;
  template?: string;
  children?: GenreCreateNodeInput[];
}

const genreCreateNodeSchema: z.ZodType<GenreCreateNodeInput> = z.lazy(() => z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(400).optional(),
  template: z.string().trim().max(4000).optional(),
  children: z.array(genreCreateNodeSchema).max(12).default([]),
}));

const idParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const createGenreSchema = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(400).optional(),
  template: z.string().trim().max(4000).optional(),
  parentId: z.string().trim().nullable().optional(),
  children: z.array(genreCreateNodeSchema).max(12).default([]),
});

const updateGenreSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  description: z.string().trim().max(400).nullable().optional(),
  template: z.string().trim().max(4000).nullable().optional(),
  parentId: z.string().trim().nullable().optional(),
});

const generateGenreSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(256).max(32768).optional(),
});

router.use(authMiddleware);

router.get("/", async (_req, res, next) => {
  try {
    const data = await genreService.listGenreTree();
    res.status(200).json({
      success: true,
      data,
      message: "获取类型树成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/", validate({ body: createGenreSchema }), async (req, res, next) => {
  try {
    const data = await genreService.createGenreTree(req.body as z.infer<typeof createGenreSchema>);
    res.status(201).json({
      success: true,
      data,
      message: "创建类型成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/generate", validate({ body: generateGenreSchema }), async (req, res, next) => {
  try {
    const data = await generateGenreTreeDraft(req.body as z.infer<typeof generateGenreSchema>);
    res.status(200).json({
      success: true,
      data,
      message: "AI 类型树生成成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", validate({ params: idParamsSchema, body: updateGenreSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await genreService.updateGenre(id, req.body as z.infer<typeof updateGenreSchema>);
    res.status(200).json({
      success: true,
      data,
      message: "更新类型成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    await genreService.deleteGenre(id);
    res.status(200).json({
      success: true,
      message: "删除类型成功。",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

export default router;
