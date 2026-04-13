import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { StoryModeService } from "../services/storyMode/StoryModeService";
import {
  generateStoryModeChildDrafts,
  generateStoryModeTreeDraft,
} from "../services/storyMode/storyModeGenerate";
import { storyModeProfileSchema } from "../services/storyMode/storyModeProfile";

const router = Router();
const storyModeService = new StoryModeService();

interface StoryModeCreateNodeInput {
  name: string;
  description?: string;
  template?: string;
  profile: z.infer<typeof storyModeProfileSchema>;
  children?: StoryModeCreateNodeInput[];
}

const storyModeCreateNodeSchema: z.ZodType<StoryModeCreateNodeInput> = z.lazy(() => z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(400).optional(),
  template: z.string().trim().max(4000).optional(),
  profile: storyModeProfileSchema,
  children: z.array(storyModeCreateNodeSchema).max(12).default([]),
}));

const idParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const createStoryModeSchema = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(400).optional(),
  template: z.string().trim().max(4000).optional(),
  profile: storyModeProfileSchema,
  parentId: z.string().trim().nullable().optional(),
  children: z.array(storyModeCreateNodeSchema).max(12).default([]),
});

const createStoryModeChildNodeSchema = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(400).optional(),
  template: z.string().trim().max(4000).optional(),
  profile: storyModeProfileSchema,
  children: z.array(z.unknown()).max(0).default([]),
});

const createStoryModeChildrenSchema = z.object({
  parentId: z.string().trim().min(1),
  drafts: z.array(createStoryModeChildNodeSchema).min(1).max(12),
});

const updateStoryModeSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  description: z.string().trim().max(400).nullable().optional(),
  template: z.string().trim().max(4000).nullable().optional(),
  profile: storyModeProfileSchema.optional(),
  parentId: z.string().trim().nullable().optional(),
});

const generateStoryModeSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic", "grok", "kimi", "glm", "qwen", "gemini", "longcat"]).optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(256).max(32768).optional(),
});

const generateStoryModeChildSchema = generateStoryModeSchema.extend({
  parentId: z.string().trim().min(1),
  prompt: z.string().trim().max(4000).optional(),
  count: z.number().int().min(1).max(5).optional(),
});

router.use(authMiddleware);

router.get("/", async (_req, res, next) => {
  try {
    const data = await storyModeService.listStoryModeTree();
    res.status(200).json({
      success: true,
      data,
      message: "获取流派模式树成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/", validate({ body: createStoryModeSchema }), async (req, res, next) => {
  try {
    const data = await storyModeService.createStoryModeTree(req.body as z.infer<typeof createStoryModeSchema>);
    res.status(201).json({
      success: true,
      data,
      message: "创建流派模式成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/batch-children", validate({ body: createStoryModeChildrenSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createStoryModeChildrenSchema>;
    const data = await storyModeService.createStoryModeChildren({
      parentId: body.parentId,
      drafts: body.drafts.map((draft) => ({
        name: draft.name,
        description: draft.description,
        template: draft.template,
        profile: draft.profile,
        children: [],
      })),
    });
    res.status(201).json({
      success: true,
      data,
      message: "批量创建流派模式子类成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/generate", validate({ body: generateStoryModeSchema }), async (req, res, next) => {
  try {
    const data = await generateStoryModeTreeDraft(req.body as z.infer<typeof generateStoryModeSchema>);
    res.status(200).json({
      success: true,
      data,
      message: "AI 流派模式树草稿生成成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/generate-child", validate({ body: generateStoryModeChildSchema }), async (req, res, next) => {
  try {
    const data = await generateStoryModeChildDrafts(req.body as z.infer<typeof generateStoryModeChildSchema>);
    res.status(200).json({
      success: true,
      data,
      message: "AI 流派模式子类草稿生成成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", validate({ params: idParamsSchema, body: updateStoryModeSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    const data = await storyModeService.updateStoryMode(id, req.body as z.infer<typeof updateStoryModeSchema>);
    res.status(200).json({
      success: true,
      data,
      message: "更新流派模式成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", validate({ params: idParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamsSchema>;
    await storyModeService.deleteStoryMode(id);
    res.status(200).json({
      success: true,
      message: "删除流派模式成功。",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

export default router;
