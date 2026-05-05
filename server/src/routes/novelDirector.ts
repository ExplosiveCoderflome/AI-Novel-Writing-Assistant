import { Router } from "express";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import {
  DIRECTOR_POLICY_MODES,
  type DirectorPolicyMode,
  type DirectorBookAutomationProjectionResponse,
  type DirectorRuntimePolicyUpdateRequest,
  type DirectorRuntimePolicyUpdateResponse,
  type DirectorCommandResultResponse,
  type DirectorRuntimeEventHistoryResponse,
  type DirectorRuntimeSnapshotResponse,
  type DirectorManualEditImpactResponse,
  type DirectorWorkspaceAnalysisResponse,
} from "@ai-novel/shared/types/directorRuntime";
import {
  DIRECTOR_CORRECTION_PRESETS,
  DIRECTOR_AUTO_EXECUTION_MODES,
  DIRECTOR_RUN_MODES,
  DIRECTOR_TAKEOVER_ENTRY_STEPS,
  type DirectorCandidatePatchRequest,
  type DirectorCandidateTitleRefineRequest,
  type DirectorConfirmRequest,
  type DirectorRefinementRequest,
  DIRECTOR_TAKEOVER_STRATEGIES,
  DIRECTOR_TAKEOVER_START_PHASES,
  type DirectorRunMode,
  type DirectorTakeoverRequest,
} from "@ai-novel/shared/types/novelDirector";
import {
  BOOK_FRAMING_COMMERCIAL_TAG_MAX_LENGTH,
  BOOK_FRAMING_MAX_COMMERCIAL_TAGS,
} from "@ai-novel/shared/types/novelFraming";
import { DIRECTOR_AUTO_APPROVAL_POINTS } from "@ai-novel/shared/types/autoDirectorApproval";
import { validate } from "../middleware/validate";
import { llmProviderSchema } from "../llm/providerSchema";
import { NovelDirectorService } from "../services/novel/director/NovelDirectorService";
import { DirectorCommandService } from "../services/novel/director/DirectorCommandService";
import { DirectorBookAutomationProjectionService } from "../services/novel/director/DirectorBookAutomationProjectionService";
import { directorPersistedCandidateSchema } from "../services/novel/director/novelDirectorSchemas";
import { loadPersistentDirectorRuntimeEventHistory } from "../services/novel/director/novelDirectorRuntimeProjection";

const router = Router();
const novelDirectorService = new NovelDirectorService();
const directorCommandService = new DirectorCommandService();
const directorBookAutomationProjectionService = new DirectorBookAutomationProjectionService();

const correctionPresetValues = DIRECTOR_CORRECTION_PRESETS.map((item) => item.value) as [string, ...string[]];
const takeoverStartPhaseValues = [...DIRECTOR_TAKEOVER_START_PHASES] as [string, ...string[]];
const takeoverEntryStepValues = [...DIRECTOR_TAKEOVER_ENTRY_STEPS] as [string, ...string[]];
const takeoverStrategyValues = [...DIRECTOR_TAKEOVER_STRATEGIES] as [string, ...string[]];
const autoExecutionModeValues = [...DIRECTOR_AUTO_EXECUTION_MODES] as [string, ...string[]];
const directorRunModeValues = [...DIRECTOR_RUN_MODES] as [DirectorRunMode, ...DirectorRunMode[]];
const runtimePolicyModeValues = [...DIRECTOR_POLICY_MODES] as [DirectorPolicyMode, ...DirectorPolicyMode[]];

const llmOptionsSchema = z.object({
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
  runMode: z.enum(directorRunModeValues).optional(),
});

const autoExecutionPlanSchema = z.object({
  mode: z.enum(autoExecutionModeValues),
  startOrder: z.number().int().min(1).optional(),
  endOrder: z.number().int().min(1).optional(),
  volumeOrder: z.number().int().min(1).optional(),
  autoReview: z.boolean().optional(),
  autoRepair: z.boolean().optional(),
}).optional();

const autoApprovalPointValues = DIRECTOR_AUTO_APPROVAL_POINTS.map((item) => item.code) as [string, ...string[]];

const autoApprovalSchema = z.object({
  enabled: z.boolean(),
  approvalPointCodes: z.array(z.enum(autoApprovalPointValues)),
}).optional();

