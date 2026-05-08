import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  promptWorkbenchService,
  type PromptCatalogFilter,
  type PromptPreviewInput,
} from "../prompting/PromptWorkbenchService";
import {
  exportNovelPromptMaterials,
  type NovelMaterialExportInput,
} from "../prompting/materials";
import {
  promptAddendumService,
  type PromptAddendumFilter,
  type PromptAddendumInput,
} from "../prompting/addendums/PromptAddendumService";

const router = Router();

router.use(authMiddleware);

const catalogQuerySchema = z.object({
  taskType: z.string().trim().min(1).optional(),
  mode: z.enum(["structured", "text"]).optional(),
  keyword: z.string().trim().min(1).optional(),
});

const contextRequirementSchema = z.object({
  group: z.string().trim().min(1),
  required: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000),
  maxTokens: z.number().int().min(1).max(100000).optional(),
  freshness: z.enum(["snapshot", "fresh", "hybrid"]).optional(),
  sourceHint: z.string().trim().max(240).optional(),
});

const recentMessageSchema = z.object({
  role: z.string().trim().min(1),
  content: z.string().max(20000),
  createdAt: z.string().trim().optional(),
});

const executionContextSchema = z.object({
  entrypoint: z.string().trim().min(1).default("manual_test"),
  graphNode: z.string().trim().min(1).optional(),
  workflowRunId: z.string().trim().min(1).optional(),
  stepRunId: z.string().trim().min(1).optional(),
  runId: z.string().trim().min(1).optional(),
  threadId: z.string().trim().min(1).optional(),
  checkpointId: z.string().trim().min(1).optional(),
  novelId: z.string().trim().min(1).optional(),
  chapterId: z.string().trim().min(1).optional(),
  worldId: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1).optional(),
  styleProfileId: z.string().trim().min(1).optional(),
  userGoal: z.string().trim().max(2000).optional(),
  resourceBindings: z.record(z.string(), z.unknown()).optional(),
  recentMessages: z.array(recentMessageSchema).max(20).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const previewBodySchema = z.object({
  promptKey: z.string().trim().min(1).optional(),
  id: z.string().trim().min(1).optional(),
  version: z.string().trim().min(1).optional(),
  promptInput: z.unknown().optional(),
  executionContext: executionContextSchema,
  contextRequirements: z.array(contextRequirementSchema).max(30).optional(),
  maxContextTokens: z.number().int().min(0).max(200000).optional(),
  contextMode: z.enum(["snapshot", "fresh", "hybrid"]).optional(),
}).refine((value) => Boolean(value.promptKey || (value.id && value.version)), {
  message: "Provide promptKey or both id and version.",
  path: ["promptKey"],
});

const materialExportBodySchema = z.object({
  novelId: z.string().trim().min(1),
  chapterId: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1).optional(),
  volumeId: z.string().trim().min(1).optional(),
  groups: z.array(z.string().trim().min(1)).max(40).optional(),
  maxTokens: z.number().int().min(0).max(200000).optional(),
});

const addendumQuerySchema = z.object({
  promptId: z.string().trim().min(1).optional(),
  novelId: z.string().trim().min(1).optional(),
});

const addendumBodySchema = z.object({
  id: z.string().trim().min(1).optional(),
  scope: z.enum(["global", "novel"]),
  novelId: z.string().trim().min(1).nullable().optional(),
  promptId: z.string().trim().min(1),
  title: z.string().trim().min(1).max(80),
  content: z.string().trim().min(1).max(4000),
  enabled: z.boolean().optional(),
});

const addendumEnabledBodySchema = z.object({
  enabled: z.boolean(),
});

router.get("/catalog", validate({ query: catalogQuerySchema }), (req, res) => {
  const query = req.query as z.infer<typeof catalogQuerySchema>;
  const data = promptWorkbenchService.listCatalog({
    taskType: query.taskType,
    mode: query.mode,
    keyword: query.keyword,
  } as PromptCatalogFilter);
  res.status(200).json({
    success: true,
    data,
    message: "Prompt catalog loaded.",
  } satisfies ApiResponse<typeof data>);
});

router.post("/preview", validate({ body: previewBodySchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof previewBodySchema>;
    const data = await promptWorkbenchService.preview(body as PromptPreviewInput);
    res.status(200).json({
      success: true,
      data,
      message: "Prompt preview rendered.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/materials/export", validate({ body: materialExportBodySchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof materialExportBodySchema>;
    const data = await exportNovelPromptMaterials(body as NovelMaterialExportInput);
    res.status(200).json({
      success: true,
      data,
      message: "Prompt materials exported.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/addendums", validate({ query: addendumQuerySchema }), async (req, res, next) => {
  try {
    const query = req.query as z.infer<typeof addendumQuerySchema>;
    const data = await promptAddendumService.list(query as PromptAddendumFilter);
    res.status(200).json({
      success: true,
      data,
      message: "Prompt addendums loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put("/addendums", validate({ body: addendumBodySchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof addendumBodySchema>;
    const data = await promptAddendumService.save(body as PromptAddendumInput);
    res.status(200).json({
      success: true,
      data,
      message: "Prompt addendum saved.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.patch("/addendums/:id/enabled", validate({ body: addendumEnabledBodySchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof addendumEnabledBodySchema>;
    const data = await promptAddendumService.setEnabled(String(req.params.id), body.enabled);
    res.status(200).json({
      success: true,
      data,
      message: "Prompt addendum updated.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.delete("/addendums/:id", async (req, res, next) => {
  try {
    await promptAddendumService.delete(String(req.params.id));
    res.status(200).json({
      success: true,
      data: null,
      message: "Prompt addendum deleted.",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

export default router;
