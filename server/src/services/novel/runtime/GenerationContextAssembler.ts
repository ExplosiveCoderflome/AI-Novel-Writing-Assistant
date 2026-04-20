import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import { prisma } from "../../../db/prisma";
import { ragServices } from "../../rag";
import { plannerService } from "../../planner/PlannerService";
import { getRagQueryForChapter, novelReferenceService } from "../NovelReferenceService";
import { NovelContinuationService } from "../NovelContinuationService";
import { parseJsonStringArray } from "../novelP0Utils";
import { StyleBindingService } from "../../styleEngine/StyleBindingService";
import { NovelWorldSliceService } from "../storyWorldSlice/NovelWorldSliceService";
import { characterDynamicsQueryService } from "../dynamics/CharacterDynamicsQueryService";
import { payoffLedgerSyncService } from "../../payoff/PayoffLedgerSyncService";
import { buildSyntheticPayoffIssues } from "../../payoff/payoffLedgerShared";
import { buildStoryModePromptBlock, normalizeStoryModeOutput } from "../../storyMode/storyModeProfile";
import {
  buildRuntimeLedgerFromCanonical,
  buildRuntimeOpenConflictsFromCanonical,
  buildRuntimeStateSnapshotFromCanonical,
  buildStateContextBlockFromCanonical,
} from "../state/CanonicalStateService";
import { contextAssemblyService } from "../production/ContextAssemblyService";
import {
  buildLegacyWorldContextFromWorld,
  formatStoryWorldSlicePromptBlock,
} from "../storyWorldSlice/storyWorldSliceFormatting";
import type { ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";
import {
  buildBibleText,
  buildCharactersContextText,
  buildDecisionsBlock,
  buildFactText,
  buildOpenConflictBlock,
  buildOutlineText,
  buildPreviousChaptersSummary,
  buildRecentChapterContentText,
  buildStyleBlock,
  buildStyleEngineBlock,
  buildSummaryText,
  buildSupportingContextText,
  parseJsonStringArraySafe,
} from "./runtimeContextBlocks";
import { mapRowToPlan } from "../storyMacro/storyMacroPlanPersistence";
import {
  buildBookContractContext,
  buildChapterRepairContextFromPackage,
  buildChapterReviewContext,
  buildChapterWriteContext,
  buildMacroConstraintContext,
  buildVolumeWindowContext,
  getRuntimePromptBudgetProfiles,
} from "../../../prompting/prompts/novel/chapterLayeredContext";

const OPENING_COMPARE_LIMIT = 3;
const OPENING_SLICE_LENGTH = 220;

export function buildBlockingPendingReviewProposalWhere(novelId: string, chapterId: string) {
  return {
    novelId,
    status: "pending_review" as const,
    OR: [
      { chapterId },
      { chapterId: null },
    ],
  };
}

function extractOpening(content: string, maxLength = OPENING_SLICE_LENGTH): string {
  return content.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function buildWorldContextFromNovel(
  novel: {
    world?: {
      name: string;
      worldType?: string | null;
      description?: string | null;
      axioms?: string | null;
      background?: string | null;
      geography?: string | null;
      magicSystem?: string | null;
      politics?: string | null;
      races?: string | null;
      religions?: string | null;
      technology?: string | null;
      conflicts?: string | null;
      history?: string | null;
      economy?: string | null;
      factions?: string | null;
    } | null;
  } | null,
): string {
  return buildLegacyWorldContextFromWorld(novel?.world ?? null);
}

function mapPlan(plan: Awaited<ReturnType<typeof plannerService.getChapterPlan>>): GenerationContextPackage["plan"] {
  if (!plan) {
    return null;
  }
  return {
    id: plan.id,
    chapterId: plan.chapterId ?? null,
    planRole: plan.planRole ?? null,
    phaseLabel: plan.phaseLabel ?? null,
    title: plan.title,
    objective: plan.objective,
    participants: parseJsonStringArray(plan.participantsJson),
    reveals: parseJsonStringArray(plan.revealsJson),
    riskNotes: parseJsonStringArray(plan.riskNotesJson),
    mustAdvance: parseJsonStringArray(plan.mustAdvanceJson),
    mustPreserve: parseJsonStringArray(plan.mustPreserveJson),
    sourceIssueIds: parseJsonStringArray(plan.sourceIssueIdsJson),
    replannedFromPlanId: plan.replannedFromPlanId ?? null,
    hookTarget: plan.hookTarget ?? null,
    rawPlanJson: plan.rawPlanJson ?? null,
    scenes: plan.scenes.map((scene: (typeof plan.scenes)[number]) => ({
      id: scene.id,
      sortOrder: scene.sortOrder,
      title: scene.title,
      objective: scene.objective ?? null,
      conflict: scene.conflict ?? null,
      reveal: scene.reveal ?? null,
      emotionBeat: scene.emotionBeat ?? null,
    })),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

function findVolumeWindowSeed(
  volumeRows: Array<{
    id: string;
    sortOrder: number;
    title: string;
    summary: string | null;
    mainPromise: string | null;
    openPayoffsJson: string | null;
    chapters: Array<{ chapterOrder: number }>;
  }>,
  chapterOrder: number,
) {
  const currentIndex = volumeRows.findIndex((volume) => (
    volume.chapters.some((chapter) => chapter.chapterOrder === chapterOrder)
  ));
  if (currentIndex < 0) {
    return {
      currentVolume: null,
      previousVolume: null,
      nextVolume: null,
      softFutureSummary: "",
    };
  }

  const currentVolume = volumeRows[currentIndex];
  const previousVolume = currentIndex > 0 ? volumeRows[currentIndex - 1] : null;
  const nextVolume = currentIndex < volumeRows.length - 1 ? volumeRows[currentIndex + 1] : null;
  const futureVolumes = volumeRows.slice(currentIndex + 1, currentIndex + 4);
  return {
    currentVolume: {
      id: currentVolume.id,
      sortOrder: currentVolume.sortOrder,
      title: currentVolume.title,
      summary: currentVolume.summary,
      mainPromise: currentVolume.mainPromise,
      openPayoffs: parseJsonStringArraySafe(currentVolume.openPayoffsJson),
    },
    previousVolume: previousVolume
      ? { title: previousVolume.title, summary: previousVolume.summary }
      : null,
    nextVolume: nextVolume
      ? { title: nextVolume.title, summary: nextVolume.summary }
      : null,
    softFutureSummary: futureVolumes.length > 0
      ? futureVolumes
        .map((volume) => `Volume ${volume.sortOrder} ${volume.title}: ${volume.mainPromise ?? volume.summary ?? "pending"}`)
        .join("\n")
      : "",
  };
}

export class GenerationContextAssembler {
  private readonly continuationService = new NovelContinuationService();
  private readonly worldSliceService = new NovelWorldSliceService();
  private readonly styleBindingService = new StyleBindingService();

  async assemble(
    novelId: string,
    chapterId: string,
    request: ChapterRuntimeRequestInput,
  ): Promise<{
    novel: { id: string; title: string };
    chapter: { id: string; title: string; order: number; content: string | null; expectation: string | null; targetWordCount: number | null; sceneCards: string | null };
    contextPackage: GenerationContextPackage;
  }> {
    const [novel, chapter] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: novelId },
        include: {
          world: true,
          genre: {
            select: { name: true },
          },
          characters: true,
          storyMacroPlan: true,
          volumePlans: {
            orderBy: { sortOrder: "asc" },
            include: {
              chapters: {
                orderBy: { chapterOrder: "asc" },
                select: { chapterOrder: true },
              },
            },
          },
          primaryStoryMode: {
            select: {
              id: true,
              name: true,
              description: true,
              template: true,
              parentId: true,
              profileJson: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          secondaryStoryMode: {
            select: {
              id: true,
              name: true,
              description: true,
              template: true,
              parentId: true,
              profileJson: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      }),
      prisma.chapter.findFirst({
        where: { id: chapterId, novelId },
        select: {
          id: true,
          title: true,
          order: true,
          content: true,
          expectation: true,
          targetWordCount: true,
          sceneCards: true,
        },
      }),
    ]);

    if (!novel || !chapter) {
      throw new Error("Novel or chapter not found.");
    }

    const ensuredPlan = await plannerService.ensureChapterPlan(novelId, chapterId, request);
    const pendingReviewProposalCountPromise = prisma.stateChangeProposal.count({
      where: buildBlockingPendingReviewProposalWhere(novelId, chapterId),
    });
    const [
      storyWorldSlice,
      planPromptBlock,
      pendingReviewProposalCount,
      openAuditIssues,
      bible,
      summaries,
      facts,
      styleReference,
      recentChapters,
      decisions,
      characterDynamics,
      continuationPack,
      styleContext,
      payoffLedger,
    ] = await Promise.all([
      this.worldSliceService.ensureStoryWorldSlice(novelId, { builderMode: "runtime" }),
      plannerService.buildPlanPromptBlock(novelId, chapterId),
      pendingReviewProposalCountPromise,
      prisma.auditIssue.findMany({
        where: {
          status: "open",
          report: {
            is: {
              novelId,
              chapterId,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }],
      }),
      prisma.novelBible.findUnique({ where: { novelId } }),
      prisma.chapterSummary.findMany({
        where: {
          novelId,
          chapter: { order: { lt: chapter.order } },
        },
        include: { chapter: true },
        orderBy: { chapter: { order: "desc" } },
        take: 3,
      }),
      prisma.consistencyFact.findMany({
        where: { novelId },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      novelReferenceService.buildReferenceForStage(novelId, "chapter"),
      prisma.chapter.findMany({
        where: {
          novelId,
          order: { lt: chapter.order },
          content: { not: null },
        },
        orderBy: { order: "desc" },
        take: 1,
        select: { order: true, title: true, content: true },
      }),
      prisma.creativeDecision.findMany({
        where: {
          novelId,
          OR: [{ expiresAt: null }, { expiresAt: { gte: chapter.order } }],
        },
        orderBy: [{ importance: "asc" }, { createdAt: "desc" }],
        take: 12,
      }),
      characterDynamicsQueryService.getOverview(novelId, {
        chapterOrder: chapter.order,
      }).catch(() => null),
      this.continuationService.buildChapterContextPack(novelId),
      this.styleBindingService.resolveForGeneration({
        novelId,
        chapterId,
        taskStyleProfileId: request.taskStyleProfileId,
      }),
      payoffLedgerSyncService.getPayoffLedger(novelId, {
        chapterOrder: chapter.order,
      }),
    ]);

    const resolvedStateDrivenContext = await contextAssemblyService.build({
      novelId,
      chapterId,
      chapterOrder: chapter.order,
      includeCurrentChapterState: false,
      pendingReviewProposalCount,
      openAuditIssueCount: openAuditIssues.length,
      hasRepairableDraft: Boolean(chapter.content?.trim()),
    });
    const canonicalState = resolvedStateDrivenContext.snapshot;

    const canonicalLedger = buildRuntimeLedgerFromCanonical(canonicalState);
    const previousChaptersSummary = buildPreviousChaptersSummary(request.previousChaptersSummary, summaries);
    const mappedOpenConflicts = buildRuntimeOpenConflictsFromCanonical(canonicalState);
    const storyMacroPlan = novel.storyMacroPlan ? mapRowToPlan(novel.storyMacroPlan) : null;
    const volumeWindow = buildVolumeWindowContext(findVolumeWindowSeed(
      novel.volumePlans.map((volume) => ({
        id: volume.id,
        sortOrder: volume.sortOrder,
        title: volume.title,
        summary: volume.summary,
        mainPromise: volume.mainPromise,
        openPayoffsJson: volume.openPayoffsJson,
        chapters: volume.chapters,
      })),
      chapter.order,
    ));
    const bookContract = buildBookContractContext({
      title: canonicalState.bookContract.title,
      genre: canonicalState.bookContract.genre ?? null,
      targetAudience: canonicalState.bookContract.targetAudience ?? novel.targetAudience,
      sellingPoint: canonicalState.bookContract.sellingPoint ?? novel.bookSellingPoint,
      first30ChapterPromise: canonicalState.bookContract.first30ChapterPromise ?? novel.first30ChapterPromise,
      narrativePov: novel.narrativePov,
      pacePreference: novel.pacePreference,
      emotionIntensity: novel.emotionIntensity,
      toneGuardrails: canonicalState.bookContract.toneGuardrails.length > 0
        ? canonicalState.bookContract.toneGuardrails
        : novel.styleTone ? [novel.styleTone] : [],
      hardConstraints: canonicalState.bookContract.hardConstraints.length > 0
        ? canonicalState.bookContract.hardConstraints
        : storyMacroPlan?.constraints ?? [],
    });
    const macroConstraints = buildMacroConstraintContext(storyMacroPlan);
    const mappedPlan = mapPlan(ensuredPlan);
    const mappedStateSnapshot = buildRuntimeStateSnapshotFromCanonical(canonicalState);
    const canonicalCharacterMap = new Map(
      canonicalState.characters.map((item) => [item.characterId, item]),
    );
    const mappedCharacterRoster = novel.characters.map((item) => {
      const canonicalCharacter = canonicalCharacterMap.get(item.id);
      return {
        id: item.id,
        name: item.name,
        role: item.role,
        personality: item.personality ?? null,
        currentState: canonicalCharacter?.currentState ?? item.currentState ?? null,
        currentGoal: canonicalCharacter?.currentGoal ?? item.currentGoal ?? null,
      };
    });
    const mappedCreativeDecisions = decisions.map((item) => ({
      id: item.id,
      chapterId: item.chapterId ?? null,
      category: item.category,
      content: item.content,
      importance: item.importance,
      expiresAt: item.expiresAt ?? null,
      sourceType: item.sourceType ?? null,
      sourceRefId: item.sourceRefId ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }));
    const mappedOpenAuditIssues = openAuditIssues.map((item) => ({
      id: item.id,
      reportId: item.reportId,
      auditType: item.auditType as GenerationContextPackage["openAuditIssues"][number]["auditType"],
      severity: item.severity as GenerationContextPackage["openAuditIssues"][number]["severity"],
      code: item.code,
      description: item.description,
      evidence: item.evidence,
      fixSuggestion: item.fixSuggestion,
      status: item.status as GenerationContextPackage["openAuditIssues"][number]["status"],
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })).concat(
      buildSyntheticPayoffIssues(payoffLedger.items, chapter.order).map((issue) => ({
        id: `payoff-ledger:${issue.ledgerKey}:${issue.code}`,
        reportId: `payoff-ledger:${novelId}:${chapterId}`,
        auditType: "plot" as const,
        severity: issue.severity,
        code: issue.code,
        description: issue.description,
        evidence: issue.evidence,
        fixSuggestion: issue.fixSuggestion,
        status: "open" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    );
    const runtimeContinuation = {
      enabled: continuationPack.enabled,
      sourceType: continuationPack.sourceType,
      sourceId: continuationPack.sourceId,
      sourceTitle: continuationPack.sourceTitle,
      systemRule: continuationPack.systemRule,
      humanBlock: continuationPack.humanBlock,
      antiCopyCorpus: continuationPack.antiCopyCorpus,
    } satisfies GenerationContextPackage["continuation"];

    const summaryText = buildSummaryText(previousChaptersSummary);
    const factText = buildFactText(facts);
    const recentChapterContentText = buildRecentChapterContentText(recentChapters);
    const charactersContextText = buildCharactersContextText(
      novel.characters.map((item) => ({
        name: item.name,
        role: item.role,
        personality: item.personality ?? null,
      })),
    );
    const characterDynamicsText = characterDynamics
      ? characterDynamicsQueryService.formatContextDigest(characterDynamics)
      : "";
    const combinedCharacterContextText = [charactersContextText, characterDynamicsText].filter(Boolean).join("\n\n");
    const bibleText = buildBibleText(bible
      ? {
          mainPromise: bible.mainPromise ?? null,
          coreSetting: bible.coreSetting ?? null,
          forbiddenRules: bible.forbiddenRules ?? null,
          characterArcs: bible.characterArcs ?? null,
          worldRules: bible.worldRules ?? null,
        }
      : null);
    const outlineText = buildOutlineText(novel.outline ?? null);
    const styleBlock = buildStyleBlock(styleReference);
    const decisionsBlock = buildDecisionsBlock(decisions);
    const styleEngineBlock = buildStyleEngineBlock(styleContext);
    const openConflictBlock = buildOpenConflictBlock(mappedOpenConflicts);
    const stateContextBlock = buildStateContextBlockFromCanonical(canonicalState);

    const ragQuery = getRagQueryForChapter(chapter.order, novel.title, novel.structuredOutline ?? null);
    let ragText = "";
    try {
      ragText = await ragServices.hybridRetrievalService.buildContextBlock(ragQuery, {
        novelId,
        currentChapterOrder: chapter.order,
      });
    } catch {
      ragText = "";
    }

    const worldBlock = storyWorldSlice
      ? formatStoryWorldSlicePromptBlock(storyWorldSlice)
      : buildWorldContextFromNovel(novel);
    const storyModeBlock = buildStoryModePromptBlock({
      primary: novel.primaryStoryMode ? normalizeStoryModeOutput(novel.primaryStoryMode) : null,
      secondary: novel.secondaryStoryMode ? normalizeStoryModeOutput(novel.secondaryStoryMode) : null,
    });
    const openingHint = await this.buildOpeningConstraintHint(novelId, chapter.order);
    const baseContextPackage: GenerationContextPackage = {
      chapter: {
        id: chapter.id,
        title: chapter.title,
        order: chapter.order,
        content: chapter.content ?? null,
        expectation: chapter.expectation ?? null,
        targetWordCount: chapter.targetWordCount ?? null,
        sceneCards: chapter.sceneCards ?? null,
        supportingContextText: "",
      },
      plan: mappedPlan,
      canonicalState,
      nextAction: resolvedStateDrivenContext.nextAction,
      chapterStateGoal: resolvedStateDrivenContext.chapterStateGoal,
      protectedSecrets: resolvedStateDrivenContext.protectedSecrets,
      pendingReviewProposalCount,
      stateSnapshot: mappedStateSnapshot,
      openConflicts: mappedOpenConflicts,
      storyWorldSlice,
      characterDynamics,
      characterRoster: mappedCharacterRoster,
      creativeDecisions: mappedCreativeDecisions,
      openAuditIssues: mappedOpenAuditIssues,
      previousChaptersSummary,
      openingHint,
      continuation: runtimeContinuation,
      styleContext,
      bookContract,
      macroConstraints,
      volumeWindow,
      ledgerPendingItems: canonicalLedger.ledgerPendingItems,
      ledgerUrgentItems: canonicalLedger.ledgerUrgentItems,
      ledgerOverdueItems: canonicalLedger.ledgerOverdueItems,
      ledgerSummary: canonicalLedger.ledgerSummary,
      chapterMission: null,
      chapterWriteContext: null,
      chapterReviewContext: null,
      chapterRepairContext: null,
      promptBudgetProfiles: getRuntimePromptBudgetProfiles(),
    };
    const chapterWriteContext = buildChapterWriteContext({
      bookContract,
      macroConstraints,
      volumeWindow,
      contextPackage: baseContextPackage,
    });
    const chapterReviewContext = buildChapterReviewContext(chapterWriteContext, baseContextPackage);
    const chapterRepairContext = buildChapterRepairContextFromPackage({
      ...baseContextPackage,
      chapterMission: chapterWriteContext.chapterMission,
      chapterWriteContext,
      chapterReviewContext,
      chapterRepairContext: null,
    }, []);
    const contextPackage: GenerationContextPackage = {
      chapter: {
        id: chapter.id,
        title: chapter.title,
        order: chapter.order,
        content: chapter.content ?? null,
        expectation: chapter.expectation ?? null,
        targetWordCount: chapter.targetWordCount ?? null,
        sceneCards: chapter.sceneCards ?? null,
        supportingContextText: buildSupportingContextText({
          worldBlock,
          storyModeBlock,
          planPromptBlock,
          stateContextBlock,
          openConflictBlock,
          decisionsBlock,
          summaryText,
          recentChapterContentText,
          factText,
          ragText,
          bibleText,
          outlineText,
          charactersContextText: combinedCharacterContextText,
          styleBlock,
          styleEngineBlock,
        }),
      },
      plan: mappedPlan,
      canonicalState,
      nextAction: resolvedStateDrivenContext.nextAction,
      chapterStateGoal: resolvedStateDrivenContext.chapterStateGoal,
      protectedSecrets: resolvedStateDrivenContext.protectedSecrets,
      pendingReviewProposalCount,
      stateSnapshot: mappedStateSnapshot,
      openConflicts: mappedOpenConflicts,
      storyWorldSlice,
      characterDynamics,
      characterRoster: mappedCharacterRoster,
      creativeDecisions: mappedCreativeDecisions,
      openAuditIssues: mappedOpenAuditIssues,
      previousChaptersSummary,
      openingHint,
      continuation: runtimeContinuation,
      styleContext,
      bookContract,
      macroConstraints,
      volumeWindow,
      ledgerPendingItems: canonicalLedger.ledgerPendingItems,
      ledgerUrgentItems: canonicalLedger.ledgerUrgentItems,
      ledgerOverdueItems: canonicalLedger.ledgerOverdueItems,
      ledgerSummary: canonicalLedger.ledgerSummary,
      chapterMission: chapterWriteContext.chapterMission,
      chapterWriteContext,
      chapterReviewContext,
      chapterRepairContext,
      promptBudgetProfiles: getRuntimePromptBudgetProfiles(),
    };

    return {
      novel: { id: novel.id, title: novel.title },
      chapter: {
        id: chapter.id,
        title: chapter.title,
        order: chapter.order,
        content: chapter.content ?? null,
        expectation: chapter.expectation ?? null,
        targetWordCount: chapter.targetWordCount ?? null,
        sceneCards: chapter.sceneCards ?? null,
      },
      contextPackage,
    };
  }

  private async buildOpeningConstraintHint(novelId: string, chapterOrder: number): Promise<string> {
    const recentChapters = await prisma.chapter.findMany({
      where: {
        novelId,
        order: { lt: chapterOrder },
        content: { not: null },
      },
      orderBy: { order: "desc" },
      take: OPENING_COMPARE_LIMIT,
      select: { order: true, title: true, content: true },
    });

    const openingList = recentChapters
      .map((item) => ({
        order: item.order,
        title: item.title,
        opening: extractOpening(item.content ?? ""),
      }))
      .filter((item) => item.opening.length > 0);

    if (openingList.length === 0) {
      return "Recent openings: none.";
    }

    return [
      "Recent openings (do not reuse the same opening structure or sentence starter):",
      ...openingList.map((item) => `- Chapter ${item.order} ${item.title}: ${item.opening}`),
    ].join("\n");
  }
}