const projectContextSchema = z.object({
  title: z.string().trim().optional(),
  description: z.string().trim().optional(),
  targetAudience: z.string().trim().optional(),
  bookSellingPoint: z.string().trim().optional(),
  competingFeel: z.string().trim().optional(),
  first30ChapterPromise: z.string().trim().optional(),
  commercialTags: z.array(z.string().trim().min(1).max(BOOK_FRAMING_COMMERCIAL_TAG_MAX_LENGTH))
    .max(BOOK_FRAMING_MAX_COMMERCIAL_TAGS)
    .optional(),
  genreId: z.string().trim().optional(),
  primaryStoryModeId: z.string().trim().optional(),
  secondaryStoryModeId: z.string().trim().optional(),
  worldId: z.string().trim().optional(),
  writingMode: z.enum(["original", "continuation"]).optional(),
  projectMode: z.enum(["ai_led", "co_pilot", "draft_mode", "auto_pipeline"]).optional(),
  narrativePov: z.enum(["first_person", "third_person", "mixed"]).optional(),
  pacePreference: z.enum(["slow", "balanced", "fast"]).optional(),
  styleTone: z.string().trim().optional(),
  styleProfileId: z.string().trim().optional(),
  emotionIntensity: z.enum(["low", "medium", "high"]).optional(),
  aiFreedom: z.enum(["low", "medium", "high"]).optional(),
  defaultChapterLength: z.number().int().min(500).max(10000).optional(),
  estimatedChapterCount: z.number().int().min(1).max(2000).optional(),
  projectStatus: z.enum(["not_started", "in_progress", "completed", "rework", "blocked"]).optional(),
  storylineStatus: z.enum(["not_started", "in_progress", "completed", "rework", "blocked"]).optional(),
  outlineStatus: z.enum(["not_started", "in_progress", "completed", "rework", "blocked"]).optional(),
  resourceReadyScore: z.number().int().min(0).max(100).optional(),
  sourceNovelId: z.string().trim().optional(),
  sourceKnowledgeDocumentId: z.string().trim().optional(),
  continuationBookAnalysisId: z.string().trim().optional(),
  continuationBookAnalysisSections: z.array(z.enum([
    "overview",
    "plot_structure",
    "timeline",
    "character_system",
    "worldbuilding",
    "themes",
    "style_technique",
    "market_highlights",
  ])).min(1).max(8).optional(),
});

const candidatesSchema = projectContextSchema.extend({
  idea: z.string().trim().min(1),
  workflowTaskId: z.string().trim().optional(),
}).merge(llmOptionsSchema);

const candidateBatchSchema = z.object({
  id: z.string().trim().min(1),
  round: z.number().int().min(1),
  roundLabel: z.string().trim().min(1),
  idea: z.string().trim().min(1),
  refinementSummary: z.string().trim().nullable().optional(),
  presets: z.array(z.enum(correctionPresetValues)).default([]),
  candidates: z.array(directorPersistedCandidateSchema).min(1),
  createdAt: z.string().trim().min(1),
});

const refineSchema = projectContextSchema.extend({
  idea: z.string().trim().min(1),
  previousBatches: z.array(candidateBatchSchema).min(1),
  presets: z.array(z.enum(correctionPresetValues)).default([]),
  feedback: z.string().trim().max(500).optional(),
  workflowTaskId: z.string().trim().optional(),
}).merge(llmOptionsSchema);

const patchCandidateSchema = projectContextSchema.extend({
  idea: z.string().trim().min(1),
  previousBatches: z.array(candidateBatchSchema).min(1),
  batchId: z.string().trim().min(1),
  candidateId: z.string().trim().min(1),
  presets: z.array(z.enum(correctionPresetValues)).default([]),
  feedback: z.string().trim().min(1).max(500),
  workflowTaskId: z.string().trim().optional(),
}).merge(llmOptionsSchema);

const refineTitleSchema = projectContextSchema.extend({
  idea: z.string().trim().min(1),
  previousBatches: z.array(candidateBatchSchema).min(1),
  batchId: z.string().trim().min(1),
  candidateId: z.string().trim().min(1),
  feedback: z.string().trim().min(1).max(500),
  workflowTaskId: z.string().trim().optional(),
}).merge(llmOptionsSchema);

const confirmSchema = projectContextSchema.extend({
  idea: z.string().trim().min(1),
  batchId: z.string().trim().optional(),
  round: z.number().int().min(1).optional(),
  candidate: directorPersistedCandidateSchema,
  workflowTaskId: z.string().trim().optional(),
  autoExecutionPlan: autoExecutionPlanSchema,
  autoApproval: autoApprovalSchema,
}).merge(llmOptionsSchema);

const takeoverParamsSchema = z.object({
  novelId: z.string().trim().min(1),
});

const runtimeTaskParamsSchema = z.object({
  taskId: z.string().trim().min(1),
});

const runtimeEventHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const workspaceAnalysisQuerySchema = z.object({
  workflowTaskId: z.string().trim().min(1).optional(),
  ai: z.enum(["true", "false"]).optional(),
});

const manualEditImpactQuerySchema = workspaceAnalysisQuerySchema.extend({
  chapterId: z.string().trim().min(1).optional(),
});

