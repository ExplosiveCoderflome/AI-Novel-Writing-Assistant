import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { AuditReport, ReplanResult } from "@ai-novel/shared/types/novel";
import type { PayoffLedgerSummary } from "@ai-novel/shared/types/payoffLedger";
import { prisma } from "../../db/prisma";
import { characterDynamicsQueryService } from "../novel/dynamics/CharacterDynamicsQueryService";
import { contextAssemblyService } from "../novel/production/ContextAssemblyService";
import { buildStateContextBlockFromCanonical } from "../novel/state/CanonicalStateService";
import { payoffLedgerSyncService } from "../payoff/PayoffLedgerSyncService";
import { mapRowToPlan } from "../novel/storyMacro/storyMacroPlanPersistence";
import { StyleBindingService } from "../styleEngine/StyleBindingService";
import {
  buildDefaultPlanMetadata,
  normalizePlanMetadata,
} from "./plannerPlanMetadata";
import {
  buildChapterExecutionContractHash,
  persistStoryPlan,
  readPlanExecutionContractHash,
} from "./plannerPersistence";
import { invokePlannerLLM, type PlannerLlmOptions } from "./plannerLlm";
import {
  buildArcPlanContextBlocks,
  buildBookPlanContextBlocks,
  buildChapterPlanContextBlocks,
} from "./plannerContextBlocks";
import { buildReplanDecision } from "./replanDecision";
import {
  buildCurrentVolumeWindowSummary,
  buildPlannerConflictLevelAnchorContext,
  buildPlannerCharacterDynamicsContext,
  buildPlannerPayoffLedgerContext,
  buildPlannerStoryModeBlock,
  buildPlannerStyleEngineSummary,
  buildStoryMacroSummary,
  type PlannerMappedVolume,
  type PlannerStoryModeRow,
} from "./plannerContextHelpers";
import { resolveChapterPlanParticipants } from "./plannerParticipantResolution";
import { plannerPlanQueryService } from "./query";
import { plannerReplanService, type ReplanInput } from "./replan";
import {
  buildPlannerStateDrivenDirective,
  buildPlannerStateGoalText,
  compactPlannerText as compactText,
  takeUniquePlannerItems as takeUnique,
} from "./plannerStateDirectives";

export { normalizePlannerOutput } from "./plannerOutputNormalization";

interface PlannerOptions extends PlannerLlmOptions {
  taskStyleProfileId?: string;
}

interface GenerateChapterPlanOptions extends PlannerOptions {
  replanContext?: {
    reason: string;
    triggerType: string;
    triggerReason?: string;
    windowReason?: string;
    whyTheseChapters?: string;
    sourceIssueIds: string[];
    windowIndex: number;
    windowSize: number;
    affectedChapterOrders: number[];
    anchorChapterOrder?: number | null;
    blockingLedgerKeys?: string[];
    replannedFromPlanId: string | null;
  };
}

