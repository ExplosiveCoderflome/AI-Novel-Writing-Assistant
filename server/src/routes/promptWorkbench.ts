import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  promptWorkbenchService,
  type PromptCatalogFilter,
  type PromptPreviewInput,
  type PromptTestRunInput,
} from "../prompting/PromptWorkbenchService";
import {
  exportNovelPromptMaterials,
  type NovelMaterialExportInput,
} from "../prompting/materials";
import { promptSlotOverrideService } from "../prompting/slots/PromptSlotOverrideService";
import { getOfficialPromptSlotLibrary } from "../prompting/slots/officialSlotLibrary";
import { reconcileSlots, adoptSlots, applyOfficialSlots, keepMineSlots } from "../prompting/slots/slotReconcile";
import { promptTemplateOverrideService } from "../prompting/templates/PromptTemplateOverrideService";

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
  slotOverrides: z.record(z.string(), z.unknown()).optional(),
  templateDraft: z.object({
    kind: z.literal("chat"),
    messages: z.array(z.object({
      role: z.enum(["system", "human"]),
      content: z.string().max(60000),
    })).min(2).max(2),
  }).optional(),
}).refine((value) => Boolean(value.promptKey || (value.id && value.version)), {
  message: "Provide promptKey or both id and version.",
  path: ["promptKey"],
});

const promptTestRunBodySchema = previewBodySchema.and(z.object({
  llm: z.object({
    provider: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(256).max(32768).optional(),
    timeoutMs: z.number().int().min(1000).max(10 * 60 * 1000).optional(),
  }).optional(),
}));

const materialExportBodySchema = z.object({
  novelId: z.string().trim().min(1),
  chapterId: z.string().trim().min(1).optional(),
  taskId: z.string().trim().min(1).optional(),
  volumeId: z.string().trim().min(1).optional(),
  groups: z.array(z.string().trim().min(1)).max(40).optional(),
  maxTokens: z.number().int().min(0).max(200000).optional(),
});

const slotOverrideQuerySchema = z.object({
  promptId: z.string().trim().min(1),
  novelId: z.string().trim().min(1).optional(),
});

const officialSlotsQuerySchema = z.object({
  promptId: z.string().trim().min(1),
});

const templateOverrideQuerySchema = z.object({
  promptId: z.string().trim().min(1),
  novelId: z.string().trim().min(1),
});

const templateMessageSchema = z.object({
  role: z.enum(["system", "human"]),
  content: z.string().min(1).max(60000),
});

const templateJsonSchema = z.object({
  kind: z.literal("chat"),
  messages: z.array(templateMessageSchema).min(2).max(2),
});

const templateOverrideSaveBodySchema = z.object({
  promptId: z.string().trim().min(1),
  novelId: z.string().trim().min(1),
  template: templateJsonSchema,
  notes: z.string().trim().max(2000).nullable().optional(),
});

const templateVersionActionBodySchema = z.object({
  promptId: z.string().trim().min(1),
  novelId: z.string().trim().min(1),
  versionId: z.string().trim().min(1),
});

const templateRestoreBodySchema = z.object({
  promptId: z.string().trim().min(1),
  novelId: z.string().trim().min(1),
});

const contextReferencesQuerySchema = z.object({
  promptId: z.string().trim().min(1),
  novelId: z.string().trim().min(1).optional(),
  chapterId: z.string().trim().min(1).optional(),
  entrypoint: z.string().trim().min(1).optional(),
});

const slotOverrideSaveBodySchema = z.object({
  scope: z.enum(["global", "novel"]),
  novelId: z.string().trim().min(1).nullable().optional(),
  promptId: z.string().trim().min(1),
  slotUpdates: z.record(z.string(), z.unknown()),
});

const slotOverrideDeleteBodySchema = z.object({
  scope: z.enum(["global", "novel"]),
  novelId: z.string().trim().min(1).nullable().optional(),
  promptId: z.string().trim().min(1),
  slotKeys: z.array(z.string().trim().min(1)).optional(),
});

const reconcileQuerySchema = z.object({
  promptId: z.string().trim().min(1),
  scope: z.enum(["global", "novel"]),
  novelId: z.string().trim().min(1).optional(),
});

