import { prepareChapterPlan,executePreparedChapterPlan,projectChapterPlan,plannerStoryModeSelect,type ChapterPlanPreparationDependencies,type PlannerOptions,type GenerateChapterPlanOptions } from "./chapter";
import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import type { AuditReport, ReplanResult } from "@ai-novel/shared/types/novel";
import type { PayoffLedgerSummary } from "@ai-novel/shared/types/payoffLedger";
import { prisma } from "../../db/prisma";
import { characterDynamicsQueryService } from "../novel/dynamics/CharacterDynamicsQueryService";
import { contextAssemblyService } from "../novel/production/ContextAssemblyService";
import { payoffLedgerSyncService } from "../payoff/PayoffLedgerSyncService";
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
import { invokePlannerLLM } from "./plannerLlm";
import {
  buildArcPlanContextBlocks,
  buildBookPlanContextBlocks,
} from "./plannerContextBlocks";
import { buildReplanDecision } from "./replanDecision";
import {
  buildPlannerStoryModeBlock,
  buildPlannerStyleEngineSummary,
} from "./plannerContextHelpers";
import { plannerPlanQueryService } from "./query";
import { plannerReplanService, type ReplanInput } from "./replan";

export { normalizePlannerOutput } from "./plannerOutputNormalization";

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
      novelId,
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
      novelId,
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

  async prepareChapterPlan(novelId: string, chapterId: string, options: GenerateChapterPlanOptions = {}, dependencies?: ChapterPlanPreparationDependencies) {
    return prepareChapterPlan(novelId,chapterId,options,dependencies ?? {db:prisma,readBookPlan:id=>this.getBookPlan(id),listArcPlans:id=>this.listArcPlans(id),
      resolveStyleSummary:(id,chapter,style)=>this.resolvePlannerStyleEngineSummary(id,chapter,style),
      readPayoff:(...args)=>payoffLedgerSyncService.getPayoffLedger(...args),readDynamics:(...args)=>characterDynamicsQueryService.getOverview(...args),
      buildStateContext:input=>contextAssemblyService.build(input),strictSources:false});
  }

  async generateChapterPlan(novelId: string, chapterId: string, options: GenerateChapterPlanOptions = {}) {
    const prepared=await this.prepareChapterPlan(novelId,chapterId,options);
    return persistStoryPlan(projectChapterPlan(prepared,await executePreparedChapterPlan(prepared)));
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
    scope?: "local_window" | "global_book";
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
      scope: input.scope,
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
