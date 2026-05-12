import { Router } from "express";
import { z } from "zod";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  DirectorBookAutomationProjectionResponse,
  DirectorCommandAcceptedResponse,
  DirectorManualEditImpactResponse,
  DirectorPolicyMode,
  DirectorRuntimePolicyUpdateRequest,
  DirectorTaskFactInspectionResponse,
  DirectorTaskSnapshotResponse,
  DirectorWorkspaceAnalysisResponse,
} from "@ai-novel/shared/types/directorRuntime";
import {
  DIRECTOR_AUTO_EXECUTION_MODES,
  DIRECTOR_CORRECTION_PRESETS,
  DIRECTOR_RUN_MODES,
  DIRECTOR_TAKEOVER_ENTRY_STEPS,
  DIRECTOR_TAKEOVER_START_PHASES,
  DIRECTOR_TAKEOVER_STRATEGIES,
  type DirectorCandidatePatchRequest,
  type DirectorCandidateTitleRefineRequest,
  type DirectorConfirmRequest,
  type DirectorRefinementRequest,
  type DirectorRunMode,
  type DirectorTakeoverRequest,
} from "@ai-novel/shared/types/novelDirector";
import { DIRECTOR_POLICY_MODES } from "@ai-novel/shared/types/directorRuntime";
import {
  BOOK_FRAMING_COMMERCIAL_TAG_MAX_LENGTH,
  BOOK_FRAMING_MAX_COMMERCIAL_TAGS,
} from "@ai-novel/shared/types/novelFraming";
import { DIRECTOR_AUTO_APPROVAL_POINTS } from "@ai-novel/shared/types/autoDirectorApproval";
import { validate } from "../middleware/validate";
import { llmProviderSchema } from "../llm/providerSchema";
import { DirectorBookAutomationProjectionService } from "../services/novel/director/DirectorBookAutomationProjectionService";
import { DirectorCommandService } from "../services/novel/director/DirectorCommandService";
import { DirectorTaskSnapshotService } from "../services/novel/director/DirectorTaskSnapshotService";
import { NovelDirectorService } from "../services/novel/director/NovelDirectorService";
import { directorPersistedCandidateSchema } from "../services/novel/director/novelDirectorSchemas";

const router = Router();
const commandService = new DirectorCommandService();
const snapshotService = new DirectorTaskSnapshotService();
const novelDirectorService = new NovelDirectorService();
const projectionService = new DirectorBookAutomationProjectionService();

const correctionPresetValues = DIRECTOR_CORRECTION_PRESETS.map((item) => item.value) as [string, ...string[]];
const takeoverStartPhaseValues = [...DIRECTOR_TAKEOVER_START_PHASES] as [string, ...string[]];
const takeoverEntryStepValues = [...DIRECTOR_TAKEOVER_ENTRY_STEPS] as [string, ...string[]];
const takeoverStrategyValues = [...DIRECTOR_TAKEOVER_STRATEGIES] as [string, ...string[]];
const autoExecutionModeValues = [...DIRECTOR_AUTO_EXECUTION_MODES] as [string, ...string[]];
const directorRunModeValues = [...DIRECTOR_RUN_MODES] as [DirectorRunMode, ...DirectorRunMode[]];
const runtimePolicyModeValues = [...DIRECTOR_POLICY_MODES] as [DirectorPolicyMode, ...DirectorPolicyMode[]];
const autoApprovalPointValues = DIRECTOR_AUTO_APPROVAL_POINTS.map((item) => item.code) as [string, ...string[]];

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
  postGenerationStyleReviewEnabled: z.boolean().optional(),
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

const takeoverSchema = z.object({
  novelId: z.string().trim().min(1),
  startPhase: z.enum(takeoverStartPhaseValues).optional(),
  entryStep: z.enum(takeoverEntryStepValues).optional(),
  strategy: z.enum(takeoverStrategyValues).optional(),
  autoExecutionPlan: autoExecutionPlanSchema,
  autoApproval: autoApprovalSchema,
  styleProfileId: z.string().trim().optional(),
  postGenerationStyleReviewEnabled: z.boolean().optional(),
}).merge(llmOptionsSchema);

const runtimePolicySchema = z.object({
  mode: z.enum(runtimePolicyModeValues),
  mayOverwriteUserContent: z.boolean().optional(),
  allowExpensiveReview: z.boolean().optional(),
  modelTier: z.enum(["cheap_fast", "balanced", "high_quality"]).optional(),
});

const taskParamsSchema = z.object({
  taskId: z.string().trim().min(1),
});

const takeoverParamsSchema = z.object({
  novelId: z.string().trim().min(1),
});

const workspaceAnalysisQuerySchema = z.object({
  workflowTaskId: z.string().trim().min(1).optional(),
  ai: z.enum(["true", "false"]).optional(),
});

const manualEditImpactQuerySchema = workspaceAnalysisQuerySchema.extend({
  chapterId: z.string().trim().min(1).optional(),
});

