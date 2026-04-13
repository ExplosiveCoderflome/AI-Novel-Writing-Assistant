import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { NovelDirectorService } from "../services/novel/director/NovelDirectorService";
import { NovelWorkflowService } from "../services/novel/workflow/NovelWorkflowService";
import { NovelWorkflowTaskAdapter } from "../services/task/adapters/NovelWorkflowTaskAdapter";

const router = Router();
const workflowService = new NovelWorkflowService();
const workflowAdapter = new NovelWorkflowTaskAdapter();
const novelDirectorService = new NovelDirectorService();

const stageSchema = z.enum([
  "project_setup",
  "auto_director",
  "story_macro",
  "character_setup",
  "volume_strategy",
  "structured_outline",
  "chapter_execution",
  "quality_repair",
]);

const checkpointSchema = z.enum([
  "candidate_selection_required",
  "book_contract_ready",
  "character_setup_required",
  "volume_strategy_ready",
  "front10_ready",
  "chapter_batch_ready",
  "replan_required",
  "workflow_completed",
]);

const bootstrapSchema = z.object({
  workflowTaskId: z.string().trim().optional(),
  novelId: z.string().trim().optional(),
  lane: z.enum(["manual_create", "auto_director"]),
  title: z.string().trim().optional(),
  seedPayload: z.record(z.string(), z.unknown()).optional(),
});

const continueParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const continueBodySchema = z.object({
  continuationMode: z.enum(["resume", "auto_execute_front10"]).optional(),
});

const novelParamsSchema = z.object({
  novelId: z.string().trim().min(1),
});

const syncStageSchema = z.object({
  novelId: z.string().trim().min(1),
  stage: stageSchema,
  itemLabel: z.string().trim().min(1),
  itemKey: z.string().trim().optional(),
  checkpointType: checkpointSchema.nullish(),
  checkpointSummary: z.string().trim().optional(),
  chapterId: z.string().trim().optional(),
  volumeId: z.string().trim().optional(),
  progress: z.number().min(0).max(1).optional(),
  status: z.enum(["queued", "running", "waiting_approval", "succeeded", "failed", "cancelled"]).optional(),
});

router.use(authMiddleware);

router.post("/bootstrap", validate({ body: bootstrapSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof bootstrapSchema>;
    const row = await workflowService.bootstrapTask(body);
    const data = await workflowAdapter.detail(row.id);
    res.status(200).json({
      success: true,
      data,
      message: "Novel workflow ready.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/novels/:novelId/auto-director", validate({ params: novelParamsSchema }), async (req, res, next) => {
  try {
    const { novelId } = req.params as z.infer<typeof novelParamsSchema>;
    const row = await workflowService.findLatestVisibleTaskByNovelId(novelId, "auto_director");
    const data = row ? await workflowAdapter.detail(row.id) : null;
    res.status(200).json({
      success: true,
      data,
      message: data ? "Latest auto director task loaded." : "No auto director task found.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/continue", validate({ params: continueParamsSchema, body: continueBodySchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof continueParamsSchema>;
    const body = req.body as z.infer<typeof continueBodySchema>;
    await novelDirectorService.continueTask(id, {
      continuationMode: body.continuationMode,
    });
    const data = await workflowAdapter.detail(id);
    res.status(200).json({
      success: true,
      data,
      message: "Novel workflow continued.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/sync-stage", validate({ body: syncStageSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof syncStageSchema>;
    const row = await workflowService.syncStageByNovelId(body.novelId, {
      stage: body.stage,
      itemLabel: body.itemLabel,
      itemKey: body.itemKey,
      checkpointType: body.checkpointType ?? null,
      checkpointSummary: body.checkpointSummary ?? null,
      chapterId: body.chapterId,
      volumeId: body.volumeId,
      progress: body.progress,
      status: body.status,
    });
    const data = await workflowAdapter.detail(row.id);
    res.status(200).json({
      success: true,
      data,
      message: "Novel workflow stage synced.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

export default router;