const adoptKeepBodySchema = z.object({
  promptId: z.string().trim().min(1),
  scope: z.enum(["global", "novel"]),
  novelId: z.string().trim().min(1).nullable().optional(),
  slotKeys: z.array(z.string().trim().min(1)).min(1),
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

router.post("/test-run", validate({ body: promptTestRunBodySchema }), async (req, res, next) => {
  try {
    const data = await promptWorkbenchService.testRun(req.body as PromptTestRunInput);
    res.status(200).json({
      success: true,
      data,
      message: "Prompt test run completed.",
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

// Slot overrides
router.get("/slot-overrides", validate({ query: slotOverrideQuerySchema }), async (req, res, next) => {
  try {
    const query = req.query as z.infer<typeof slotOverrideQuerySchema>;
    const data = await promptSlotOverrideService.list({
      promptId: query.promptId,
      novelId: query.novelId,
    });
    res.status(200).json({
      success: true,
      data,
      message: "Slot overrides loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/official-slots", validate({ query: officialSlotsQuerySchema }), (req, res, next) => {
  try {
    const query = req.query as z.infer<typeof officialSlotsQuerySchema>;
    const data = getOfficialPromptSlotLibrary(query.promptId);
    res.status(200).json({
      success: true,
      data,
      message: "Official prompt slots loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/template-overrides", validate({ query: templateOverrideQuerySchema }), async (req, res, next) => {
  try {
    const query = req.query as z.infer<typeof templateOverrideQuerySchema>;
    const data = await promptTemplateOverrideService.get({
      promptId: query.promptId,
      novelId: query.novelId,
    });
    res.status(200).json({
      success: true,
      data,
      message: "Prompt template override loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put("/template-overrides", validate({ body: templateOverrideSaveBodySchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof templateOverrideSaveBodySchema>;
    const data = await promptTemplateOverrideService.save({
      promptId: body.promptId,
      novelId: body.novelId,
      template: body.template,
      notes: body.notes,
    });
    res.status(200).json({
      success: true,
      data,
      message: "Prompt template override saved.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/template-overrides/activate-version",
  validate({ body: templateVersionActionBodySchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof templateVersionActionBodySchema>;
      const data = await promptTemplateOverrideService.activateVersion(body);
      res.status(200).json({
        success: true,
        data,
        message: "Prompt template version activated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/template-overrides/restore-official",
  validate({ body: templateRestoreBodySchema }),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof templateRestoreBodySchema>;
      const data = await promptTemplateOverrideService.restoreOfficial(body);
      res.status(200).json({
        success: true,
        data,
        message: "Official prompt template restored.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get("/context-references", validate({ query: contextReferencesQuerySchema }), async (req, res, next) => {
  try {
    const query = req.query as z.infer<typeof contextReferencesQuerySchema>;
    const data = await promptWorkbenchService.contextReferences(query);
    res.status(200).json({
      success: true,
      data,
      message: "Prompt context references loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put("/slot-overrides", validate({ body: slotOverrideSaveBodySchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof slotOverrideSaveBodySchema>;
    const data = await promptSlotOverrideService.save({
      scope: body.scope,
      novelId: body.novelId,
      promptId: body.promptId,
      slotUpdates: body.slotUpdates,
    });
    res.status(200).json({
      success: true,
      data,
      message: "Slot override saved.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.delete("/slot-overrides", validate({ body: slotOverrideDeleteBodySchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof slotOverrideDeleteBodySchema>;
    await promptSlotOverrideService.deleteSlots({
      scope: body.scope,
      novelId: body.novelId,
      promptId: body.promptId,
      slotKeys: body.slotKeys,
    });
    res.status(200).json({
      success: true,
      data: null,
      message: "Slot override deleted.",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

router.get("/slot-overrides/reconcile", validate({ query: reconcileQuerySchema }), async (req, res, next) => {
  try {
    const query = req.query as z.infer<typeof reconcileQuerySchema>;
    const data = await reconcileSlots({
      promptId: query.promptId,
      scope: query.scope,
      novelId: query.novelId ?? null,
    });
    res.status(200).json({
      success: true,
      data,
      message: "Slot reconcile computed.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/slot-overrides/adopt", validate({ body: adoptKeepBodySchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof adoptKeepBodySchema>;
    await adoptSlots({
      promptId: body.promptId,
      scope: body.scope,
      novelId: body.novelId,
      slotKeys: body.slotKeys,
    });
    res.status(200).json({
      success: true,
      data: null,
      message: "Slots adopted.",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

router.post("/slot-overrides/apply-official", validate({ body: adoptKeepBodySchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof adoptKeepBodySchema>;
    await applyOfficialSlots({
      promptId: body.promptId,
      scope: body.scope,
      novelId: body.novelId,
      slotKeys: body.slotKeys,
    });
    res.status(200).json({
      success: true,
      data: null,
      message: "Official slots applied.",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

router.post("/slot-overrides/keep", validate({ body: adoptKeepBodySchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof adoptKeepBodySchema>;
    await keepMineSlots({
      promptId: body.promptId,
      scope: body.scope,
      novelId: body.novelId,
      slotKeys: body.slotKeys,
    });
    res.status(200).json({
      success: true,
      data: null,
      message: "Slots kept.",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

export default router;
