import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { TaskKind, TaskStatus } from "@ai-novel/shared/types/task";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { taskCenterService } from "../services/task/TaskCenterService";

const router = Router();

const kindSchema = z.enum(["book_analysis", "novel_pipeline", "knowledge_document", "image_generation", "agent_run"]);
const statusSchema = z.enum(["queued", "running", "waiting_approval", "succeeded", "failed", "cancelled"]);

const listQuerySchema = z.object({
  kind: kindSchema.optional(),
  status: statusSchema.optional(),
  keyword: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().optional(),
});

const taskParamsSchema = z.object({
  kind: kindSchema,
  id: z.string().trim().min(1),
});

router.use(authMiddleware);

router.get("/", validate({ query: listQuerySchema }), async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const data = await taskCenterService.listTasks({
      kind: query.kind as TaskKind | undefined,
      status: query.status as TaskStatus | undefined,
      keyword: query.keyword,
      limit: query.limit,
      cursor: query.cursor,
    });
    res.status(200).json({
      success: true,
      data,
      message: "Tasks loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/:kind/:id", validate({ params: taskParamsSchema }), async (req, res, next) => {
  try {
    const { kind, id } = req.params as z.infer<typeof taskParamsSchema>;
    const data = await taskCenterService.getTaskDetail(kind, id);
    if (!data) {
      res.status(404).json({
        success: false,
        error: "Task not found.",
      } satisfies ApiResponse<null>);
      return;
    }
    res.status(200).json({
      success: true,
      data,
      message: "Task loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/:kind/:id/retry", validate({ params: taskParamsSchema }), async (req, res, next) => {
  try {
    const { kind, id } = req.params as z.infer<typeof taskParamsSchema>;
    const data = await taskCenterService.retryTask(kind, id);
    res.status(200).json({
      success: true,
      data,
      message: "Task retried.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/:kind/:id/cancel", validate({ params: taskParamsSchema }), async (req, res, next) => {
  try {
    const { kind, id } = req.params as z.infer<typeof taskParamsSchema>;
    const data = await taskCenterService.cancelTask(kind, id);
    res.status(200).json({
      success: true,
      data,
      message: "Task cancelled.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/:kind/:id/archive", validate({ params: taskParamsSchema }), async (req, res, next) => {
  try {
    const { kind, id } = req.params as z.infer<typeof taskParamsSchema>;
    const data = await taskCenterService.archiveTask(kind, id);
    res.status(200).json({
      success: true,
      data,
      message: "Task archived.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

export default router;