const createTaskSchema = z.discriminatedUnion("taskType", [
  z.object({ taskType: z.literal("generate_candidates"), payload: candidatesSchema }),
  z.object({ taskType: z.literal("takeover"), payload: takeoverSchema }),
  z.object({
    taskType: z.literal("workspace_analysis"),
    payload: z.object({
      novelId: z.string().trim().min(1),
      workflowTaskId: z.string().trim().optional(),
      includeAiInterpretation: z.boolean().optional(),
    }),
  }),
  z.object({
    taskType: z.literal("manual_edit_impact"),
    payload: z.object({
      novelId: z.string().trim().min(1),
      workflowTaskId: z.string().trim().optional(),
      chapterId: z.string().trim().optional(),
      includeAiInterpretation: z.boolean().optional(),
    }),
  }),
]);

const appendCommandSchema = z.discriminatedUnion("commandType", [
  z.object({ commandType: z.literal("refine_candidates"), payload: refineSchema }),
  z.object({ commandType: z.literal("patch_candidate"), payload: patchCandidateSchema }),
  z.object({ commandType: z.literal("refine_titles"), payload: refineTitleSchema }),
  z.object({ commandType: z.literal("confirm_candidate"), payload: confirmSchema }),
  z.object({ commandType: z.literal("continue"), payload: z.object({
    continuationMode: z.enum(["resume", "auto_execute_range"]).optional(),
    batchAlreadyStartedCount: z.number().int().min(0).optional(),
    forceResume: z.boolean().optional(),
  }).optional() }),
  z.object({ commandType: z.literal("resume_from_checkpoint"), payload: z.object({
    continuationMode: z.enum(["resume", "auto_execute_range"]).optional(),
    batchAlreadyStartedCount: z.number().int().min(0).optional(),
    forceResume: z.boolean().optional(),
  }).optional() }),
  z.object({ commandType: z.literal("retry"), payload: z.object({
    provider: llmProviderSchema.optional(),
    model: z.string().trim().optional(),
    temperature: z.number().min(0).max(2).optional(),
    batchAlreadyStartedCount: z.number().int().min(0).optional(),
  }).optional() }),
  z.object({ commandType: z.literal("approve_gate"), payload: z.object({}).optional() }),
  z.object({ commandType: z.literal("policy_update"), payload: runtimePolicySchema }),
  z.object({ commandType: z.literal("cancel"), payload: z.object({}).optional() }),
  z.object({ commandType: z.literal("repair_chapter_titles"), payload: z.object({ volumeId: z.string().trim().optional() }).optional() }),
]);

function accepted<T>(data: T, message: string) {
  return {
    success: true,
    data,
    message,
  } satisfies ApiResponse<T>;
}

router.post("/tasks", validate({ body: createTaskSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createTaskSchema>;
    let data: DirectorCommandAcceptedResponse;
    switch (body.taskType) {
      case "generate_candidates":
        data = await commandService.enqueueGenerateCandidatesCommand(body.payload);
        break;
      case "takeover":
        data = await commandService.enqueueTakeoverCommand(body.payload as DirectorTakeoverRequest);
        break;
      case "workspace_analysis":
        data = await commandService.enqueueWorkspaceAnalysisCommand(body.payload);
        break;
      case "manual_edit_impact":
        data = await commandService.enqueueManualEditImpactCommand(body.payload);
        break;
      default:
        throw new Error("Unsupported director task type.");
    }
    res.status(202).json(accepted(data, "Director task accepted."));
  } catch (error) {
    next(error);
  }
});

router.post("/tasks/:taskId/commands", validate({ params: taskParamsSchema, body: appendCommandSchema }), async (req, res, next) => {
  try {
    const { taskId } = req.params as z.infer<typeof taskParamsSchema>;
    const body = req.body as z.infer<typeof appendCommandSchema>;
    let data: DirectorCommandAcceptedResponse;
    switch (body.commandType) {
      case "refine_candidates":
        data = await commandService.enqueueRefineCandidatesCommand({
          ...body.payload,
          workflowTaskId: taskId,
        } as DirectorRefinementRequest);
        break;
      case "patch_candidate":
        data = await commandService.enqueuePatchCandidateCommand({
          ...body.payload,
          workflowTaskId: taskId,
        } as DirectorCandidatePatchRequest);
        break;
      case "refine_titles":
        data = await commandService.enqueueRefineTitlesCommand({
          ...body.payload,
          workflowTaskId: taskId,
        } as DirectorCandidateTitleRefineRequest);
        break;
      case "confirm_candidate":
        data = await commandService.enqueueConfirmCandidateCommand({
          ...body.payload,
          workflowTaskId: taskId,
        } as DirectorConfirmRequest);
        break;
      case "continue":
        data = await commandService.enqueueContinueCommand(taskId, body.payload ?? {});
        break;
      case "resume_from_checkpoint":
        data = await commandService.enqueueRecoveryCommand(taskId, body.payload ?? {});
        break;
      case "retry":
        data = await commandService.enqueueRetryCommand({
          taskId,
          llmOverride: body.payload?.provider || body.payload?.model || typeof body.payload?.temperature === "number"
            ? {
              provider: body.payload?.provider,
              model: body.payload?.model,
              temperature: body.payload?.temperature,
            }
            : undefined,
          batchAlreadyStartedCount: body.payload?.batchAlreadyStartedCount,
        });
        break;
      case "approve_gate":
        data = await commandService.enqueueApproveGateCommand(taskId);
        break;
      case "policy_update":
        data = await commandService.enqueuePolicyUpdateCommand(taskId, body.payload as DirectorRuntimePolicyUpdateRequest);
        break;
      case "cancel":
        data = await commandService.enqueueCancelCommand(taskId);
        break;
      case "repair_chapter_titles":
        data = await commandService.enqueueChapterTitleRepairCommand(taskId, body.payload ?? {});
        break;
      default:
        throw new Error("Unsupported director command type.");
    }
    res.status(202).json(accepted(data, "Director command accepted."));
  } catch (error) {
    next(error);
  }
});

