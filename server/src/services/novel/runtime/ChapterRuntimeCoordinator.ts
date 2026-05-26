import type { BaseMessageChunk } from "@langchain/core/messages";
import type { StreamDoneHelpers, StreamDonePayload } from "../../../llm/streaming";
import type { QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import { prisma } from "../../../db/prisma";
import { auditService } from "../../audit/AuditService";
import { plannerService } from "../../planner/PlannerService";
import { ChapterWritingGraph } from "../chapterWritingGraph";
import { ChapterArtifactSyncService } from "./ChapterArtifactSyncService";
import { GenerationContextAssembler } from "./GenerationContextAssembler";
import { ChapterAcceptanceAssessmentService } from "./ChapterAcceptanceAssessmentService";
import { ChapterRuntimeReadinessService } from "./ChapterRuntimeReadinessService";
import { chapterRuntimeRequestSchema, type ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";
import type {
  PipelineRuntimeHooks,
  PipelineRuntimeInput,
  PipelineRuntimeResult,
} from "./chapterRuntimePipeline";
import type { RepairOptions, ReviewOptions } from "../novelCoreShared";
import { ChapterRepairStreamRuntime } from "./repair/ChapterRepairStreamRuntime";
import {
  chapterTimelineFinalizationService,
  type ChapterTimelineFinalizationService,
} from "./ChapterTimelineFinalizationService";
import { ChapterQualityGateService } from "./ChapterQualityGateService";
import { ChapterContentFinalizationService } from "./ChapterContentFinalizationService";
import { ChapterStreamGenerationOrchestrator } from "./ChapterStreamGenerationOrchestrator";
import { ChapterPipelineRuntimeAdapter } from "./ChapterPipelineRuntimeAdapter";

interface AgentRuntimeLike {
  createChapterGenRun: (novelId: string, chapterId: string, chapterOrder: number) => Promise<string>;
  finishChapterGenRun: (runId: string, summary: string, durationMs: number) => Promise<void>;
}

interface ChapterRuntimeCoordinatorDeps {
  assembler?: Pick<GenerationContextAssembler, "assemble">;
  chapterWritingGraph?: Pick<ChapterWritingGraph, "createChapterStream">;
  artifactSyncService?: Pick<ChapterArtifactSyncService, "saveDraftAndArtifacts" | "syncChapterArtifacts">;
  auditService?: Pick<typeof auditService, "auditChapter" | "assessChapterAuditNeed">;
  plannerService?: Pick<typeof plannerService, "buildReplanRecommendation" | "shouldTriggerReplanFromAudit">;
  acceptanceAssessmentService?: Pick<ChapterAcceptanceAssessmentService, "assess">;
  readinessService?: Pick<ChapterRuntimeReadinessService, "assertReady">;
  agentRuntime?: AgentRuntimeLike;
  ensureNovelCharacters?: (novelId: string, actionName: string, minCount?: number) => Promise<void>;
  ensureChapterExecutionContract?: (
    novelId: string,
    chapterId: string,
    options: ChapterRuntimeRequestInput,
  ) => Promise<unknown>;
  validateRequest?: (input: ChapterRuntimeRequestInput) => ChapterRuntimeRequestInput;
  reviewChapterAfterRepair?: (
    novelId: string,
    chapterId: string,
    options: ReviewOptions,
  ) => Promise<{ score: QualityScore; issues: ReviewIssue[] }>;
  resolveAuditIssues?: (novelId: string, issueIds: string[]) => Promise<unknown>;
  timelineFinalizer?: Pick<
    ChapterTimelineFinalizationService,
    "finalizeCurrentContent" | "ensurePreviousChapterFinalized"
  >;
}

export class ChapterRuntimeCoordinator {
  private readonly repairStreamRuntime: ChapterRepairStreamRuntime;
  private readonly qualityGateService: ChapterQualityGateService;
  private readonly contentFinalizationService: ChapterContentFinalizationService;
  private readonly streamOrchestrator: ChapterStreamGenerationOrchestrator;
  private readonly pipelineAdapter: ChapterPipelineRuntimeAdapter;

  constructor(deps: ChapterRuntimeCoordinatorDeps = {}) {
    const artifactSyncService = deps.artifactSyncService ?? new ChapterArtifactSyncService();
    const timelineFinalizer = deps.timelineFinalizer ?? chapterTimelineFinalizationService;
    const agentRuntime = this.getAgentRuntime(deps.agentRuntime);
    const assembler = deps.assembler ?? new GenerationContextAssembler();
    const chapterWritingGraph = deps.chapterWritingGraph ?? this.createDefaultChapterWritingGraph(artifactSyncService);
    const plannerRuntime = deps.plannerService ?? plannerService;
    const acceptanceAssessmentService = deps.acceptanceAssessmentService ?? new ChapterAcceptanceAssessmentService();
    const reviewChapterAfterRepair = deps.reviewChapterAfterRepair
      ?? ((novelId: string, chapterId: string, options: ReviewOptions) =>
        (new (require("../novelCoreReviewService").NovelCoreReviewService)()).reviewChapter(novelId, chapterId, options));
    const ensureNovelCharacters = deps.ensureNovelCharacters ?? this.ensureNovelCharacters.bind(this);
    const validateRequest = deps.validateRequest ?? ((input) => chapterRuntimeRequestSchema.parse(input));

    this.qualityGateService = new ChapterQualityGateService({
      acceptanceAssessmentService,
      agentRuntime,
    });
    this.contentFinalizationService = new ChapterContentFinalizationService({
      qualityGateService: this.qualityGateService,
      artifactSyncService,
      plannerService: plannerRuntime,
      timelineFinalizer,
      agentRuntime,
    });
    this.streamOrchestrator = new ChapterStreamGenerationOrchestrator({
      assembler,
      chapterWritingGraph,
      readinessService: deps.readinessService ?? new ChapterRuntimeReadinessService(),
      timelineFinalizer,
      contentFinalizationService: this.contentFinalizationService,
      agentRuntime,
      validateRequest,
      ensureNovelCharacters,
    });
    this.pipelineAdapter = new ChapterPipelineRuntimeAdapter({
      streamOrchestrator: this.streamOrchestrator,
      artifactSyncService,
      contentFinalizationService: this.contentFinalizationService,
      timelineFinalizer,
      ensureNovelCharacters,
    });
    this.repairStreamRuntime = new ChapterRepairStreamRuntime({
      assembler,
      artifactSyncService,
      reviewChapterAfterRepair,
      resolveAuditIssues: deps.resolveAuditIssues,
      timelineFinalizer,
    });
  }

  async createChapterStream(
    novelId: string,
    chapterId: string,
    options: ChapterRuntimeRequestInput = {},
    config: { includeRuntimePackage: boolean } = { includeRuntimePackage: false },
  ): Promise<{
    stream: AsyncIterable<BaseMessageChunk>;
    onDone: (fullContent: string, helpers: StreamDoneHelpers) => Promise<void | StreamDonePayload>;
  }> {
    return this.streamOrchestrator.createChapterStream(novelId, chapterId, options, config);
  }

  async createRepairStream(
    novelId: string,
    chapterId: string,
    options: RepairOptions = {},
  ): Promise<{
    stream: AsyncIterable<BaseMessageChunk>;
    onDone: (fullContent: string, helpers: StreamDoneHelpers) => Promise<void>;
  }> {
    return this.repairStreamRuntime.createRepairStream(novelId, chapterId, options);
  }

  async runPipelineChapter(
    novelId: string,
    chapterId: string,
    options: PipelineRuntimeInput = {},
    hooks: PipelineRuntimeHooks = {},
  ): Promise<PipelineRuntimeResult> {
    return this.pipelineAdapter.runPipelineChapter(novelId, chapterId, options, hooks);
  }

  private getAgentRuntime(agentRuntime?: AgentRuntimeLike): AgentRuntimeLike {
    return (agentRuntime ?? require("../../../agents").agentRuntime) as AgentRuntimeLike;
  }

  private createDefaultChapterWritingGraph(
    artifactSyncService: Pick<ChapterArtifactSyncService, "saveDraftAndArtifacts">,
  ): Pick<ChapterWritingGraph, "createChapterStream"> {
    return new ChapterWritingGraph({
      enforceOpeningDiversity: async (_novelId, _chapterOrder, _chapterTitle, content) => ({
        content,
        rewritten: false,
        maxSimilarity: 0,
      }),
      saveDraftAndArtifacts: (...args) => artifactSyncService.saveDraftAndArtifacts(...args),
      logInfo: (message, meta) => {
        if (meta) {
          console.info(`[chapter-runtime] ${message}`, meta);
          return;
        }
        console.info(`[chapter-runtime] ${message}`);
      },
      logWarn: (message, meta) => {
        if (meta) {
          console.warn(`[chapter-runtime] ${message}`, meta);
          return;
        }
        console.warn(`[chapter-runtime] ${message}`);
      },
    });
  }

  private async ensureNovelCharacters(novelId: string, actionName: string, minCount = 1): Promise<void> {
    const count = await prisma.character.count({ where: { novelId } });
    if (count < minCount) {
      throw new Error(`请先在本小说中至少添加 ${minCount} 个角色后再${actionName}。`);
    }
  }
}
