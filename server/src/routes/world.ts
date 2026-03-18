import { Router } from "express";
import type { RequestHandler } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { WorldLayerKey } from "@ai-novel/shared/types/world";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { streamToSSE } from "../llm/streaming";
import { featureFlags } from "../config/featureFlags";
import { KnowledgeService } from "../services/knowledge/KnowledgeService";
import { WorldService } from "../services/world/WorldService";

const router = Router();
const worldService = new WorldService();
const knowledgeService = new KnowledgeService();

const requireWorldWizard: RequestHandler = (_req, res, next) => {
  if (featureFlags.worldWizardEnabled) {
    next();
    return;
  }
  res.status(404).json({
    success: false,
    error: "World wizard feature is disabled.",
  } satisfies ApiResponse<null>);
};

const requireWorldVisualization: RequestHandler = (_req, res, next) => {
  if (featureFlags.worldVisEnabled) {
    next();
    return;
  }
  res.status(404).json({
    success: false,
    error: "World visualization feature is disabled.",
  } satisfies ApiResponse<null>);
};

const providerSchema = z.enum(["deepseek", "siliconflow", "openai", "anthropic", "grok"]);

const worldIdSchema = z.object({
  id: z.string().trim().min(1),
});

const issueIdSchema = z.object({
  id: z.string().trim().min(1),
  issueId: z.string().trim().min(1),
});

const layerParamsSchema = z.object({
  id: z.string().trim().min(1),
  layerKey: z.enum(["foundation", "power", "society", "culture", "history", "conflict"]),
});

const libraryUseParamsSchema = z.object({
  libraryId: z.string().trim().min(1),
});

const snapshotRestoreParamsSchema = z.object({
  id: z.string().trim().min(1),
  snapshotId: z.string().trim().min(1),
});

const createWorldSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  worldType: z.string().trim().optional(),
  templateKey: z.string().trim().optional(),
  axioms: z.string().optional(),
  background: z.string().optional(),
  geography: z.string().optional(),
  cultures: z.string().optional(),
  magicSystem: z.string().optional(),
  politics: z.string().optional(),
  races: z.string().optional(),
  religions: z.string().optional(),
  technology: z.string().optional(),
  conflicts: z.string().optional(),
  history: z.string().optional(),
  economy: z.string().optional(),
  factions: z.string().optional(),
  selectedDimensions: z.string().optional(),
  selectedElements: z.string().optional(),
  knowledgeDocumentIds: z.array(z.string().trim().min(1)).optional(),
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
  provider: providerSchema.optional(),
  model: z.string().optional(),
});

const inspirationSchema = z.object({
  input: z.string().max(2_000_000).optional(),
  mode: z.enum(["free", "reference", "random"]).optional(),
  worldType: z.string().optional(),
  knowledgeDocumentIds: z.array(z.string().trim().min(1)).optional(),
  refinementLevel: z.enum(["basic", "standard", "detailed"]).optional(),
  optionsCount: z.number().int().min(4).max(8).optional(),
  provider: providerSchema.optional(),
  model: z.string().optional(),
});

const knowledgeBindingsSchema = z.object({
  documentIds: z.array(z.string().trim().min(1)).default([]),
});

const suggestAxiomsSchema = z.object({
  provider: providerSchema.optional(),
  model: z.string().optional(),
});

const updateAxiomsSchema = z.object({
  axioms: z.array(z.string().trim().min(1)).min(1),
});

const layerGenerateSchema = z.object({
  provider: providerSchema.optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

const layerUpdateSchema = z.object({
  content: z.string().trim().min(1),
});

const deepeningQuestionSchema = z.object({
  provider: providerSchema.optional(),
  model: z.string().optional(),
});

const deepeningAnswerSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().trim().min(1),
      answer: z.string().trim().min(1),
    }),
  ),
});

const consistencyCheckSchema = z.object({
  provider: providerSchema.optional(),
  model: z.string().optional(),
});

const consistencyIssuePatchSchema = z.object({
  status: z.enum(["open", "resolved", "ignored"]),
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
    "history",
    "economy",
    "factions",
  ]),
  currentValue: z.string().trim().min(1),
  refinementLevel: z.enum(["light", "deep"]),
  mode: z.enum(["replace", "alternatives"]).optional(),
  alternativesCount: z.number().int().min(2).max(3).optional(),
  provider: providerSchema.optional(),
  model: z.string().optional(),
});

const libraryListQuerySchema = z.object({
  category: z.string().optional(),
  worldType: z.string().optional(),
  keyword: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const libraryCreateSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  category: z.string().trim().min(1),
  worldType: z.string().optional(),
  sourceWorldId: z.string().optional(),
});

const libraryUseSchema = z.object({
  worldId: z.string().optional(),
  targetField: z.enum([
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
    "history",
    "economy",
    "factions",
  ]).optional(),
});

const snapshotCreateSchema = z.object({
  label: z.string().optional(),
});

const snapshotDiffQuerySchema = z.object({
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
});

const worldExportQuerySchema = z.object({
  format: z.enum(["markdown", "json"]).default("markdown"),
});

