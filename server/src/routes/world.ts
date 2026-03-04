import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { streamToSSE } from "../llm/streaming";
import { WorldService } from "../services/world/WorldService";

const router = Router();
const worldService = new WorldService();

const worldIdSchema = z.object({
  id: z.string().trim().min(1),
});

const createWorldSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  background: z.string().optional(),
  geography: z.string().optional(),
  cultures: z.string().optional(),
  magicSystem: z.string().optional(),
  politics: z.string().optional(),
  races: z.string().optional(),
  religions: z.string().optional(),
  technology: z.string().optional(),
  conflicts: z.string().optional(),
});

const updateWorldSchema = createWorldSchema.partial();

const worldGenerateSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  worldType: z.string().trim().min(1),
  complexity: z.enum(["simple", "standard", "detailed"]),
  dimensions: z.object({
    geography: z.boolean(),
    culture: z.boolean(),
    magicSystem: z.boolean(),
    technology: z.boolean(),
    history: z.boolean(),
  }),
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic"]).optional(),
  model: z.string().optional(),
});

const worldRefineSchema = z.object({
  attribute: z.enum([
    "description",
    "background",
    "geography",
    "cultures",
    "magicSystem",
    "politics",
    "races",
    "religions",
    "technology",
    "conflicts",
  ]),
  currentValue: z.string().trim().min(1),
  refinementLevel: z.enum(["light", "deep"]),
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic"]).optional(),
  model: z.string().optional(),
});

router.use(authMiddleware);

router.get("/", async (_req, res, next) => {
  try {
    const data = await worldService.listWorlds();
    res.status(200).json({
      success: true,
      data,
      message: "获取世界观列表成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/", validate({ body: createWorldSchema }), async (req, res, next) => {
  try {
    const data = await worldService.createWorld(req.body as z.infer<typeof createWorldSchema>);
    res.status(201).json({
      success: true,
      data,
      message: "创建世界观成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", validate({ params: worldIdSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof worldIdSchema>;
    const data = await worldService.getWorldById(id);
    if (!data) {
      res.status(404).json({
        success: false,
        error: "世界观不存在。",
      } satisfies ApiResponse<null>);
      return;
    }
    res.status(200).json({
      success: true,
      data,
      message: "获取世界观详情成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put(
  "/:id",
  validate({ params: worldIdSchema, body: updateWorldSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof worldIdSchema>;
      const data = await worldService.updateWorld(id, req.body as z.infer<typeof updateWorldSchema>);
      res.status(200).json({
        success: true,
        data,
        message: "更新世界观成功。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.delete("/:id", validate({ params: worldIdSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof worldIdSchema>;
    await worldService.deleteWorld(id);
    res.status(200).json({
      success: true,
      message: "删除世界观成功。",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

router.post("/generate", validate({ body: worldGenerateSchema }), async (req, res, next) => {
  try {
    const { stream, onDone } = await worldService.createWorldGenerateStream(
      req.body as z.infer<typeof worldGenerateSchema>,
    );
    await streamToSSE(res, stream, onDone);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:id/refine",
  validate({ params: worldIdSchema, body: worldRefineSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof worldIdSchema>;
      const { stream, onDone } = await worldService.createRefineStream(
        id,
        req.body as z.infer<typeof worldRefineSchema>,
      );
      await streamToSSE(res, stream, onDone);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
