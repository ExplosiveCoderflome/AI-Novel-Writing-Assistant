import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { generateTitleIdeas } from "../services/title/titleGenerate";
import { TitleLibraryService } from "../services/title/TitleLibraryService";

const router = Router();
const titleLibraryService = new TitleLibraryService();

const providerSchema = z.enum(["deepseek", "siliconflow", "openai", "anthropic", "grok"]);

const querySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(100).optional(),
  genreId: z.string().trim().optional(),
  sort: z.enum(["newest", "hot", "clickRate"]).optional(),
});

const idParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const createTitleSchema = z.object({
  title: z.string().trim().min(1).max(40),
  description: z.string().trim().max(400).nullable().optional(),
  clickRate: z.number().min(0).max(100).nullable().optional(),
  keywords: z.string().trim().max(400).nullable().optional(),
  genreId: z.string().trim().nullable().optional(),
});

const generateTitleSchema = z.object({
  mode: z.enum(["brief", "adapt"]),
  brief: z.string().trim().max(2000).optional(),
  referenceTitle: z.string().trim().max(120).optional(),
  genreId: z.string().trim().nullable().optional(),
  count: z.number().int().min(3).max(24).optional(),
  provider: providerSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(256).max(32768).optional(),
}).superRefine((value, context) => {
  if (value.mode === "brief" && !(value.brief ?? "").trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["brief"],
      message: "自由标题工坊需要创作简报。",
    });
  }
  if (value.mode === "adapt" && !(value.referenceTitle ?? "").trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["referenceTitle"],
      message: "改编模式需要参考标题。",
    });
  }
});

router.use(authMiddleware);

router.get("/", async (req, res, next) => {
  try {
    const query = querySchema.parse(req.query);
    const data = await titleLibraryService.list(query);
    res.status(200).json({
      success: true,
      data,
      message: "标题库加载成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/", validate({ body: createTitleSchema }), async (req, res, next) => {
  try {
    const data = await titleLibraryService.create(req.body as z.infer<typeof createTitleSchema>);
    res.status(201).json({
      success: true,
      data,
      message: "标题已加入标题库。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/generate", validate({ body: generateTitleSchema }), async (req, res, next) => {
  try {
    const data = await generateTitleIdeas(req.body as z.infer<typeof generateTitleSchema>);
    res.status(200).json({
      success: true,
      data,
      message: "标题工坊生成成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/use", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await titleLibraryService.markUsed(id);
    res.status(200).json({
      success: true,
      data,
      message: "标题使用次数已更新。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    await titleLibraryService.delete(id);
    res.status(200).json({
      success: true,
      message: "标题已删除。",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

export default router;