const worldImportSchema = z.object({
  format: z.enum(["json", "markdown", "text"]),
  content: z.string().trim().min(1),
  name: z.string().optional(),
  provider: providerSchema.optional(),
  model: z.string().optional(),
});

router.use(authMiddleware);

router.get("/templates", requireWorldWizard, async (_req, res, next) => {
  try {
    const data = await worldService.getTemplates();
    res.status(200).json({
      success: true,
      data,
      message: "Templates loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/inspiration/analyze", requireWorldWizard, validate({ body: inspirationSchema }), async (req, res, next) => {
  try {
    const data = await worldService.analyzeInspiration(req.body as z.infer<typeof inspirationSchema>);
    res.status(200).json({
      success: true,
      data,
      message: "Inspiration analyzed.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/library", requireWorldWizard, validate({ query: libraryListQuerySchema }), async (req, res, next) => {
  try {
    const query = libraryListQuerySchema.parse(req.query);
    const data = await worldService.listLibrary(query);
    res.status(200).json({
      success: true,
      data,
      message: "Library loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/library", requireWorldWizard, validate({ body: libraryCreateSchema }), async (req, res, next) => {
  try {
    const data = await worldService.createLibraryItem(req.body as z.infer<typeof libraryCreateSchema>);
    res.status(201).json({
      success: true,
      data,
      message: "Library item created.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/library/:libraryId/use",
  requireWorldWizard,
  validate({ params: libraryUseParamsSchema, body: libraryUseSchema }),
  async (req, res, next) => {
    try {
      const { libraryId } = req.params as z.infer<typeof libraryUseParamsSchema>;
      const data = await worldService.useLibraryItem(libraryId, req.body as z.infer<typeof libraryUseSchema>);
      res.status(200).json({
        success: true,
        data,
        message: "Library item used.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post("/import", requireWorldWizard, validate({ body: worldImportSchema }), async (req, res, next) => {
  try {
    const data = await worldService.importWorld(req.body as z.infer<typeof worldImportSchema>);
    res.status(201).json({
      success: true,
      data,
      message: "World imported.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/", async (_req, res, next) => {
  try {
    const data = await worldService.listWorlds();
    res.status(200).json({
      success: true,
      data,
      message: "World list loaded.",
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
      message: "World created.",
    } satisfies ApiResponse<typeof data>);
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

router.get("/:id", validate({ params: worldIdSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof worldIdSchema>;
    const data = await worldService.getWorldById(id);
    if (!data) {
      res.status(404).json({
        success: false,
        error: "World not found.",
      } satisfies ApiResponse<null>);
      return;
    }
    res.status(200).json({
      success: true,
      data,
      message: "World loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/knowledge-documents", validate({ params: worldIdSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof worldIdSchema>;
    const data = await knowledgeService.listBindings("world", id);
    res.status(200).json({
      success: true,
      data,
      message: "World knowledge documents loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put(
  "/:id/knowledge-documents",
  validate({ params: worldIdSchema, body: knowledgeBindingsSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof worldIdSchema>;
      const body = req.body as z.infer<typeof knowledgeBindingsSchema>;
      const data = await knowledgeService.replaceBindings("world", id, body.documentIds);
      res.status(200).json({
        success: true,
        data,
        message: "World knowledge documents updated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.put("/:id", validate({ params: worldIdSchema, body: updateWorldSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof worldIdSchema>;
    const data = await worldService.updateWorld(id, req.body as z.infer<typeof updateWorldSchema>);
    res.status(200).json({
      success: true,
      data,
      message: "World updated.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", validate({ params: worldIdSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof worldIdSchema>;
    await worldService.deleteWorld(id);
    res.status(200).json({
      success: true,
      message: "World deleted.",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/axioms/suggest", requireWorldWizard, validate({ params: worldIdSchema, body: suggestAxiomsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof worldIdSchema>;
    const data = await worldService.suggestAxioms(id, req.body as z.infer<typeof suggestAxiomsSchema>);
    res.status(200).json({
      success: true,
      data,
      message: "Axioms suggested.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.put("/:id/axioms", requireWorldWizard, validate({ params: worldIdSchema, body: updateAxiomsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof worldIdSchema>;
    const { axioms } = req.body as z.infer<typeof updateAxiomsSchema>;
    const data = await worldService.updateAxioms(id, axioms);
    res.status(200).json({
      success: true,
      data,
      message: "Axioms updated.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:id/layers/generate-all",
  requireWorldWizard,
  validate({ params: worldIdSchema, body: layerGenerateSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof worldIdSchema>;
      const data = await worldService.generateAllLayers(id, req.body as z.infer<typeof layerGenerateSchema>);
      res.status(200).json({
        success: true,
        data,
        message: "All layers generated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/:id/layers/:layerKey/generate",
  requireWorldWizard,
  validate({ params: layerParamsSchema, body: layerGenerateSchema }),
  async (req, res, next) => {
    try {
      const { id, layerKey } = req.params as z.infer<typeof layerParamsSchema>;
      const data = await worldService.generateLayer(
        id,
        layerKey as WorldLayerKey,
        req.body as z.infer<typeof layerGenerateSchema>,
      );
      res.status(200).json({
        success: true,
        data,
        message: "Layer generated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.put("/:id/layers/:layerKey", requireWorldWizard, validate({ params: layerParamsSchema, body: layerUpdateSchema }), async (req, res, next) => {
  try {
    const { id, layerKey } = req.params as z.infer<typeof layerParamsSchema>;
    const data = await worldService.updateLayer(
      id,
      layerKey as WorldLayerKey,
      req.body as z.infer<typeof layerUpdateSchema>,
    );
    res.status(200).json({
      success: true,
      data,
      message: "Layer updated.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/layers/:layerKey/confirm", requireWorldWizard, validate({ params: layerParamsSchema }), async (req, res, next) => {
  try {
    const { id, layerKey } = req.params as z.infer<typeof layerParamsSchema>;
    const data = await worldService.confirmLayer(id, layerKey as WorldLayerKey);
    res.status(200).json({
      success: true,
      data,
      message: "Layer confirmed.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/deepening/questions", requireWorldWizard, validate({ params: worldIdSchema, body: deepeningQuestionSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof worldIdSchema>;
    const data = await worldService.createDeepeningQuestions(id, req.body as z.infer<typeof deepeningQuestionSchema>);
    res.status(200).json({
      success: true,
      data,
      message: "Deepening questions generated.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/deepening/answers", requireWorldWizard, validate({ params: worldIdSchema, body: deepeningAnswerSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof worldIdSchema>;
    const { answers } = req.body as z.infer<typeof deepeningAnswerSchema>;
    const data = await worldService.answerDeepeningQuestions(id, answers);
    res.status(200).json({
      success: true,
      data,
      message: "Answers integrated.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/consistency/check", requireWorldWizard, validate({ params: worldIdSchema, body: consistencyCheckSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof worldIdSchema>;
    const data = await worldService.checkConsistency(id, req.body as z.infer<typeof consistencyCheckSchema>);
    res.status(200).json({
      success: true,
      data,
      message: "Consistency checked.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/:id/consistency/issues/:issueId",
  requireWorldWizard,
  validate({ params: issueIdSchema, body: consistencyIssuePatchSchema }),
  async (req, res, next) => {
    try {
      const { id, issueId } = req.params as z.infer<typeof issueIdSchema>;
      const { status } = req.body as z.infer<typeof consistencyIssuePatchSchema>;
      const data = await worldService.updateConsistencyIssueStatus(id, issueId, status);
      res.status(200).json({
        success: true,
        data,
        message: "Issue status updated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get("/:id/overview", requireWorldWizard, validate({ params: worldIdSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof worldIdSchema>;
    const data = await worldService.getOverview(id);
    res.status(200).json({
      success: true,
      data,
      message: "Overview loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/visualization", requireWorldWizard, requireWorldVisualization, validate({ params: worldIdSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof worldIdSchema>;
    const data = await worldService.getVisualization(id);
    res.status(200).json({
      success: true,
      data,
      message: "Visualization loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/refine", validate({ params: worldIdSchema, body: worldRefineSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof worldIdSchema>;
    const { stream, onDone } = await worldService.createRefineStream(id, req.body as z.infer<typeof worldRefineSchema>);
    await streamToSSE(res, stream, onDone);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/snapshots", requireWorldWizard, validate({ params: worldIdSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof worldIdSchema>;
    const data = await worldService.listSnapshots(id);
    res.status(200).json({
      success: true,
      data,
      message: "Snapshots loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/snapshots", requireWorldWizard, validate({ params: worldIdSchema, body: snapshotCreateSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof worldIdSchema>;
    const { label } = req.body as z.infer<typeof snapshotCreateSchema>;
    const data = await worldService.createSnapshot(id, label);
    res.status(201).json({
      success: true,
      data,
      message: "Snapshot created.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/snapshots/:snapshotId/restore", requireWorldWizard, validate({ params: snapshotRestoreParamsSchema }), async (req, res, next) => {
  try {
    const { id, snapshotId } = req.params as z.infer<typeof snapshotRestoreParamsSchema>;
    const data = await worldService.restoreSnapshot(id, snapshotId);
    res.status(200).json({
      success: true,
      data,
      message: "Snapshot restored.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/snapshots/diff", requireWorldWizard, validate({ params: worldIdSchema, query: snapshotDiffQuerySchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof worldIdSchema>;
    const { from, to } = snapshotDiffQuerySchema.parse(req.query);
    const data = await worldService.diffSnapshots(id, from, to);
    res.status(200).json({
      success: true,
      data,
      message: "Snapshot diff generated.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/export", requireWorldWizard, validate({ params: worldIdSchema, query: worldExportQuerySchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof worldIdSchema>;
    const { format } = worldExportQuerySchema.parse(req.query);
    const data = await worldService.exportWorld(id, format);
    res.status(200).json({
      success: true,
      data,
      message: "Export payload prepared.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

export default router;