const runtimePolicySchema = z.object({
  mode: z.enum(runtimePolicyModeValues),
  mayOverwriteUserContent: z.boolean().optional(),
  allowExpensiveReview: z.boolean().optional(),
  modelTier: z.enum(["cheap_fast", "balanced", "high_quality"]).optional(),
});

const runtimeContinueSchema = z.object({
  mode: z.enum(runtimePolicyModeValues).optional(),
  mayOverwriteUserContent: z.boolean().optional(),
  allowExpensiveReview: z.boolean().optional(),
  modelTier: z.enum(["cheap_fast", "balanced", "high_quality"]).optional(),
  continuationMode: z.enum(["resume", "auto_execute_range", "auto_execute_front10"]).optional(),
  batchAlreadyStartedCount: z.number().int().min(0).optional(),
}).optional();
type RuntimeContinueBody = Exclude<z.infer<typeof runtimeContinueSchema>, undefined>;

const takeoverSchema = z.object({
  novelId: z.string().trim().min(1),
  startPhase: z.enum(takeoverStartPhaseValues).optional(),
  entryStep: z.enum(takeoverEntryStepValues).optional(),
  strategy: z.enum(takeoverStrategyValues).optional(),
  autoExecutionPlan: autoExecutionPlanSchema,
  autoApproval: autoApprovalSchema,
  styleProfileId: z.string().trim().optional(),
}).merge(llmOptionsSchema);

