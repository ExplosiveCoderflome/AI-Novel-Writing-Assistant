import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { llmProviderSchema } from "../llm/providerSchema";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { characterGenerateConstraintsSchema, generateBaseCharacterFromAI } from "../services/character/characterGenerate";

const router = Router();

const listQuerySchema = z.object({
  category: z.string().trim().optional(),
  tags: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

const idSchema = z.object({
  id: z.string().trim().min(1),
});

const baseCharacterSchema = z.object({
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  personality: z.string().trim().min(1),
  background: z.string().trim().min(1),
  development: z.string().trim().min(1),
  appearance: z.string().optional(),
  weaknesses: z.string().optional(),
  interests: z.string().optional(),
  keyEvents: z.string().optional(),
  tags: z.string().optional(),
  category: z.string().trim().min(1),
});

const updateBaseCharacterSchema = baseCharacterSchema.partial();

const generateSchema = z.object({
  description: z.string().trim().min(1),
  category: z.string().trim().min(1),
  genre: z.string().trim().optional(),
  provider: llmProviderSchema.optional(),
  model: z.string().optional(),
  novelId: z.string().trim().min(1).optional(),
  knowledgeDocumentIds: z.array(z.string().trim().min(1)).max(5).optional(),
  bookAnalysisIds: z.array(z.string().trim().min(1)).max(5).optional(),
  constraints: characterGenerateConstraintsSchema.optional(),
});

router.use(authMiddleware);

router.get("/", validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const query = req.query as z.infer<typeof listQuerySchema>;
    const data = await prisma.baseCharacter.findMany({
      where: {
        category: query.category ? { equals: query.category } : undefined,
        tags: query.tags ? { contains: query.tags } : undefined,
        OR: query.search
          ? [
              { name: { contains: query.search } },
              { personality: { contains: query.search } },
              { background: { contains: query.search } },
              { appearance: { contains: query.search } },
              { weaknesses: { contains: query.search } },
              { interests: { contains: query.search } },
              { keyEvents: { contains: query.search } },
              { tags: { contains: query.search } },
            ]
          : undefined,
      },
      orderBy: { updatedAt: "desc" },
    });
    res.status(200).json({
      success: true,
      data,
      message: "获取基础角色列表成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/", validate({ body: baseCharacterSchema }), async (req, res, next) => {
  try {
    const data = await prisma.baseCharacter.create({
      data: {
        ...req.body,
        tags: req.body.tags ?? "",
      },
    });
    res.status(201).json({
      success: true,
      data,
      message: "创建基础角色成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", validate({ params: idSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idSchema>;
    const data = await prisma.baseCharacter.findUnique({
      where: { id },
    });
    if (!data) {
      res.status(404).json({
        success: false,
        error: "角色不存在。",
      } satisfies ApiResponse<null>);
      return;
    }
    res.status(200).json({
      success: true,
      data,
      message: "获取角色详情成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put(
  "/:id",
  validate({ params: idSchema, body: updateBaseCharacterSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idSchema>;
      const data = await prisma.baseCharacter.update({
        where: { id },
        data: req.body as z.infer<typeof updateBaseCharacterSchema>,
      });
      res.status(200).json({
        success: true,
        data,
        message: "更新角色成功。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.delete("/:id", validate({ params: idSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idSchema>;
    await prisma.baseCharacter.delete({ where: { id } });
    res.status(200).json({
      success: true,
      message: "删除角色成功。",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

router.post("/generate", validate({ body: generateSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof generateSchema>;
    const result = await generateBaseCharacterFromAI(body);

    res.status(200).json({
      success: true,
      data: result.data,
      message: result.outputAnomaly
        ? "AI 角色生成完成（模型输出异常，已自动回退）。"
        : "AI 角色生成成功。",
    } satisfies ApiResponse<typeof result.data>);
  } catch (error) {
    next(error);
  }
});

export default router;
