import type { BaseMessageChunk } from "@langchain/core/messages";
import type { StreamDoneHelpers, StreamDonePayload } from "../../../llm/streaming";
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
import type { RepairOptions } from "../novelCoreShared";
import { ChapterRepairStreamRuntime } from "./repair/ChapterRepairStreamRuntime";
import { ChapterQualityGateService } from "./ChapterQualityGateService";
import { ChapterContentFinalizationService } from "./ChapterContentFinalizationService";
import { ChapterStreamGenerationOrchestrator } from "./ChapterStreamGenerationOrchestrator";
import { ChapterPipelineRuntimeAdapter } from "./ChapterPipelineRuntimeAdapter";
import {
  chapterTimelineFinalizationService,
  type ChapterTimelineFinalizationService,
} from "./ChapterTimelineFinalizationService";
import {
  chapterLifecycleService,
  type ChapterLifecycleService,
} from "./lifecycle";
import {
  defaultChapterRuntimeAgent,
  type ChapterRuntimeAgentPort,
} from "./ChapterRuntimeDefaultDeps";

interface ChapterRuntimeCoordinatorDeps {
  assembler?: Pick<GenerationContextAssembler, "assemble">;
  chapterWritingGraph?: Pick<ChapterWritingGraph, "createChapterStream">;
  artifactSyncService?: Pick<ChapterArtifactSyncService, "saveDraftAndArtifacts" | "syncChapterArtifacts">;
  auditService?: Pick<typeof auditService, "auditChapter">;
  plannerService?: Pick<typeof plannerService, "buildReplanRecommendation" | "shouldTriggerReplanFromAudit">;
  acceptanceAssessmentService?: Pick<ChapterAcceptanceAssessmentService, "assess">;
  readinessService?: Pick<ChapterRuntimeReadinessService, "assertReady">;
  agentRuntime?: ChapterRuntimeAgentPort;
  ensureNovelCharacters?: (novelId: string, actionName: string, minCount?: number) => Promise<void>;
  ensureChapterExecutionContract?: (
    novelId: string,
    chapterId: string,
    options: ChapterRuntimeRequestInput,
  ) => Promise<unknown>;
  validateRequest?: (input: ChapterRuntimeRequestInput) => ChapterRuntimeRequestInput;
  resolveAuditIssues?: (novelId: string, issueIds: string[]) => Promise<unknown>;
  timelineFinalizer?: Pick<ChapterTimelineFinalizationService, "finalizeCurrentContent">;
  lifecycleService?: Pick<
    ChapterLifecycleService,
    "saveWorkingContent" | "markChapterStatus" | "markGenerationState"
  >;
}

export class ChapterRuntimeCoordinator {
  private readonly repairStreamRuntime: ChapterRepairStreamRuntime;
  private readonly qualityGateService: ChapterQualityGateService;
  private readonly contentFinalizationService: ChapterContentFinalizationService;
  private readonly streamOrchestrator: ChapterStreamGenerationOrchestrator;
  private readonly pipelineAdapter: ChapterPipelineRuntimeAdapter;

  constructor(deps: ChapterRuntimeCoordinatorDeps = {}) {
    const lifecycleService = deps.lifecycleService ?? chapterLifecycleService;
    const artifactSyncService = deps.artifactSyncService ?? new ChapterArtifactSyncService(lifecycleService);
    const agentRuntime = this.getAgentRuntime(deps.agentRuntime);
    const assembler = deps.assembler ?? new GenerationContextAssembler();
    const chapterWritingGraph = deps.chapterWritingGraph ?? this.createDefaultChapterWritingGraph(artifactSyncService);
    const plannerRuntime = deps.plannerService ?? plannerService;
    const chapterAuditService = deps.auditService ?? auditService;
    const acceptanceAssessmentService = deps.acceptanceAssessmentService ?? new ChapterAcceptanceAssessmentService();
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
      agentRuntime,
      timelineFinalizer: deps.timelineFinalizer ?? chapterTimelineFinalizationService,
      lifecycleService,
    });
    this.streamOrchestrator = new ChapterStreamGenerationOrchestrator({
      assembler,
      chapterWritingGraph,
      readinessService: deps.readinessService ?? new ChapterRuntimeReadinessService(),
      contentFinalizationService: this.contentFinalizationService,
      agentRuntime,
      validateRequest,
      ensureNovelCharacters,
    });
    this.pipelineAdapter = new ChapterPipelineRuntimeAdapter({
      streamOrchestrator: this.streamOrchestrator,
      artifactSyncService,
      contentFinalizationService: this.contentFinalizationService,
      lifecycleService,
      ensureNovelCharacters,
    });
    this.repairStreamRuntime = new ChapterRepairStreamRuntime({
      assembler,
      auditService: chapterAuditService,
      artifactSyncService,
      contentFinalizationService: this.contentFinalizationService,
      lifecycleService,
      resolveAuditIssues: deps.resolveAuditIssues,
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

  private getAgentRuntime(agentRuntime?: ChapterRuntimeAgentPort): ChapterRuntimeAgentPort {
    return agentRuntime ?? defaultChapterRuntimeAgent;
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
