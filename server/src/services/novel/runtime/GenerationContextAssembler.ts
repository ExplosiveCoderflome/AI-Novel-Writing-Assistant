import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import { buildCompressionLog } from "../../../prompting/core/contextBudget";
import { prisma } from "../../../db/prisma";
import { ragServices } from "../../rag";
import { plannerService } from "../../planner/PlannerService";
import { buildChapterRagQuery } from "../NovelReferenceService";
import { NovelContinuationService } from "../NovelContinuationService";
import { parseJsonStringArray } from "../novelP0Utils";
import { StyleBindingService } from "../../styleEngine/StyleBindingService";
import { WorldContextGateway } from "../worldContext/WorldContextGateway";
import { characterDynamicsQueryService } from "../dynamics/CharacterDynamicsQueryService";
import { characterResourceLedgerService } from "../characterResource/CharacterResourceLedgerService";
import { payoffLedgerSyncService } from "../../payoff/PayoffLedgerSyncService";
import { buildSyntheticPayoffIssues } from "../../payoff/payoffLedgerShared";
import {
  buildRuntimeLedgerFromCanonical,
  buildRuntimeOpenConflictsFromCanonical,
  buildRuntimeStateSnapshotFromCanonical,
} from "../state/CanonicalStateService";
import { contextAssemblyService } from "../production/ContextAssemblyService";
import type { ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";
import {
  buildPreviousChaptersSummary,
  parseJsonStringArraySafe,
} from "./runtimeContextBlocks";
import { mapRowToPlan } from "../storyMacro/storyMacroPlanPersistence";
import {
  buildBookContractContext,
  buildNarrativeProgressHint,
  buildChapterRepairContextFromPackage,
  buildChapterReviewContext,
  buildChapterWriteContext,
  buildMacroConstraintContext,
  buildVolumeWindowContext,
  getAllContextBlocks,
  getRuntimePromptBudgetProfiles,
} from "../../../prompting/prompts/novel/chapterLayeredContext";
import { novelFactService } from "../fact/NovelFactService";
import { batchContextCache } from "./BatchContextCache";
import {
  buildRuntimeCharacterHardFactsList,
  parseCharacterProhibitionsJson,
} from "../characters/characterHardFacts";
import { NovelVolumeService } from "../volume/NovelVolumeService";
import { ChapterPlanJITService } from "../planning/ChapterPlanJITService";

const OPENING_COMPARE_LIMIT = 3;
const OPENING_SLICE_LENGTH = 220;

const runtimeChapterSelect = {
  id: true,
  title: true,
  order: true,
  content: true,
  expectation: true,
  targetWordCount: true,
  conflictLevel: true,
  revealLevel: true,
  mustAvoid: true,
  taskSheet: true,
  sceneCards: true,
  hook: true,
} as const;

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

function extractChapterTail(content: string | null | undefined, maxLength = 520): string {
  const normalized = (content ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.slice(Math.max(0, normalized.length - maxLength));
}

function normalizeRuntimeName(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function buildSyntheticCharacterResourceIssues(
  context: GenerationContextPackage["characterResourceContext"],
  input: {
    novelId: string;
    chapterId: string;
  },
): GenerationContextPackage["openAuditIssues"] {
  if (!context) {
    return [];
  }
  const now = new Date().toISOString();
  const blockedIssues = context.blockedItems.slice(0, 4).map((item) => ({
    id: `character-resource:${item.id}:blocked`,
    reportId: `character-resource:${input.novelId}:${input.chapterId}`,
    auditType: "continuity" as const,
    severity: item.status === "destroyed" || item.status === "lost" ? "high" as const : "medium" as const,
    code: "character_resource_unavailable",
    description: `${item.name} 当前为 ${item.status}，本章不能直接当作可用资源使用。`,
    evidence: item.evidence[0]?.summary ?? item.summary,
    fixSuggestion: `优先做局部修复：补出重新获得、替代资源或不能使用的行动限制，避免无铺垫复用 ${item.name}。`,
    status: "open" as const,
    createdAt: now,
    updatedAt: now,
  }));
  const highRiskIssues = context.highRiskCommittedItems.slice(0, 3).map((item) => ({
    id: `character-resource:${item.id}:high-risk-committed`,
    reportId: `character-resource:${input.novelId}:${input.chapterId}`,
    auditType: "continuity" as const,
    severity: "medium" as const,
    code: "character_resource_high_risk_committed",
    description: `${item.name} 已入账但带有高风险信号，本章使用时不要改写其持有、可见性或消耗状态。`,
    evidence: item.evidence[0]?.summary ?? item.summary,
    fixSuggestion: `将 ${item.name} 的使用写成可回收的小修补，避免把高风险资源写成新的不可逆事实。`,
    status: "open" as const,
    createdAt: now,
    updatedAt: now,
  }));
  const pendingProposalIssues = context.pendingProposalItems.slice(0, 3).map((proposal) => ({
    id: `character-resource-proposal:${proposal.id}:pending-review`,
    reportId: `character-resource:${input.novelId}:${input.chapterId}`,
    auditType: "continuity" as const,
    severity: proposal.riskLevel === "high" ? "high" as const : "medium" as const,
    code: "character_resource_pending_proposal",
    description: `${proposal.summary} 仍在待确认状态，确认前不要把这条资源变更写成已发生事实。`,
    evidence: proposal.evidence[0] ?? proposal.summary,
    fixSuggestion: "先在任务中心确认或忽略这条资源变更；正文生成只应依据已入账资源。",
    status: "open" as const,
    createdAt: now,
    updatedAt: now,
  }));
  const signalIssues = context.riskSignals
    .filter((signal) => signal.severity === "high" || signal.severity === "critical")
    .slice(0, 3)
    .map((signal, index) => ({
      id: `character-resource:signal:${index}:${signal.code}`,
      reportId: `character-resource:${input.novelId}:${input.chapterId}`,
      auditType: "continuity" as const,
      severity: signal.severity,
      code: signal.code || "character_resource_risk",
      description: signal.summary,
      evidence: signal.summary,
      fixSuggestion: "优先采用 patch_first：只修补当前章节的资源归属、消耗或知情关系，不重写整段剧情。",
      status: "open" as const,
      createdAt: now,
      updatedAt: now,
    }));
  return [...blockedIssues, ...highRiskIssues, ...pendingProposalIssues, ...signalIssues];
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

export function resolveChapterResourceCharacterIds(input: {
  plan: Awaited<ReturnType<typeof plannerService.getChapterPlan>>;
  characters: Array<{ id: string; name: string }>;
}): string[] {
  const participantNames = new Set(
    parseJsonStringArray(input.plan?.participantsJson ?? null).map(normalizeRuntimeName).filter(Boolean),
  );
  if (participantNames.size === 0) {
    return [];
  }
  return input.characters
    .filter((character) => participantNames.has(normalizeRuntimeName(character.name)))
    .map((character) => character.id)
    .filter(Boolean);
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
  private readonly worldContextGateway = new WorldContextGateway();
  private readonly styleBindingService = new StyleBindingService();
  private readonly volumeService = new NovelVolumeService();
  private readonly chapterPlanJITService = new ChapterPlanJITService({
    ensureChapterExecutionContract: (novelId, chapterId, options) => (
      this.volumeService.ensureChapterExecutionContract(novelId, chapterId, options)
    ),
  });

  async assemble(
    novelId: string,
    chapterId: string,
    request: ChapterRuntimeRequestInput,
  ): Promise<{
    novel: { id: string; title: string };
    chapter: {
      id: string;
      title: string;
      order: number;
      content: string | null;
      expectation: string | null;
      targetWordCount: number | null;
      conflictLevel: number | null;
      revealLevel: number | null;
      mustAvoid: string | null;
      taskSheet: string | null;
      sceneCards: string | null;
      hook: string | null;
    };
    contextPackage: GenerationContextPackage;
  }> {
    // Phase 2：novel 稳定层从缓存获取，避免每章重复全量查询
    let [novel, chapter] = await Promise.all([
      batchContextCache.getNovelRow(novelId),
      prisma.chapter.findFirst({
        where: { id: chapterId, novelId },
        select: runtimeChapterSelect,
      }),
    ]);

    if (!novel || !chapter) {
      throw new Error("Novel or chapter not found.");
    }

    // 懒规划 JIT：全书 autopilot 路径在 ensureChapterPlan 之前确保 task sheet 就绪。
    // JIT 生成时会注入已发生事实（factLedger），解决 task sheet 与实际前文脱节问题。
    if (request.controlPolicy?.advanceMode === "full_book_autopilot") {
      await this.chapterPlanJITService.ensureExecutionReady(novelId, chapterId);
    }
    const ensuredPlan = await plannerService.ensureChapterPlan(novelId, chapterId, request);
    const refreshedChapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: runtimeChapterSelect,
    });
    if (!refreshedChapter) {
      throw new Error("Novel or chapter not found.");
    }
    chapter = refreshedChapter;
    const resourceCharacterIds = resolveChapterResourceCharacterIds({
      plan: ensuredPlan,
      characters: novel.characters,
    });
    const pendingReviewProposalCountPromise = prisma.stateChangeProposal.count({
      where: buildBlockingPendingReviewProposalWhere(novelId, chapterId),
    });
    const [
      worldContextBlock,
      pendingReviewProposalCount,
      openAuditIssues,
      summaries,
      recentChapters,
      decisions,
      characterDynamics,
      continuationPack,
      styleContext,
      payoffLedger,
      characterResourceContext,
    ] = await Promise.all([
      this.worldContextGateway.getWorldContextBlock(novelId, { purpose: "chapter" }),
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
      prisma.chapterSummary.findMany({
        where: {
          novelId,
          chapter: { order: { lt: chapter.order } },
        },
        include: { chapter: true },
        orderBy: { chapter: { order: "desc" } },
        take: 3,
      }),
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
      characterResourceLedgerService.buildContext(novelId, {
        chapterId,
        chapterOrder: chapter.order,
        ...(resourceCharacterIds.length > 0 ? { characterIds: resourceCharacterIds } : {}),
      }).catch(() => null),
    ]);

    const resolvedStateDrivenContext = await contextAssemblyService.build({
      novelId,
      chapterId,
      chapterOrder: chapter.order,
      includeCurrentChapterState: false,
      policy: request.controlPolicy,
      pendingReviewProposalCount,
      openAuditIssueCount: openAuditIssues.length,
      hasRepairableDraft: Boolean(chapter.content?.trim()),
    });
    // Phase 2 缺陷5：timelineContext 在写作路径已不消费（PR-B 已移除），
    // 停止每章构建，将 timelineContext 置 null。ChapterQualityGateService
    // 对 null 有防御处理（直接跳过 timeline 检查）。
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
    const activeStyleProfileId = styleContext.matchedBindings[0]?.styleProfileId?.trim()
      || styleContext.matchedBindings[0]?.styleProfile?.id?.trim()
      || request.taskStyleProfileId?.trim()
      || "";
    const novelStyleTone = novel.styleTone?.trim() || "";
    const filteredToneGuardrails = canonicalState.bookContract.toneGuardrails.filter((item) => {
      const normalized = item.trim();
      if (!normalized) {
        return false;
      }
      if (!activeStyleProfileId) {
        return true;
      }
      return !novelStyleTone || normalized !== novelStyleTone;
    });
    const bookContract = buildBookContractContext({
      title: canonicalState.bookContract.title,
      genre: canonicalState.bookContract.genre ?? null,
      targetAudience: canonicalState.bookContract.targetAudience ?? novel.targetAudience,
      sellingPoint: canonicalState.bookContract.sellingPoint ?? novel.bookSellingPoint,
      first30ChapterPromise: canonicalState.bookContract.first30ChapterPromise ?? novel.first30ChapterPromise,
      narrativePov: novel.narrativePov,
      pacePreference: novel.pacePreference,
      emotionIntensity: novel.emotionIntensity,
      toneGuardrails: filteredToneGuardrails.length > 0
        ? filteredToneGuardrails
        : (!activeStyleProfileId && novelStyleTone ? [novelStyleTone] : []),
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
        background: item.background ?? null,
        development: item.development ?? null,
        identityLabel: item.identityLabel ?? null,
        factionLabel: item.factionLabel ?? null,
        stanceLabel: item.stanceLabel ?? null,
        powerLevel: item.powerLevel ?? null,
        realm: item.realm ?? null,
        currentLocation: item.currentLocation ?? null,
        availability: item.availability ?? null,
        prohibitions: parseCharacterProhibitionsJson(item.prohibitionsJson),
        currentState: canonicalCharacter?.currentState ?? item.currentState ?? null,
        currentGoal: canonicalCharacter?.currentGoal ?? item.currentGoal ?? null,
        appearance: item.appearance ?? null,
        physique: item.physique ?? null,
        attireStyle: item.attireStyle ?? null,
        signatureDetail: item.signatureDetail ?? null,
        voiceTexture: item.voiceTexture ?? null,
        presenceImpression: item.presenceImpression ?? null,
      };
    });
    const mappedCharacterHardFacts = buildRuntimeCharacterHardFactsList(mappedCharacterRoster);
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
      buildSyntheticCharacterResourceIssues(characterResourceContext, { novelId, chapterId }),
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

    const previousChapterTail = extractChapterTail(recentChapters[0]?.content);

    const storyWorldSlice = worldContextBlock?.rawSlice ?? null;
    const openingHint = await this.buildOpeningConstraintHint(novelId, chapter.order);

    // Phase 2 缺陷6：合并 baseContextPackage 与 contextPackage 为单一构建。
    // 先用占位值构建 chapterWriteContext，再后置填充派生字段，消除字段手抄两遍。
    const sharedFields = {
      chapter: {
        id: chapter.id,
        title: chapter.title,
        order: chapter.order,
        content: chapter.content ?? null,
        expectation: chapter.expectation ?? null,
        targetWordCount: chapter.targetWordCount ?? null,
        conflictLevel: chapter.conflictLevel ?? null,
        revealLevel: chapter.revealLevel ?? null,
        mustAvoid: chapter.mustAvoid ?? null,
        taskSheet: chapter.taskSheet ?? null,
        sceneCards: chapter.sceneCards ?? null,
        hook: chapter.hook ?? null,
        supportingContextText: "",
      },
      plan: mappedPlan,
      narrativeProgressHint: buildNarrativeProgressHint(
        chapter.order,
        novel.estimatedChapterCount,
      ),
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
      characterHardFacts: mappedCharacterHardFacts,
      creativeDecisions: mappedCreativeDecisions,
      openAuditIssues: mappedOpenAuditIssues,
      previousChaptersSummary,
      previousChapterTail,
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
      // Phase 2 缺陷5：timelineContext 停止构建，写作路径已不消费
      timelineContext: null,
      characterResourceContext,
      contextGatingDecisions: [] as GenerationContextPackage["contextGatingDecisions"],
      chapterChangeFlags: {
        introducedPayoff: false,
        payoffResolutionSignal: false,
        relationshipShiftSignal: false,
        majorStateShiftSignal: false,
      },
      tokenBudgetPolicy: {
        chapterBudgetProfile: "balanced" as const,
        stageTokenCap: {
          writer: 2600,
          light_audit: 900,
          full_audit: 2600,
          repair: 2200,
        },
        retryCap: {
          full_audit: 1,
          repair: 1,
        },
        auditMode: "light" as const,
      },
      promptBudgetProfiles: getRuntimePromptBudgetProfiles(),
    };

    // buildChapterWriteContext 仅需稳定字段，用 sharedFields + 占位派生字段构建
    const chapterWriteContext = buildChapterWriteContext({
      bookContract,
      macroConstraints,
      volumeWindow,
      contextPackage: {
        ...sharedFields,
        ragContext: "",
        chapterMission: null,
        chapterWriteContext: null,
        chapterReviewContext: null,
        chapterRepairContext: null,
      },
    });

    // 填充事实账本：读取已发生不可逆事实，注入 completedMilestones
    try {
      const factEntries = await novelFactService.listForChapter({
        novelId,
        beforeChapterOrder: chapter.order,
      });
      if (factEntries.length > 0) {
        chapterWriteContext.completedMilestones = factEntries.map((entry) => entry.text);
      }
    } catch (error) {
      console.warn("[context-assembler] fact ledger read failed, completedMilestones will be empty", {
        novelId,
        chapterOrder: chapter.order,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const partialPackageForReview = {
      ...sharedFields,
      ragContext: "",
      chapterMission: chapterWriteContext.chapterMission,
      chapterWriteContext,
      chapterReviewContext: null,
      chapterRepairContext: null,
    };
    const chapterReviewContext = buildChapterReviewContext(chapterWriteContext, partialPackageForReview);
    const chapterRepairContext = buildChapterRepairContextFromPackage({
      ...partialPackageForReview,
      chapterReviewContext,
    }, []);

    // Retrieve knowledge-base context using a mission-aware query so the recall
    // matches what this chapter is actually trying to do. Built after the
    // chapter write context so the query can fold in the chapter mission and
    // the participating characters rather than only the outline title/summary.
    const ragQuery = buildChapterRagQuery({
      chapterOrder: chapter.order,
      novelTitle: novel.title,
      chapterTitle: chapterWriteContext.chapterMission.title,
      objective: chapterWriteContext.chapterMission.objective,
      expectation: chapterWriteContext.chapterMission.expectation,
      mustAdvance: chapterWriteContext.chapterMission.mustAdvance,
      targetConflicts: chapterWriteContext.chapterStateGoal?.targetConflicts ?? [],
      participantNames: chapterWriteContext.participants.map((participant) => participant.name),
      structuredOutline: novel.structuredOutline ?? null,
    });
    let ragText = "";
    try {
      ragText = await ragServices.hybridRetrievalService.buildContextBlock(ragQuery, {
        novelId,
        currentChapterOrder: chapter.order,
      });
    } catch {
      ragText = "";
    }

    // Phase 2 缺陷6：用 sharedFields 展开，只补充派生字段，消除两遍手抄
    const contextPackage: GenerationContextPackage = {
      ...sharedFields,
      ragContext: ragText,
      chapterMission: chapterWriteContext.chapterMission,
      chapterWriteContext,
      chapterReviewContext,
      chapterRepairContext,
    };
    const compressionLog = buildCompressionLog(
      contextPackage.chapterWriteContext ? getAllContextBlocks(contextPackage) : [],
      2600,
    );
    console.debug("[ctx-budget]", compressionLog);

    return {
      novel: { id: novel.id, title: novel.title },
      chapter: {
        id: chapter.id,
        title: chapter.title,
        order: chapter.order,
        content: chapter.content ?? null,
        expectation: chapter.expectation ?? null,
        targetWordCount: chapter.targetWordCount ?? null,
        conflictLevel: chapter.conflictLevel ?? null,
        revealLevel: chapter.revealLevel ?? null,
        mustAvoid: chapter.mustAvoid ?? null,
        taskSheet: chapter.taskSheet ?? null,
        sceneCards: chapter.sceneCards ?? null,
        hook: chapter.hook ?? null,
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