router.post("/candidates", validate({ body: candidatesSchema }), async (req, res, next) => {
  try {
    const data = await directorCommandService.enqueueGenerateCandidatesCommand(req.body as z.infer<typeof candidatesSchema>);
    res.status(202).json({
      success: true,
      data,
      message: "Director candidate generation accepted.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/refine", validate({ body: refineSchema }), async (req, res, next) => {
  try {
    const data = await directorCommandService.enqueueRefineCandidatesCommand(req.body as DirectorRefinementRequest);
    res.status(202).json({
      success: true,
      data,
      message: "Director candidate refinement accepted.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/patch-candidate", validate({ body: patchCandidateSchema }), async (req, res, next) => {
  try {
    const data = await directorCommandService.enqueuePatchCandidateCommand(req.body as DirectorCandidatePatchRequest);
    res.status(202).json({
      success: true,
      data,
      message: "Director candidate patch accepted.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/refine-titles", validate({ body: refineTitleSchema }), async (req, res, next) => {
  try {
    const data = await directorCommandService.enqueueRefineTitlesCommand(req.body as DirectorCandidateTitleRefineRequest);
    res.status(202).json({
      success: true,
      data,
      message: "Director title refinement accepted.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/commands/:commandId/result", validate({ params: z.object({ commandId: z.string().trim().min(1) }) }), async (req, res, next) => {
  try {
    const data = await directorCommandService.getCommandResult((req.params as { commandId: string }).commandId) as DirectorCommandResultResponse;
    res.status(200).json({
      success: true,
      data,
      message: "Director command result loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/confirm", validate({ body: confirmSchema }), async (req, res, next) => {
  try {
    const data = await directorCommandService.enqueueConfirmCandidateCommand(req.body as DirectorConfirmRequest);
    res.status(202).json({
      success: true,
      data,
      message: "Director candidate confirmation accepted.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/takeover-readiness/:novelId", validate({ params: takeoverParamsSchema }), async (req, res, next) => {
  try {
    const { novelId } = req.params as z.infer<typeof takeoverParamsSchema>;
    const data = await novelDirectorService.getTakeoverReadiness(novelId);
    res.status(200).json({
      success: true,
      data,
      message: "Director takeover readiness loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/book-automation/:novelId", validate({ params: takeoverParamsSchema }), async (req, res, next) => {
  try {
    const { novelId } = req.params as z.infer<typeof takeoverParamsSchema>;
    const projection = await directorBookAutomationProjectionService.getProjection(novelId);
    const data: DirectorBookAutomationProjectionResponse = { projection };
    res.status(200).json({
      success: true,
      data,
      message: "Director book automation projection loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get(
  "/workspace-analysis/:novelId",
  validate({ params: takeoverParamsSchema, query: workspaceAnalysisQuerySchema }),
  async (req, res, next) => {
    try {
      const { novelId } = req.params as z.infer<typeof takeoverParamsSchema>;
      const query = req.query as z.infer<typeof workspaceAnalysisQuerySchema>;
      if (query.ai === "true") {
        const data = await directorCommandService.enqueueWorkspaceAnalysisCommand({
          novelId,
          workflowTaskId: query.workflowTaskId,
          includeAiInterpretation: true,
        });
        res.status(202).json({
          success: true,
          data,
          message: "Director workspace analysis accepted.",
        } satisfies ApiResponse<typeof data>);
        return;
      }
      const analysis = await novelDirectorService.analyzeRuntimeWorkspace(novelId, {
        workflowTaskId: query.workflowTaskId,
        includeAiInterpretation: false,
      });
      const data: DirectorWorkspaceAnalysisResponse = { analysis };
      res.status(200).json({
        success: true,
        data,
        message: "Director workspace analysis loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/manual-edit-impact/:novelId",
  validate({ params: takeoverParamsSchema, query: manualEditImpactQuerySchema }),
  async (req, res, next) => {
    try {
      const { novelId } = req.params as z.infer<typeof takeoverParamsSchema>;
      const query = req.query as z.infer<typeof manualEditImpactQuerySchema>;
      if (query.ai !== "false") {
        const data = await directorCommandService.enqueueManualEditImpactCommand({
          novelId,
          workflowTaskId: query.workflowTaskId,
          chapterId: query.chapterId,
          includeAiInterpretation: true,
        });
        res.status(202).json({
          success: true,
          data,
          message: "Director manual edit impact analysis accepted.",
        } satisfies ApiResponse<typeof data>);
        return;
      }
      const impact = await novelDirectorService.evaluateManualEditImpact(novelId, {
        workflowTaskId: query.workflowTaskId,
        chapterId: query.chapterId,
        includeAiInterpretation: false,
      });
      const data: DirectorManualEditImpactResponse = { impact };
      res.status(200).json({
        success: true,
        data,
        message: "Director manual edit impact loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get("/runtime/:taskId", validate({ params: runtimeTaskParamsSchema }), async (req, res, next) => {
  try {
    const { taskId } = req.params as z.infer<typeof runtimeTaskParamsSchema>;
    const snapshot = await novelDirectorService.getRuntimeSnapshot(taskId);
    const projection = novelDirectorService.buildRuntimeProjection(snapshot);
    const data: DirectorRuntimeSnapshotResponse = { snapshot, projection };
    res.status(200).json({
      success: true,
      data,
      message: "Director runtime snapshot loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/runtime/:taskId/projection", validate({ params: runtimeTaskParamsSchema }), async (req, res, next) => {
  try {
    const { taskId } = req.params as z.infer<typeof runtimeTaskParamsSchema>;
    const projection = await novelDirectorService.getRuntimeProjection(taskId);
    const data = { projection };
    res.status(200).json({
      success: true,
      data,
      message: "Director runtime projection loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get(
  "/runtime/:taskId/events",
  validate({ params: runtimeTaskParamsSchema, query: runtimeEventHistoryQuerySchema }),
  async (req, res, next) => {
    try {
      const { taskId } = req.params as z.infer<typeof runtimeTaskParamsSchema>;
      const query = req.query as z.infer<typeof runtimeEventHistoryQuerySchema>;
      const data: DirectorRuntimeEventHistoryResponse = await loadPersistentDirectorRuntimeEventHistory(taskId, query.limit);
      res.status(200).json({
        success: true,
        data,
        message: "Director runtime event history loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/runtime/:taskId/policy",
  validate({ params: runtimeTaskParamsSchema, body: runtimePolicySchema }),
  async (req, res, next) => {
    try {
      const { taskId } = req.params as z.infer<typeof runtimeTaskParamsSchema>;
      const body = req.body as DirectorRuntimePolicyUpdateRequest;
      const data = await directorCommandService.enqueuePolicyUpdateCommand(taskId, body);
      res.status(202).json({
        success: true,
        data,
        message: "Director runtime policy update accepted.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/runtime/:taskId/continue",
  validate({ params: runtimeTaskParamsSchema, body: runtimeContinueSchema }),
  async (req, res, next) => {
    try {
      const { taskId } = req.params as z.infer<typeof runtimeTaskParamsSchema>;
      const body = (req.body ?? {}) as RuntimeContinueBody;
      if (body.mode) {
        await novelDirectorService.updateRuntimePolicy(taskId, {
          mode: body.mode,
          patch: {
            mayOverwriteUserContent: body.mayOverwriteUserContent,
            allowExpensiveReview: body.allowExpensiveReview,
            modelTier: body.modelTier,
          },
        });
      }
      const enqueue = body.continuationMode === "resume"
        ? directorCommandService.enqueueApproveGateCommand.bind(directorCommandService)
        : directorCommandService.enqueueContinueCommand.bind(directorCommandService);
      const data = await enqueue(taskId, {
        continuationMode: body.continuationMode,
        batchAlreadyStartedCount: body.batchAlreadyStartedCount,
      });
      res.status(202).json({
        success: true,
        data,
        message: "Director runtime continue accepted.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post("/takeover", validate({ body: takeoverSchema }), async (req, res, next) => {
  try {
    const data = await directorCommandService.enqueueTakeoverCommand(req.body as DirectorTakeoverRequest);
    res.status(202).json({
      success: true,
      data,
      message: "Director takeover accepted.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

export default router;