const plannerStoryModeSelect = {
  id: true,
  name: true,
  description: true,
  template: true,
  parentId: true,
  profileJson: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class PlannerService {
  private readonly styleBindingService = new StyleBindingService();

  async getChapterPlan(novelId: string, chapterId: string) {
    return plannerPlanQueryService.getChapterPlan(novelId, chapterId);
  }

  async getBookPlan(novelId: string) {
    return plannerPlanQueryService.getBookPlan(novelId);
  }

  async listArcPlans(novelId: string) {
    return plannerPlanQueryService.listArcPlans(novelId);
  }

  async buildPlanPromptBlock(novelId: string, chapterId: string): Promise<string> {
    return plannerPlanQueryService.buildPlanPromptBlock(novelId, chapterId);
  }

  async ensureChapterPlan(novelId: string, chapterId: string, options: PlannerOptions = {}) {
    const existing = await this.getChapterPlan(novelId, chapterId);
    if (existing && existing.scenes.length > 0) {
      const chapter = await prisma.chapter.findFirst({
        where: { id: chapterId, novelId },
        select: {
          expectation: true,
          targetWordCount: true,
          conflictLevel: true,
          revealLevel: true,
          mustAvoid: true,
          taskSheet: true,
          sceneCards: true,
          hook: true,
        },
      });
      const currentContractHash = chapter ? buildChapterExecutionContractHash(chapter) : null;
      const plannedContractHash = readPlanExecutionContractHash(existing.rawPlanJson);
      if (currentContractHash && plannedContractHash === currentContractHash) {
        return existing;
      }
    }
    return this.generateChapterPlan(novelId, chapterId, options);
  }

  async generateBookPlan(novelId: string, options: PlannerOptions = {}) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        title: true,
        description: true,
        targetAudience: true,
        bookSellingPoint: true,
        competingFeel: true,
        first30ChapterPromise: true,
        narrativePov: true,
        pacePreference: true,
        emotionIntensity: true,
        styleTone: true,
        bible: { select: { rawContent: true } },
        genre: { select: { name: true } },
        chapters: { orderBy: { order: "asc" }, select: { title: true, order: true, expectation: true } },
        plotBeats: { orderBy: { chapterOrder: "asc" }, take: 8 },
        primaryStoryMode: { select: plannerStoryModeSelect },
        secondaryStoryMode: { select: plannerStoryModeSelect },
      },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }
    const storyModeBlock = buildPlannerStoryModeBlock(novel);
    const styleEngine = await this.resolvePlannerStyleEngineSummary(novelId, undefined, options.taskStyleProfileId);
    const contextBlocks = buildBookPlanContextBlocks({
      novelTitle: novel.title,
      description: novel.description,
      genreName: novel.genre?.name ?? null,
      targetAudience: novel.targetAudience,
      bookSellingPoint: novel.bookSellingPoint,
      competingFeel: novel.competingFeel,
      first30ChapterPromise: novel.first30ChapterPromise,
      narrativePov: novel.narrativePov,
      pacePreference: novel.pacePreference,
      emotionIntensity: novel.emotionIntensity,
      styleTone: novel.styleTone,
      bible: novel.bible?.rawContent ?? "无",
      chapterDrafts: novel.chapters.map((item) => `${item.order}.${item.title} ${item.expectation ?? ""}`).join("\n") || "无",
      plotBeats: novel.plotBeats.map((item) => `${item.chapterOrder ?? "-"} ${item.title} ${item.content}`).join("\n") || "无",
      storyModeBlock,
      styleEngine,
    });
    const output = await invokePlannerLLM({
      options,
      scopeLabel: `全书规划：${novel.title}`,
      planLevel: "book",
      contextBlocks,
    });
    const metadata = normalizePlanMetadata("book", output, buildDefaultPlanMetadata("book"));
    return persistStoryPlan({
      novelId,
      level: "book",
      title: output.title || `${novel.title} 全书规划`,
      objective: output.objective || "建立全书目标与主线推进。",
      participants: output.participants ?? [],
      reveals: output.reveals ?? [],
      riskNotes: output.riskNotes ?? [],
      hookTarget: output.hookTarget || null,
      scenes: [],
      planRole: metadata.planRole,
      phaseLabel: metadata.phaseLabel,
      mustAdvance: metadata.mustAdvance,
      mustPreserve: metadata.mustPreserve,
      sourceIssueIds: metadata.sourceIssueIds,
      replannedFromPlanId: metadata.replannedFromPlanId,
    });
  }

  async generateArcPlan(novelId: string, arcId: string, options: PlannerOptions = {}) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        title: true,
        description: true,
        targetAudience: true,
        bookSellingPoint: true,
        competingFeel: true,
        first30ChapterPromise: true,
        narrativePov: true,
        pacePreference: true,
        emotionIntensity: true,
        styleTone: true,
        bible: { select: { rawContent: true } },
        genre: { select: { name: true } },
        chapters: { orderBy: { order: "asc" }, select: { title: true, order: true, expectation: true } },
        primaryStoryMode: { select: plannerStoryModeSelect },
        secondaryStoryMode: { select: plannerStoryModeSelect },
      },
    });
    if (!novel) {
      throw new Error("小说不存在。");
    }
    const storyModeBlock = buildPlannerStoryModeBlock(novel);
    const styleEngine = await this.resolvePlannerStyleEngineSummary(novelId, undefined, options.taskStyleProfileId);
    const contextBlocks = buildArcPlanContextBlocks({
      novelTitle: novel.title,
      description: novel.description,
      genreName: novel.genre?.name ?? null,
      targetAudience: novel.targetAudience,
      bookSellingPoint: novel.bookSellingPoint,
      competingFeel: novel.competingFeel,
      first30ChapterPromise: novel.first30ChapterPromise,
      narrativePov: novel.narrativePov,
      pacePreference: novel.pacePreference,
      emotionIntensity: novel.emotionIntensity,
      styleTone: novel.styleTone,
      bible: novel.bible?.rawContent ?? "无",
      chapters: novel.chapters.map((item) => `${item.order}.${item.title} ${item.expectation ?? ""}`).join("\n") || "无",
      storyModeBlock,
      styleEngine,
    });
    const output = await invokePlannerLLM({
      options,
      scopeLabel: `分段规划：${arcId}`,
      planLevel: "arc",
      contextBlocks,
    });
    const metadata = normalizePlanMetadata("arc", output, buildDefaultPlanMetadata("arc"));
    return persistStoryPlan({
      novelId,
      level: "arc",
      externalRef: arcId,
      title: output.title || `Arc ${arcId}`,
      objective: output.objective || `围绕 ${arcId} 推进主线`,
      participants: output.participants ?? [],
      reveals: output.reveals ?? [],
      riskNotes: output.riskNotes ?? [],
      hookTarget: output.hookTarget || null,
      scenes: [],
      planRole: metadata.planRole,
      phaseLabel: metadata.phaseLabel,
      mustAdvance: metadata.mustAdvance,
      mustPreserve: metadata.mustPreserve,
      sourceIssueIds: metadata.sourceIssueIds,
      replannedFromPlanId: metadata.replannedFromPlanId,
    });
  }

  async generateChapterPlan(novelId: string, chapterId: string, options: GenerateChapterPlanOptions = {}) {
    const [novel, chapter, bible, plotBeats, summaries, characters, bookPlan, arcPlans, volumePlans, recentAuditReports, recentDecisions, storyMacroPlanRow, styleEngine, pendingReviewProposalCount] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: novelId },
        select: {
          id: true,
          title: true,
          description: true,
          outline: true,
          structuredOutline: true,
          estimatedChapterCount: true,
          genre: { select: { name: true } },
          targetAudience: true,
          bookSellingPoint: true,
          competingFeel: true,
          first30ChapterPromise: true,
          narrativePov: true,
          pacePreference: true,
          emotionIntensity: true,
          styleTone: true,
          primaryStoryMode: { select: plannerStoryModeSelect },
          secondaryStoryMode: { select: plannerStoryModeSelect },
        },
      }),
      prisma.chapter.findFirst({
        where: { id: chapterId, novelId },
        select: {
          id: true,
          title: true,
          order: true,
          expectation: true,
          content: true,
          targetWordCount: true,
          conflictLevel: true,
          revealLevel: true,
          mustAvoid: true,
          hook: true,
          taskSheet: true,
          sceneCards: true,
        },
      }),
      prisma.novelBible.findUnique({
        where: { novelId },
        select: { rawContent: true },
      }),
      prisma.plotBeat.findMany({
        where: { novelId },
        orderBy: { chapterOrder: "asc" },
        take: 8,
      }),
      prisma.chapterSummary.findMany({
        where: { novelId },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
      prisma.character.findMany({
        where: { novelId },
        select: { id: true, name: true, role: true, currentGoal: true, currentState: true },
      }),
      this.getBookPlan(novelId),
      this.listArcPlans(novelId),
      prisma.volumePlan.findMany({
        where: { novelId },
        orderBy: { sortOrder: "asc" },
        include: {
          chapters: {
            orderBy: { chapterOrder: "asc" },
          },
        },
      }),
      prisma.auditReport.findMany({
        where: { novelId },
        orderBy: { createdAt: "desc" },
        take: 4,
        include: {
          issues: {
            where: { status: "open" },
          },
        },
      }),
      prisma.creativeDecision.findMany({
        where: { novelId },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          category: true,
          content: true,
          importance: true,
        },
      }),
      prisma.storyMacroPlan.findUnique({
        where: { novelId },
      }),
      this.resolvePlannerStyleEngineSummary(novelId, chapterId, options.taskStyleProfileId),
      prisma.stateChangeProposal.count({
        where: {
          novelId,
          status: "pending_review",
        },
      }),
    ]);
    if (!novel || !chapter) {
      throw new Error("小说或章节不存在。");
    }
    const storyModeBlock = buildPlannerStoryModeBlock(novel);
    const storyMacroPlan = storyMacroPlanRow ? mapRowToPlan(storyMacroPlanRow) : null;
    const payoffLedger = await payoffLedgerSyncService.getPayoffLedger(novelId, {
      chapterOrder: chapter.order,
    }).catch(() => ({
      summary: {
        totalCount: 0,
        pendingCount: 0,
        urgentCount: 0,
        overdueCount: 0,
        paidOffCount: 0,
        failedCount: 0,
        updatedAt: null,
      },
      items: [],
      updatedAt: null,
    }));
    const characterDynamicsOverview = await characterDynamicsQueryService.getOverview(novelId, {
      chapterOrder: chapter.order,
    }).catch(() => null);
    const characterDynamicsContext = buildPlannerCharacterDynamicsContext(characterDynamicsOverview);
    const mappedVolumes = volumePlans.map((volume) => ({
      id: volume.id,
      novelId,
      sortOrder: volume.sortOrder,
      title: volume.title,
      summary: volume.summary,
      mainPromise: volume.mainPromise,
      escalationMode: volume.escalationMode,
      protagonistChange: volume.protagonistChange,
      climax: volume.climax,
      nextVolumeHook: volume.nextVolumeHook,
      resetPoint: volume.resetPoint,
      openPayoffs: volume.openPayoffsJson ? JSON.parse(volume.openPayoffsJson) as string[] : [],
      status: volume.status,
      sourceVersionId: volume.sourceVersionId,
      chapters: volume.chapters.map((item) => ({
        id: item.id,
        volumeId: item.volumeId,
        chapterOrder: item.chapterOrder,
        title: item.title,
        summary: item.summary,
        purpose: item.purpose,
        conflictLevel: item.conflictLevel,
        conflictLevelSource: item.conflictLevelSource === "user"
          ? "user" as const
          : item.conflictLevelSource === "ai"
            ? "ai" as const
            : null,
        revealLevel: item.revealLevel,
        targetWordCount: item.targetWordCount,
        mustAvoid: item.mustAvoid,
        taskSheet: item.taskSheet,
        payoffRefs: item.payoffRefsJson ? JSON.parse(item.payoffRefsJson) as string[] : [],
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      createdAt: volume.createdAt.toISOString(),
      updatedAt: volume.updatedAt.toISOString(),
    }));
    const plannerVolumes: PlannerMappedVolume[] = mappedVolumes.map((volume) => ({
      sortOrder: volume.sortOrder,
      title: volume.title,
      summary: volume.summary,
      mainPromise: volume.mainPromise,
      climax: volume.climax,
      openPayoffs: volume.openPayoffs,
      updatedAt: volume.updatedAt,
      chapters: volume.chapters.map((item) => ({
        chapterOrder: item.chapterOrder,
        title: item.title,
        summary: item.summary,
        conflictLevel: item.conflictLevel,
        conflictLevelSource: item.conflictLevelSource,
      })),
    }));
    const anchoredVolumeChapter = mappedVolumes
      .flatMap((volume) => volume.chapters)
      .find((item) => item.chapterOrder === chapter.order && item.conflictLevelSource === "user");
    const defaultMetadata = buildDefaultPlanMetadata("chapter", {
      chapterOrder: chapter.order,
      totalChapters: novel.estimatedChapterCount ?? null,
      expectation: chapter.expectation ?? null,
    });
    const openAuditIssues = recentAuditReports.flatMap((report) => report.issues.map((issue) => (
      `${issue.auditType}/${issue.severity}: ${issue.description} | 证据=${issue.evidence}`
    )));
    const resolvedStateDrivenContext = await contextAssemblyService.build({
      novelId,
      chapterId,
      chapterOrder: chapter.order,
      includeCurrentChapterState: false,
      policy: {
        kickoffMode: "manual_start",
        advanceMode: options.replanContext ? "stage_review" : "manual",
      },
      pendingReviewProposalCount,
      openAuditIssueCount: openAuditIssues.length,
      hasRepairableDraft: Boolean(chapter.content?.trim()),
    });
    const plannerStateGoalText = buildPlannerStateGoalText({
      summary: resolvedStateDrivenContext.chapterStateGoal?.summary ?? null,
      targetConflicts: resolvedStateDrivenContext.chapterStateGoal?.targetConflicts ?? [],
      targetRelationships: resolvedStateDrivenContext.chapterStateGoal?.targetRelationships ?? [],
      targetPayoffs: resolvedStateDrivenContext.chapterStateGoal?.targetPayoffs ?? [],
      protectedSecrets: resolvedStateDrivenContext.protectedSecrets,
      recentTimeline: resolvedStateDrivenContext.recentTimeline.map((item) => item.summary),
    });
    const replanContextBlock = options.replanContext
      ? [
          `重规划原因：${options.replanContext.reason}`,
          `触发类型：${options.replanContext.triggerType}`,
          options.replanContext.triggerReason
            ? `状态触发理由：${options.replanContext.triggerReason}`
            : "",
          options.replanContext.windowReason
            ? `选窗理由：${options.replanContext.windowReason}`
            : "",
          options.replanContext.whyTheseChapters
            ? `为何改这几章：${options.replanContext.whyTheseChapters}`
            : "",
          `重规划窗口：第 ${options.replanContext.affectedChapterOrders.join("、")} 章`,
          typeof options.replanContext.anchorChapterOrder === "number"
            ? `锚点章节：第 ${options.replanContext.anchorChapterOrder} 章`
            : "",
          options.replanContext.sourceIssueIds.length > 0
            ? `来源问题：${options.replanContext.sourceIssueIds.join("、")}`
            : "",
          options.replanContext.blockingLedgerKeys?.length
            ? `账本风险：${options.replanContext.blockingLedgerKeys.join("、")}`
            : "",
          options.replanContext.replannedFromPlanId
            ? `上一版计划：${options.replanContext.replannedFromPlanId}`
            : "",
        ].filter(Boolean).join("\n")
      : "无";
    const contextBlocks = buildChapterPlanContextBlocks({
      novelTitle: novel.title,
      description: novel.description,
      genreName: novel.genre?.name ?? null,
      targetAudience: novel.targetAudience,
      bookSellingPoint: novel.bookSellingPoint,
      competingFeel: novel.competingFeel,
      first30ChapterPromise: novel.first30ChapterPromise,
      narrativePov: novel.narrativePov,
      pacePreference: novel.pacePreference,
      emotionIntensity: novel.emotionIntensity,
      styleTone: novel.styleTone,
      chapterExpectation: chapter.expectation,
      chapterTaskSheet: chapter.taskSheet,
      chapterTargetWordCount: chapter.targetWordCount,
      bible: bible?.rawContent ?? "无",
      styleEngine,
      outline: novel.outline,
      structuredOutline: novel.structuredOutline,
      mappedVolumes: plannerVolumes.map((volume) => ({
        sortOrder: volume.sortOrder,
        title: volume.title,
        summary: volume.summary,
        mainPromise: volume.mainPromise,
        climax: volume.climax,
        updatedAt: volume.updatedAt,
        chapters: volume.chapters,
      })),
      bookPlan: bookPlan ? `${bookPlan.title} | ${bookPlan.objective}${bookPlan.phaseLabel ? ` | 阶段=${bookPlan.phaseLabel}` : ""}` : "无",
      arcPlans: arcPlans.length > 0
        ? arcPlans.map((plan) => `${plan.externalRef ?? "-"} ${plan.title} | ${plan.objective}${plan.phaseLabel ? ` | 阶段=${plan.phaseLabel}` : ""}`).join("\n")
        : "无",
      characters: characters.map((item) => `${item.id}|${item.name}|${item.role}|goal=${item.currentGoal ?? ""}|state=${item.currentState ?? ""}`).join("\n") || "无",
      recentSummaries: summaries.map((item) => `${item.summary}`).join("\n") || "无",
      plotBeats: plotBeats.map((item) => `${item.chapterOrder ?? "-"} ${item.title} ${item.content}`).join("\n") || "无",
      stateSnapshot: buildStateContextBlockFromCanonical(resolvedStateDrivenContext.snapshot),
      openAuditIssues: openAuditIssues.join("\n") || "无",
      recentDecisions: recentDecisions.map((item) => `${item.category}/${item.importance}: ${item.content}`).join("\n") || "无",
      characterDynamicsSummary: characterDynamicsContext.summary,
      characterVolumeAssignments: characterDynamicsContext.volumeAssignments,
      characterRelationStages: characterDynamicsContext.relationStages,
      characterCandidateGuards: characterDynamicsContext.candidateGuards,
      stateDrivenDirective: buildPlannerStateDrivenDirective({
        nextAction: resolvedStateDrivenContext.nextAction,
        pendingReviewProposalCount,
        openAuditIssueCount: openAuditIssues.length,
      }),
      stateDrivenGoal: plannerStateGoalText,
      defaultMetadata: [
        `planRole=${defaultMetadata.planRole ?? "progress"} | phase=${defaultMetadata.phaseLabel ?? "无"}`,
        `mustAdvance=${defaultMetadata.mustAdvance.join("；") || "无"}`,
        `mustPreserve=${defaultMetadata.mustPreserve.join("；") || "无"}`,
      ].join("\n"),
      replanContext: replanContextBlock,
      replanConflictLevelAnchors: options.replanContext
        ? buildPlannerConflictLevelAnchorContext(plannerVolumes, options.replanContext.affectedChapterOrders)
        : "无",
      storyMacroSummary: buildStoryMacroSummary(storyMacroPlan),
      currentVolumeWindow: buildCurrentVolumeWindowSummary(plannerVolumes, chapter.order),
      payoffLedgerSummary: buildPlannerPayoffLedgerContext(payoffLedger, chapter.order),
      storyModeBlock,
    });
    const output = await invokePlannerLLM({
      options,
      scopeLabel: `章节规划：第${chapter.order}章《${chapter.title}》`,
      planLevel: "chapter",
      contextBlocks,
    });
    const metadata = normalizePlanMetadata("chapter", output, {
      ...defaultMetadata,
      sourceIssueIds: options.replanContext?.sourceIssueIds ?? [],
      replannedFromPlanId: options.replanContext?.replannedFromPlanId ?? null,
    });
    const chapterStateGoal = resolvedStateDrivenContext.chapterStateGoal;
    const resolvedParticipants = resolveChapterPlanParticipants({
      outputParticipants: output.participants ?? [],
      characters,
      characterDynamicsOverview,
      chapterOrder: chapter.order,
    });

    return persistStoryPlan({
      novelId,
      chapterId: chapter.id,
      sourceStateSnapshotId: resolvedStateDrivenContext.snapshot.sourceSnapshotId ?? null,
      level: "chapter",
      title: output.title || chapter.title,
      objective: output.objective
        || compactText(chapterStateGoal?.summary)
        || chapter.expectation?.trim()
        || `推进第${chapter.order}章主线。`,
      targetWordCount: chapter.targetWordCount,
      participants: resolvedParticipants,
      reveals: output.reveals ?? [],
      riskNotes: takeUnique([
        ...(output.riskNotes ?? []),
        ...resolvedStateDrivenContext.protectedSecrets.map((item) => `禁止提前泄露：${item}`),
      ], 8),
      hookTarget: output.hookTarget || chapter.hook?.trim() || null,
      baseExecutionContract: {
        expectation: chapter.expectation,
        targetWordCount: chapter.targetWordCount,
        conflictLevel: anchoredVolumeChapter?.conflictLevel ?? chapter.conflictLevel,
        revealLevel: chapter.revealLevel,
        mustAvoid: chapter.mustAvoid,
        taskSheet: chapter.taskSheet,
        sceneCards: chapter.sceneCards,
        hook: chapter.hook,
      },
      scenes: output.scenes ?? [],
      planRole: metadata.planRole,
      phaseLabel: metadata.phaseLabel,
      mustAdvance: takeUnique([
        ...(chapterStateGoal?.targetConflicts ?? []),
        ...metadata.mustAdvance,
      ], 8),
      mustPreserve: takeUnique([
        ...(chapterStateGoal?.targetRelationships ?? []),
        ...metadata.mustPreserve,
      ], 8),
      sourceIssueIds: metadata.sourceIssueIds,
      replannedFromPlanId: metadata.replannedFromPlanId,
    });
  }

  async replan(novelId: string, input: ReplanInput): Promise<ReplanResult> {
    return plannerReplanService.replan(novelId, input, this);
  }

  shouldTriggerReplanFromAudit(auditReports: AuditReport[], ledgerSummary?: PayoffLedgerSummary | null): boolean {
    return buildReplanDecision({
      auditReports,
      ledgerSummary,
    }).action === "stop_for_replan";
  }

  buildReplanRecommendation(input: {
    auditReports?: AuditReport[];
    ledgerSummary?: PayoffLedgerSummary | null;
    contextPackage?: GenerationContextPackage | null;
    targetChapterOrder?: number | null;
    requestedWindowSize?: number | null;
    blockingLedgerKeys?: string[];
    forceRecommended?: boolean;
    reason?: string | null;
    triggerType?: string | null;
  }) {
    return buildReplanDecision({
      auditReports: input.auditReports ?? [],
      ledgerSummary: input.ledgerSummary ?? null,
      snapshot: input.contextPackage?.canonicalState ?? null,
      nextAction: input.contextPackage?.nextAction ?? null,
      chapterStateGoal: input.contextPackage?.chapterStateGoal ?? null,
      protectedSecrets: input.contextPackage?.protectedSecrets ?? [],
      targetChapterOrder: input.targetChapterOrder ?? input.contextPackage?.chapter?.order ?? null,
      requestedWindowSize: input.requestedWindowSize ?? null,
      blockingLedgerKeys: input.blockingLedgerKeys ?? [],
      forceRecommended: input.forceRecommended,
      reason: input.reason,
      triggerType: input.triggerType,
    });
  }

  private async resolvePlannerStyleEngineSummary(
    novelId: string,
    chapterId?: string,
    taskStyleProfileId?: string,
  ): Promise<string> {
    try {
      const styleContext = await this.styleBindingService.resolveForGeneration({
        novelId,
        chapterId,
        taskStyleProfileId,
      });
      return buildPlannerStyleEngineSummary(styleContext);
    } catch {
      return "无";
    }
  }
}

export const plannerService = new PlannerService();
