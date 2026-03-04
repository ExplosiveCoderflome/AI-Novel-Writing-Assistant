import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { getLLM } from "../llm/factory";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";

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
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic"]).optional(),
  model: z.string().optional(),
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
    const llm = await getLLM(body.provider ?? "deepseek", {
      model: body.model,
      temperature: 0.8,
    });

    const result = await llm.invoke([
      new SystemMessage(
        `你是一位专业的小说角色设计师。请根据描述生成完整角色设定。
输出 JSON：
{
  "name": "...",
  "role": "主角/反派/配角",
  "personality": "...",
  "background": "...",
  "development": "...",
  "appearance": "...",
  "weaknesses": "...",
  "interests": "...",
  "keyEvents": "...",
  "tags": "标签1,标签2"
}`,
      ),
      new HumanMessage(
        `角色描述：${body.description}
角色类别：${body.category}
小说类型：${body.genre ?? "通用"}
请仅输出 JSON。`,
      ),
    ]);

    const text = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
    const normalized = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(normalized) as z.infer<typeof baseCharacterSchema>;
    const data = await prisma.baseCharacter.create({
      data: {
        ...parsed,
        category: body.category,
        tags: parsed.tags ?? "",
      },
    });

    res.status(200).json({
      success: true,
      data,
      message: "AI 角色生成成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

export default router;