router.get("/tasks/:taskId", validate({ params: taskParamsSchema }), async (req, res, next) => {
  try {
    const { taskId } = req.params as z.infer<typeof taskParamsSchema>;
    const data = await snapshotService.getTaskSnapshot(taskId) as DirectorTaskSnapshotResponse;
    res.status(200).json(accepted(data, "Director task snapshot loaded."));
  } catch (error) {
    next(error);
  }
});

router.get("/tasks/:taskId/fact-inspection", validate({ params: taskParamsSchema }), async (req, res, next) => {
  try {
    const { taskId } = req.params as z.infer<typeof taskParamsSchema>;
    const data = await snapshotService.getTaskFactInspection(taskId) as DirectorTaskFactInspectionResponse;
    res.status(200).json(accepted(data, "Director fact inspection loaded."));
  } catch (error) {
    next(error);
  }
});

router.get("/novels/:novelId/fact-inspection", validate({ params: takeoverParamsSchema }), async (req, res, next) => {
  try {
    const { novelId } = req.params as z.infer<typeof takeoverParamsSchema>;
    const data = await snapshotService.getNovelFactInspection(novelId) as DirectorTaskFactInspectionResponse;
    res.status(200).json(accepted(data, "Director novel fact inspection loaded."));
  } catch (error) {
    next(error);
  }
});

router.get("/commands/:commandId/result", validate({ params: z.object({ commandId: z.string().trim().min(1) }) }), async (req, res, next) => {
  try {
    const data = await commandService.getCommandResult((req.params as { commandId: string }).commandId);
    res.status(200).json(accepted(data, "Director command result loaded."));
  } catch (error) {
    next(error);
  }
});

router.get("/takeover-readiness/:novelId", validate({ params: takeoverParamsSchema }), async (req, res, next) => {
  try {
    const { novelId } = req.params as z.infer<typeof takeoverParamsSchema>;
    const data = await novelDirectorService.getTakeoverReadiness(novelId);
    res.status(200).json(accepted(data, "Director takeover readiness loaded."));
  } catch (error) {
    next(error);
  }
});

router.get("/book-automation/:novelId", validate({ params: takeoverParamsSchema }), async (req, res, next) => {
  try {
    const { novelId } = req.params as z.infer<typeof takeoverParamsSchema>;
    const projection = await projectionService.getProjection(novelId);
    const data: DirectorBookAutomationProjectionResponse = { projection };
    res.status(200).json(accepted(data, "Director book automation projection loaded."));
  } catch (error) {
    next(error);
  }
});

router.get("/workspace-analysis/:novelId", validate({ params: takeoverParamsSchema, query: workspaceAnalysisQuerySchema }), async (req, res, next) => {
  try {
    const { novelId } = req.params as z.infer<typeof takeoverParamsSchema>;
    const query = req.query as z.infer<typeof workspaceAnalysisQuerySchema>;
    const analysis = await novelDirectorService.analyzeRuntimeWorkspace(novelId, {
      workflowTaskId: query.workflowTaskId,
      includeAiInterpretation: query.ai === "true",
    });
    const data: DirectorWorkspaceAnalysisResponse = { analysis };
    res.status(200).json(accepted(data, "Director workspace analysis loaded."));
  } catch (error) {
    next(error);
  }
});

router.get("/manual-edit-impact/:novelId", validate({ params: takeoverParamsSchema, query: manualEditImpactQuerySchema }), async (req, res, next) => {
  try {
    const { novelId } = req.params as z.infer<typeof takeoverParamsSchema>;
    const query = req.query as z.infer<typeof manualEditImpactQuerySchema>;
    const impact = await novelDirectorService.evaluateManualEditImpact(novelId, {
      workflowTaskId: query.workflowTaskId,
      chapterId: query.chapterId,
      includeAiInterpretation: query.ai !== "false",
    });
    const data: DirectorManualEditImpactResponse = { impact };
    res.status(200).json(accepted(data, "Director manual edit impact loaded."));
  } catch (error) {
    next(error);
  }
});

export default router;
