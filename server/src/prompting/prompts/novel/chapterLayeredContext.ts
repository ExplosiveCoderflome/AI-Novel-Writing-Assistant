import type {
  BookContractContext,
  ChapterExecutionObligationContract,
  ChapterMissionContext,
  ChapterRepairContext,
  ChapterReviewContext,
  ChapterWriteContext,
  GenerationContextPackage,
  MacroConstraintContext,
  PromptBudgetProfile,
  VolumeWindowContext,
} from "@ai-novel/shared/types/chapterRuntime";
import {
  parseChapterScenePlan,
  resolveLengthBudgetContract,
} from "@ai-novel/shared/types/chapterLengthControl";
import { sanitizeCreativeMustAdvanceItems } from "@ai-novel/shared/types/chapterCreativeContract";
import type { ReviewIssue } from "@ai-novel/shared/types/novel";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import { createContextBlock } from "../../core/contextBudget";
import type { PromptContextBlock } from "../../core/promptTypes";
import { buildWriterStyleContractText } from "../../../services/styleEngine/styleContractText";
import { buildDynamicCharacterGuidance, buildParticipants } from "./chapterLayeredContextCharacters";
import {
  buildCharacterGuidanceText,
  buildLedgerItemLine,
  buildParticipantText,
  buildPendingCandidateGuardText,
  buildRelationStageText,
  compactText,
  resolveTargetWordRange,
  splitLines,
  summarizeContinuationConstraints,
  summarizeHistoricalIssues,
  summarizeOpenConflicts,
  summarizeStateSnapshot,
  summarizeStyleConstraints,
  summarizeWorldRules,
  takeUnique,
  toListBlock,
} from "./chapterLayeredContextShared";
import { RUNTIME_PROMPT_BUDGET_PROFILES } from "./promptBudgetProfiles";
import { timelinePromptAdapter } from "../../../modules/timeline/timeline-prompt-adapter";

export const WRITER_FORBIDDEN_GROUPS = [
  "full_outline",
  "full_bible",
  "all_characters",
  "all_audit_issues",
  "anti_copy_corpus",
  "raw_rag_dump",
] as const;

export { resolveTargetWordRange } from "./chapterLayeredContextShared";

export type ChapterWriterBlockMode = "full" | "incremental" | "review" | "repair";

const EMPTY_OBLIGATION_CONTRACT: ChapterExecutionObligationContract = {
  mustHitNow: [],
  mustPreserve: [],
  requiredPayoffTouches: [],
  requiredCharacterAppearances: [],
  requiredGoalChanges: [],
  canDefer: [],
  forbiddenCrossings: [],
};

interface ChapterWriterBlockOptions {
  mode?: ChapterWriterBlockMode;
  incrementalContext?: {
    previousRoundSummary?: string | null;
    roundInstruction?: string | null;
    currentSceneProgress?: string | null;
  } | null;
}

type RuntimeVolumeSeed = {
  currentVolume?: {
    id?: string | null;
    sortOrder?: number | null;
    title?: string | null;
    summary?: string | null;
    mainPromise?: string | null;
    openPayoffs?: string[];
  } | null;
  previousVolume?: {
    title?: string | null;
    summary?: string | null;
  } | null;
  nextVolume?: {
    title?: string | null;
    summary?: string | null;
  } | null;
  softFutureSummary?: string;
};

export function buildBookContractContext(input: {
  title: string;
  genre?: string | null;
  targetAudience?: string | null;
  sellingPoint?: string | null;
  first30ChapterPromise?: string | null;
  narrativePov?: string | null;
  pacePreference?: string | null;
  emotionIntensity?: string | null;
  toneGuardrails?: string[];
  hardConstraints?: string[];
}): BookContractContext {
  return {
    title: compactText(input.title),
    genre: compactText(input.genre, "unknown"),
    targetAudience: compactText(input.targetAudience, "unknown"),
    sellingPoint: compactText(input.sellingPoint, "not specified"),
    first30ChapterPromise: compactText(input.first30ChapterPromise, "not specified"),
    narrativePov: compactText(input.narrativePov, "not specified"),
    pacePreference: compactText(input.pacePreference, "not specified"),
    emotionIntensity: compactText(input.emotionIntensity, "not specified"),
    toneGuardrails: takeUnique(input.toneGuardrails ?? [], 4),
    hardConstraints: takeUnique(input.hardConstraints ?? [], 6),
  };
}

export function buildMacroConstraintContext(storyMacroPlan: StoryMacroPlan | null): MacroConstraintContext | null {
  if (!storyMacroPlan) {
    return null;
  }
  return {
    sellingPoint: compactText(storyMacroPlan.decomposition?.selling_point, "not specified"),
    coreConflict: compactText(storyMacroPlan.decomposition?.core_conflict, "not specified"),
    mainHook: compactText(storyMacroPlan.decomposition?.main_hook, "not specified"),
    progressionLoop: compactText(storyMacroPlan.decomposition?.progression_loop, "not specified"),
    growthPath: compactText(storyMacroPlan.decomposition?.growth_path, "not specified"),
    endingFlavor: compactText(storyMacroPlan.decomposition?.ending_flavor, "not specified"),
    hardConstraints: takeUnique([
      ...(storyMacroPlan.constraints ?? []),
      ...(storyMacroPlan.constraintEngine?.hard_constraints ?? []),
    ], 8),
  };
}

export function buildVolumeWindowContext(seed: RuntimeVolumeSeed): VolumeWindowContext | null {
  const current = seed.currentVolume;
  if (!current?.title?.trim()) {
    return null;
  }
  const adjacentSummary = [
    seed.previousVolume?.title ? `previous: ${compactText(seed.previousVolume.title)} / ${compactText(seed.previousVolume.summary, "no summary")}` : "",
    seed.nextVolume?.title ? `next: ${compactText(seed.nextVolume.title)} / ${compactText(seed.nextVolume.summary, "no summary")}` : "",
  ].filter(Boolean).join("\n");
  return {
    volumeId: current.id ?? null,
    sortOrder: current.sortOrder ?? null,
    title: compactText(current.title),
    missionSummary: compactText(current.mainPromise || current.summary, "no volume mission"),
    adjacentSummary: adjacentSummary || "No adjacent volume summary.",
    pendingPayoffs: takeUnique(current.openPayoffs ?? [], 5),
    softFutureSummary: compactText(seed.softFutureSummary, "No future volume summary."),
    keyMilestoneGuards: [],
  };
}

export function buildChapterMissionContext(contextPackage: GenerationContextPackage): ChapterMissionContext {
  const stateGoal = contextPackage.chapterStateGoal;
  return {
    chapterId: contextPackage.chapter.id,
    chapterOrder: contextPackage.chapter.order,
    title: compactText(contextPackage.chapter.title),
    objective:
      compactText(stateGoal?.summary)
      || compactText(contextPackage.plan?.objective)
      || compactText(contextPackage.chapter.expectation, "Push the current chapter mission forward."),
    expectation:
      compactText(contextPackage.chapter.expectation)
      || compactText(stateGoal?.summary)
      || compactText(contextPackage.plan?.title, "Deliver the current chapter mission."),
    taskSheet: compactText(contextPackage.chapter.taskSheet) || null,
    targetWordCount: contextPackage.chapter.targetWordCount ?? null,
    planRole: contextPackage.plan?.planRole ?? null,
    hookTarget: compactText(contextPackage.plan?.hookTarget, "Leave a fresh tension point at the ending."),
    mustAdvance: sanitizeCreativeMustAdvanceItems(takeUnique([
      ...(stateGoal?.targetConflicts ?? []),
      ...(contextPackage.plan?.mustAdvance ?? []),
    ], 5)),
    mustPreserve: takeUnique([
      ...(stateGoal?.targetRelationships ?? []),
      ...(contextPackage.plan?.mustPreserve ?? []),
    ], 5),
    riskNotes: takeUnique([
      ...(contextPackage.protectedSecrets ?? []),
      ...(contextPackage.plan?.riskNotes ?? []),
    ], 5),
  };
}

export function buildNarrativeProgressHint(
  currentOrder: number,
  estimatedTotal: number | null | undefined,
): string | null {
  if (!estimatedTotal || estimatedTotal <= 0) return null;
  const progress = currentOrder / estimatedTotal;
  const remaining = estimatedTotal - currentOrder;
  if (progress < 0.25) {
    return `【叙事进度】第 ${currentOrder} 章 / 预计共 ${estimatedTotal} 章（${Math.round(progress * 100)}%）\n开局阶段：可自由展开世界与人物，建立读者期待。`;
  }
  if (progress < 0.75) {
    return `【叙事进度】第 ${currentOrder} 章 / 预计共 ${estimatedTotal} 章（${Math.round(progress * 100)}%）\n发展阶段：推进既有线索，谨慎开新支线，保持伏笔密度。`;
  }
  if (progress < 0.90) {
    return `【叙事进度】第 ${currentOrder} 章 / 预计共 ${estimatedTotal} 章（${Math.round(progress * 100)}%）\n收敛阶段：优先兑现已埋伏笔，避免新开主线，距结束还有约 ${remaining} 章。`;
  }
  return `【叙事进度】第 ${currentOrder} 章 / 预计共 ${estimatedTotal} 章（${Math.round(progress * 100)}%）\n尾声阶段：收束所有主线，为全书收尾，禁止开新支线。`;
}

function buildChapterBoundaryContract(
  contextPackage: GenerationContextPackage,
  scenePlan: ReturnType<typeof parseChapterScenePlan>,
): ChapterWriteContext["chapterBoundary"] {
  const scenes = scenePlan?.scenes ?? [];
  const firstScene = scenes[0] ?? null;
  const lastScene = scenes[scenes.length - 1] ?? null;
  const protectedReveals = takeUnique([
    ...(contextPackage.protectedSecrets ?? []),
    ...(contextPackage.chapterStateGoal?.protectedSecrets ?? []),
  ], 8);
  const doNotCross = takeUnique([
    compactText(contextPackage.chapter.mustAvoid),
    ...protectedReveals.map((item) => `不得提前揭露：${item}`),
    ...scenes.flatMap((scene) => scene.forbiddenExpansion ?? []),
    lastScene?.exitState ? `不得越过本章结束态：${lastScene.exitState}` : "",
    contextPackage.chapter.hook ? `不得直接展开钩子之后的后续事件：${contextPackage.chapter.hook}` : "",
  ], 12).filter(Boolean);

  return {
    exclusiveEvent: compactText(contextPackage.plan?.objective)
      || compactText(contextPackage.chapter.expectation)
      || compactText(contextPackage.plan?.title)
      || null,
    entryState: compactText(firstScene?.entryState) || null,
    endingState: compactText(lastScene?.exitState)
      || compactText(contextPackage.plan?.hookTarget)
      || compactText(contextPackage.chapter.hook)
      || null,
    nextChapterEntryState: compactText(contextPackage.chapter.hook)
      || compactText(contextPackage.plan?.hookTarget)
      || null,
    doNotCross,
    protectedReveals,
    allowedRevealLevel: contextPackage.chapter.revealLevel ?? null,
  };
}

export function buildChapterWriteContext(input: {
  bookContract: BookContractContext;
  macroConstraints: MacroConstraintContext | null;
  volumeWindow: VolumeWindowContext | null;
  contextPackage: GenerationContextPackage;
}): ChapterWriteContext {
  const dynamicCharacterGuidance = buildDynamicCharacterGuidance(input.contextPackage);
  const participants = buildParticipants(input.contextPackage, dynamicCharacterGuidance.characterBehaviorGuides);
  const characterHardFacts = selectCharacterHardFactsForWriter({
    hardFacts: input.contextPackage.characterHardFacts ?? [],
    participants,
    characterBehaviorGuides: dynamicCharacterGuidance.characterBehaviorGuides,
    currentChapterOrder: input.contextPackage.chapter.order,
  });
  const scenePlan = parseChapterScenePlan(input.contextPackage.chapter.sceneCards, {
    targetWordCount: input.contextPackage.chapter.targetWordCount ?? undefined,
  });
  return {
    bookContract: input.bookContract,
    macroConstraints: input.macroConstraints,
    volumeWindow: input.volumeWindow,
    narrativeProgressHint: input.contextPackage.narrativeProgressHint ?? null,
    chapterMission: buildChapterMissionContext(input.contextPackage),
    nextAction: input.contextPackage.nextAction,
    chapterStateGoal: input.contextPackage.chapterStateGoal ?? null,
    protectedSecrets: input.contextPackage.protectedSecrets ?? [],
    payoffDirectives: input.contextPackage.chapterStateGoal?.targetPayoffDirectives ?? [],
    obligationContract: buildChapterExecutionObligationContract({
      chapterOrder: input.contextPackage.chapter.order,
      chapterMission: buildChapterMissionContext(input.contextPackage),
      chapterStateGoal: input.contextPackage.chapterStateGoal ?? null,
      protectedSecrets: input.contextPackage.protectedSecrets ?? [],
      payoffDirectives: input.contextPackage.chapterStateGoal?.targetPayoffDirectives ?? [],
      chapterBoundary: buildChapterBoundaryContract(input.contextPackage, scenePlan),
      characterBehaviorGuides: dynamicCharacterGuidance.characterBehaviorGuides,
      ledgerPendingItems: input.contextPackage.ledgerPendingItems,
    }),
    chapterBoundary: buildChapterBoundaryContract(input.contextPackage, scenePlan),
    lengthBudget: resolveLengthBudgetContract(input.contextPackage.chapter.targetWordCount),
    scenePlan,
    participants,
    characterHardFacts,
    characterBehaviorGuides: dynamicCharacterGuidance.characterBehaviorGuides,
    activeRelationStages: dynamicCharacterGuidance.activeRelationStages,
    pendingCandidateGuards: dynamicCharacterGuidance.pendingCandidateGuards,
    localStateSummary: summarizeStateSnapshot(input.contextPackage),
    openConflictSummaries: summarizeOpenConflicts(input.contextPackage),
    ledgerPendingItems: input.contextPackage.ledgerPendingItems,
    ledgerUrgentItems: input.contextPackage.ledgerUrgentItems,
    ledgerOverdueItems: input.contextPackage.ledgerOverdueItems,
    ledgerSummary: input.contextPackage.ledgerSummary ?? null,
    timelineContext: input.contextPackage.timelineContext ?? null,
    characterResourceContext: input.contextPackage.characterResourceContext ?? null,
    recentChapterSummaries: takeUnique(input.contextPackage.previousChaptersSummary.slice(0, 3), 3),
    previousChapterTail: compactText(input.contextPackage.previousChapterTail) || null,
    openingAntiRepeatHint: compactText(input.contextPackage.openingHint, "No recent opening guidance."),
    styleContract: input.contextPackage.styleContext?.compiledBlocks?.contract ?? null,
    styleConstraints: summarizeStyleConstraints(input.contextPackage),
    continuationConstraints: summarizeContinuationConstraints(input.contextPackage),
    ragFacts: [],
  completedMilestones: [],
  recentScenePatterns: [],
  };
}

function uniqueStrings(items: Array<string | null | undefined>): string[] {
  return Array.from(new Set(items.map((item) => item?.trim()).filter((item): item is string => Boolean(item))));
}

function buildChapterExecutionObligationContract(input: {
  chapterOrder: number;
  chapterMission: ChapterWriteContext["chapterMission"];
  chapterStateGoal: ChapterWriteContext["chapterStateGoal"];
  protectedSecrets: string[];
  payoffDirectives: ChapterWriteContext["payoffDirectives"];
  chapterBoundary: ChapterWriteContext["chapterBoundary"];
  characterBehaviorGuides: ChapterWriteContext["characterBehaviorGuides"];
  ledgerPendingItems: ChapterWriteContext["ledgerPendingItems"];
}): ChapterWriteContext["obligationContract"] {
  return {
    mustHitNow: uniqueStrings(input.chapterMission.mustAdvance),
    mustPreserve: uniqueStrings(input.chapterMission.mustPreserve),
    requiredPayoffTouches: uniqueStrings(input.payoffDirectives.map((item) => (
      `${item.operation}: ${item.title}`
    ))),
    requiredCharacterAppearances: uniqueStrings(input.characterBehaviorGuides
      .filter((guide) => (
        guide.shouldPreferAppearance
        || guide.plannedChapterOrders.includes(input.chapterOrder)
      ))
      .map((guide) => {
        if (guide.absenceRisk === "high" && guide.absenceSpan > 0) {
          return `${guide.name}（已缺席 ${guide.absenceSpan} 章，宜自然带出）`;
        }
        return guide.name;
      })),
    requiredGoalChanges: uniqueStrings([
      ...(input.chapterStateGoal?.targetRelationships ?? []),
      ...(input.chapterStateGoal?.targetConflicts ?? []),
    ]),
    canDefer: uniqueStrings(input.ledgerPendingItems.map((item) => item.title)),
    forbiddenCrossings: uniqueStrings([
      ...input.protectedSecrets,
      ...(input.chapterBoundary?.doNotCross ?? []),
      ...(input.chapterBoundary?.protectedReveals ?? []),
    ]),
  };
}

function normalizeChapterWriteContext(writeContext: ChapterWriteContext): ChapterWriteContext {
  const legacyContext = writeContext as ChapterWriteContext & {
    obligationContract?: Partial<ChapterExecutionObligationContract> | null;
  };
  const obligationContract = legacyContext.obligationContract ?? {};
  return {
    ...writeContext,
    volumeWindow: writeContext.volumeWindow
      ? {
        ...writeContext.volumeWindow,
        keyMilestoneGuards: writeContext.volumeWindow.keyMilestoneGuards ?? [],
      }
      : null,
    narrativeProgressHint: writeContext.narrativeProgressHint ?? null,
    obligationContract: {
      mustHitNow: obligationContract.mustHitNow ?? EMPTY_OBLIGATION_CONTRACT.mustHitNow,
      mustPreserve: obligationContract.mustPreserve ?? EMPTY_OBLIGATION_CONTRACT.mustPreserve,
      requiredPayoffTouches: obligationContract.requiredPayoffTouches ?? EMPTY_OBLIGATION_CONTRACT.requiredPayoffTouches,
      requiredCharacterAppearances: obligationContract.requiredCharacterAppearances ?? EMPTY_OBLIGATION_CONTRACT.requiredCharacterAppearances,
      requiredGoalChanges: obligationContract.requiredGoalChanges ?? EMPTY_OBLIGATION_CONTRACT.requiredGoalChanges,
      canDefer: obligationContract.canDefer ?? EMPTY_OBLIGATION_CONTRACT.canDefer,
      forbiddenCrossings: obligationContract.forbiddenCrossings ?? EMPTY_OBLIGATION_CONTRACT.forbiddenCrossings,
    },
    characterHardFacts: writeContext.characterHardFacts ?? [],
    previousChapterTail: writeContext.previousChapterTail ?? null,
    styleConstraints: writeContext.styleConstraints ?? [],
    continuationConstraints: writeContext.continuationConstraints ?? [],
    ragFacts: writeContext.ragFacts ?? [],
    completedMilestones: writeContext.completedMilestones ?? [],
    recentScenePatterns: writeContext.recentScenePatterns ?? [],
  };
}

export function buildChapterReviewContext(
  writeContext: ChapterWriteContext,
  contextPackage: GenerationContextPackage,
): ChapterReviewContext {
  writeContext = normalizeChapterWriteContext(writeContext);
  return {
    ...writeContext,
    structureObligations: takeUnique([
      ...writeContext.chapterMission.mustAdvance,
      ...writeContext.chapterMission.mustPreserve,
      ...writeContext.obligationContract.mustHitNow.map((item) => `must hit now: ${item}`),
      ...writeContext.obligationContract.requiredCharacterAppearances.map((item) => `required character appearance: ${item}`),
      ...writeContext.obligationContract.requiredGoalChanges.map((item) => `required goal change: ${item}`),
      ...writeContext.payoffDirectives.map((item) => `payoff directive: ${item.operation} ${item.title}${item.forbiddenReveal ? ` / protected: ${item.forbiddenReveal}` : ""}`),
      ...(writeContext.chapterStateGoal?.targetConflicts ?? []).map((item) => `state conflict: ${item}`),
      ...(writeContext.chapterBoundary?.doNotCross ?? []).map((item) => `boundary do-not-cross: ${item}`),
      writeContext.chapterMission.hookTarget ? `hook target: ${writeContext.chapterMission.hookTarget}` : "",
      writeContext.volumeWindow?.missionSummary ? `volume mission: ${writeContext.volumeWindow.missionSummary}` : "",
      ...(writeContext.characterResourceContext?.setupNeededItems ?? []).map((item) => `resource setup needed: ${item.name} / ${item.summary}`),
      ...(writeContext.characterResourceContext?.blockedItems ?? []).map((item) => `resource unavailable: ${item.name} is ${item.status}; do not use it without repair setup`),
      ...(writeContext.characterResourceContext?.highRiskCommittedItems ?? []).map((item) => `committed high-risk resource: ${item.name} / ${item.summary}; use cautiously`),
      ...(writeContext.characterResourceContext?.pendingProposalItems ?? []).map((item) => `unconfirmed resource proposal: ${item.summary}; do not treat as committed fact`),
      ...writeContext.ledgerPendingItems.map((item) => buildLedgerItemLine(item, "pending payoff")),
      ...writeContext.ledgerUrgentItems.map((item) => buildLedgerItemLine(item, "urgent payoff")),
      ...writeContext.ledgerOverdueItems.map((item) => buildLedgerItemLine(item, "overdue payoff")),
    ], 32),
    worldRules: summarizeWorldRules(contextPackage),
    historicalIssues: summarizeHistoricalIssues(contextPackage),
  };
}

export function buildChapterRepairContext(input: {
  writeContext: ChapterWriteContext;
  contextPackage: GenerationContextPackage;
  issues: ReviewIssue[];
}): ChapterRepairContext {
  const writeContext = normalizeChapterWriteContext(input.writeContext);
  return {
    writeContext,
    issues: input.issues.slice(0, 8).map((issue) => ({
      severity: issue.severity,
      category: issue.category,
      evidence: compactText(issue.evidence),
      fixSuggestion: compactText(issue.fixSuggestion),
    })),
    structureObligations: takeUnique([
      ...writeContext.chapterMission.mustAdvance,
      ...writeContext.chapterMission.mustPreserve,
      ...writeContext.obligationContract.mustHitNow.map((item) => `must hit now: ${item}`),
      ...writeContext.obligationContract.requiredCharacterAppearances.map((item) => `required character appearance: ${item}`),
      ...writeContext.obligationContract.requiredGoalChanges.map((item) => `required goal change: ${item}`),
      ...writeContext.payoffDirectives.map((item) => `payoff directive: ${item.operation} ${item.title}${item.forbiddenReveal ? ` / protected: ${item.forbiddenReveal}` : ""}`),
      ...(writeContext.chapterStateGoal?.targetConflicts ?? []).map((item) => `state conflict: ${item}`),
      ...(writeContext.chapterBoundary?.doNotCross ?? []).map((item) => `boundary do-not-cross: ${item}`),
      writeContext.volumeWindow?.missionSummary
        ? `volume mission: ${writeContext.volumeWindow.missionSummary}`
        : "",
      ...(writeContext.characterResourceContext?.setupNeededItems ?? []).map((item) => `resource setup needed: ${item.name} / ${item.summary}`),
      ...(writeContext.characterResourceContext?.blockedItems ?? []).map((item) => `resource unavailable: ${item.name} is ${item.status}; patch locally before use`),
      ...writeContext.ledgerPendingItems.map((item) => buildLedgerItemLine(item, "pending payoff")),
      ...writeContext.ledgerUrgentItems.map((item) => buildLedgerItemLine(item, "urgent payoff")),
      ...writeContext.ledgerOverdueItems.map((item) => buildLedgerItemLine(item, "overdue payoff")),
    ], 32),
    worldRules: summarizeWorldRules(input.contextPackage),
    historicalIssues: summarizeHistoricalIssues(input.contextPackage),
    allowedEditBoundaries: takeUnique([
      "Keep the chapter's established objective, participants, and major outcome direction intact.",
      "Do not introduce new core characters, new world rules, or off-outline twists.",
      writeContext.volumeWindow?.missionSummary
        ? `Keep the repair aligned with the current volume mission: ${writeContext.volumeWindow.missionSummary}`
        : "",
      ...(writeContext.protectedSecrets ?? []).map((item) => `do not disclose: ${item}`),
      writeContext.pendingCandidateGuards.length > 0
        ? "Pending character candidates remain read-only unless they are confirmed outside the repair flow."
        : "",
      ...writeContext.ledgerPendingItems.map((item) => `Do not erase pending payoff setup: ${item.title}`),
      ...writeContext.ledgerUrgentItems.map((item) => `This chapter must visibly touch the urgent payoff thread: ${item.title}`),
      ...writeContext.ledgerOverdueItems.map((item) => `You must either兑现 or explicitly explain the overdue payoff pressure: ${item.title}`),
      ...(writeContext.characterResourceContext?.blockedItems ?? []).map((item) => `Patch resource continuity before using ${item.name}; current status is ${item.status}.`),
      ...(writeContext.characterResourceContext?.highRiskCommittedItems ?? []).map((item) => `Do not create a new irreversible resource fact from high-risk committed item: ${item.name}.`),
      ...(writeContext.characterResourceContext?.pendingProposalItems ?? []).map((item) => `Pending proposal is not committed yet; do not write it as fact: ${item.summary}.`),
      writeContext.chapterMission.hookTarget
        ? `Preserve or strengthen the ending tension: ${writeContext.chapterMission.hookTarget}`
        : "",
      ...writeContext.characterBehaviorGuides
        .filter((guide) => guide.shouldPreferAppearance || guide.isCoreInVolume)
        .slice(0, 4)
        .map((guide) => `Keep ${guide.name} aligned with current role duty: ${guide.volumeResponsibility ?? guide.volumeRoleLabel ?? guide.role}`),
      ...(writeContext.chapterBoundary?.doNotCross ?? []).map((item) => `do not cross boundary: ${item}`),
      ...writeContext.chapterMission.mustPreserve.map((item) => `must preserve: ${item}`),
    ], 12),
  };
}

export function sanitizeWriterContextBlocks(blocks: PromptContextBlock[]): {
  allowedBlocks: PromptContextBlock[];
  removedBlockIds: string[];
} {
  const forbidden = new Set<string>(WRITER_FORBIDDEN_GROUPS);
  const removedBlockIds = blocks
    .filter((block) => forbidden.has(block.group))
    .map((block) => block.id);
  return {
    allowedBlocks: blocks.filter((block) => !forbidden.has(block.group)),
    removedBlockIds,
  };
}

function hasLedgerPressure(writeContext: ChapterWriteContext): boolean {
  return writeContext.ledgerUrgentItems.length > 0
    || writeContext.ledgerOverdueItems.length > 0
    || writeContext.ledgerPendingItems.length > 0;
}

function hasCharacterResourcePressure(writeContext: ChapterWriteContext): boolean {
  const context = writeContext.characterResourceContext;
  if (!context) {
    return false;
  }
  return context.availableItems.length > 0
    || context.setupNeededItems.length > 0
    || context.blockedItems.length > 0
    || context.highRiskCommittedItems.length > 0
    || context.pendingProposalItems.length > 0
    || context.riskSignals.length > 0;
}

function selectCharacterHardFactsForWriter(input: {
  hardFacts: ChapterWriteContext["characterHardFacts"];
  participants: ChapterWriteContext["participants"];
  characterBehaviorGuides: ChapterWriteContext["characterBehaviorGuides"];
  currentChapterOrder: number;
}): ChapterWriteContext["characterHardFacts"] {
  const selectedIds = new Set(input.participants.map((character) => character.id));
  for (const guide of input.characterBehaviorGuides) {
    if (
      guide.shouldPreferAppearance
      || guide.plannedChapterOrders.includes(input.currentChapterOrder)
      || guide.absenceRisk === "high"
      || guide.absenceRisk === "warn"
      || guide.relationStageLabels.length > 0
    ) {
      selectedIds.add(guide.characterId);
    }
  }
  const selected = input.hardFacts.filter((fact) => selectedIds.has(fact.characterId));
  return selected.length > 0 ? selected.slice(0, 8) : input.hardFacts.slice(0, 4);
}

function buildCharacterHardFactsText(writeContext: ChapterWriteContext): string {
  const hardFacts = writeContext.characterHardFacts ?? [];
  if (hardFacts.length === 0) {
    return [
      "【角色硬事实】",
      "当前没有已登记的角色硬事实；不得凭空改写角色阵营、身份、境界、所在地或行动可用性。",
      "如章节任务没有明确要求，不要新增不可逆角色状态。",
    ].join("\n");
  }

  return [
    "【角色硬事实】",
    "以下内容是正文生成前的不可违背写作约束，优先级高于软性人物简介。",
    ...hardFacts.slice(0, 8).map((fact) => {
      const parts = takeUnique([
        fact.role ? `角色定位=${fact.role}` : "",
        fact.identityLabel ? `身份=${fact.identityLabel}` : "",
        fact.factionLabel ? `阵营=${fact.factionLabel}` : "",
        fact.stanceLabel ? `立场=${fact.stanceLabel}` : "",
        fact.powerLevel ? `战力=${fact.powerLevel}` : "",
        fact.realm ? `境界=${fact.realm}` : "",
        fact.currentLocation ? `当前位置=${fact.currentLocation}` : "",
        fact.availability ? `可出场状态=${fact.availability}` : "",
        fact.currentState ? `当前状态=${fact.currentState}` : "",
        fact.currentGoal ? `当前目标=${fact.currentGoal}` : "",
        fact.prohibitions.length > 0 ? `禁止误写=${fact.prohibitions.join(" / ")}` : "",
      ], 12);
      return `- ${fact.name}: ${parts.join(" | ")}`;
    }),
  ].join("\n");
}

function buildResourceItemLine(item: NonNullable<ChapterWriteContext["characterResourceContext"]>["availableItems"][number]): string {
  const holder = item.holderCharacterName ? `holder=${item.holderCharacterName}` : "holder=unknown";
  const window = item.expectedUseStartChapterOrder || item.expectedUseEndChapterOrder
    ? `window=${item.expectedUseStartChapterOrder ?? "?"}-${item.expectedUseEndChapterOrder ?? "?"}`
    : "";
  const constraints = item.constraints.length > 0 ? `constraints=${item.constraints.slice(0, 2).join(" / ")}` : "";
  return `${item.name} [${item.status}; ${holder}; ${item.narrativeFunction}] ${item.summary}${window ? ` | ${window}` : ""}${constraints ? ` | ${constraints}` : ""}`;
}

function buildResourceProposalLine(item: NonNullable<ChapterWriteContext["characterResourceContext"]>["pendingProposalItems"][number]): string {
  const evidence = item.evidence[0] ? ` | evidence=${item.evidence[0]}` : "";
  return `${item.summary} [risk=${item.riskLevel}; status=${item.status}]${evidence}`;
}

function buildCharacterResourceContextBlock(writeContext: ChapterWriteContext): string {
  const context = writeContext.characterResourceContext;
  if (!context) {
    return "";
  }
  return [
    `Resource ledger summary: ${context.summary}`,
    toListBlock("Available resources", context.availableItems.slice(0, 6).map(buildResourceItemLine)),
    toListBlock("Needs setup before use", context.setupNeededItems.slice(0, 5).map(buildResourceItemLine)),
    toListBlock("Unavailable or risky to reuse", context.blockedItems.slice(0, 5).map(buildResourceItemLine)),
    toListBlock("High-risk committed resources", context.highRiskCommittedItems.slice(0, 4).map(buildResourceItemLine)),
    toListBlock("Pending resource proposals (not committed)", context.pendingProposalItems.slice(0, 4).map(buildResourceProposalLine)),
    toListBlock("Resource risk signals", context.riskSignals.slice(0, 5).map((item) => `${item.severity}: ${item.summary}`)),
  ].filter(Boolean).join("\n");
}

function shouldIncludeCharacterDynamics(
  writeContext: ChapterWriteContext,
  mode: ChapterWriterBlockMode,
): boolean {
  if (mode === "incremental") {
    return writeContext.activeRelationStages.length > 0
      || writeContext.pendingCandidateGuards.length > 0;
  }
  if (mode === "repair") {
    return writeContext.characterBehaviorGuides.length > 0 || writeContext.activeRelationStages.length > 0;
  }
  return writeContext.characterBehaviorGuides.length > 0
    || writeContext.activeRelationStages.length > 0
    || writeContext.pendingCandidateGuards.length > 0;
}

function buildIncrementalRoundContextBlock(
  incrementalContext: ChapterWriterBlockOptions["incrementalContext"],
): PromptContextBlock | null {
  if (!incrementalContext) {
    return null;
  }
  const content = [
    incrementalContext.previousRoundSummary?.trim()
      ? `Previous round summary: ${incrementalContext.previousRoundSummary.trim()}`
      : "",
    incrementalContext.currentSceneProgress?.trim()
      ? `Current scene progress: ${incrementalContext.currentSceneProgress.trim()}`
      : "",
    incrementalContext.roundInstruction?.trim()
      ? `Current round instruction: ${incrementalContext.roundInstruction.trim()}`
      : "",
  ].filter(Boolean).join("\n");
  if (!content) {
    return null;
  }
  return createContextBlock({
    id: "incremental_round_context",
    group: "incremental_round_context",
    priority: 99,
    required: true,
    content,
  });
}

export function buildChapterWriterContextBlocks(
  writeContext: ChapterWriteContext,
  options: ChapterWriterBlockOptions = {},
): PromptContextBlock[] {
  writeContext = normalizeChapterWriteContext(writeContext);
  const mode = options.mode ?? "full";
  const isIncremental = mode === "incremental";
  const includeVolumeWindow = mode === "full" || mode === "review";
  const includePayoffLedger = mode === "full" && hasLedgerPressure(writeContext);
  const includePayoffDirectives = writeContext.payoffDirectives.length > 0;
  const includeTimelineContext = Boolean(writeContext.timelineContext);
  const hasObligationContract = Object.values(writeContext.obligationContract).some((items) => items.length > 0);
  const includeCharacterResources = !isIncremental && hasCharacterResourcePressure(writeContext);
  const includeCharacterDynamics = shouldIncludeCharacterDynamics(writeContext, mode);
  const includeOpenConflicts = !isIncremental && writeContext.openConflictSummaries.length > 0;
  const includeRecentChapters = mode === "full" && writeContext.recentChapterSummaries.length > 0;
  const includeStyleContract = mode !== "incremental" && Boolean(writeContext.styleContract);
  const includeContinuationConstraints = mode === "full" && writeContext.continuationConstraints.length > 0;
  const wordRange = resolveTargetWordRange(writeContext.chapterMission.targetWordCount);
  const blocks: Array<PromptContextBlock | null> = [
    createContextBlock({
      id: "chapter_mission",
      group: "chapter_mission",
      priority: 100,
      required: true,
      content: [
        `Chapter mission: ${writeContext.chapterMission.title}`,
        `Objective: ${writeContext.chapterMission.objective}`,
        `Expectation: ${writeContext.chapterMission.expectation}`,
        `State-driven next action: ${writeContext.nextAction}`,
        writeContext.chapterMission.planRole ? `Plan role: ${writeContext.chapterMission.planRole}` : "",
        wordRange.targetWordCount != null
          ? `Target length: around ${wordRange.targetWordCount} Chinese characters (acceptable range ${wordRange.minWordCount}-${wordRange.maxWordCount}; do not end clearly below the minimum).`
          : "",
        writeContext.completedMilestones.length > 0
          ? toListBlock("Already completed — do NOT re-pursue or re-trigger", writeContext.completedMilestones)
          : "",
        toListBlock("Must advance", writeContext.chapterMission.mustAdvance),
        toListBlock("Must preserve", writeContext.chapterMission.mustPreserve),
        toListBlock("Risk notes", writeContext.chapterMission.riskNotes),
        writeContext.chapterMission.taskSheet
          ? `Original task sheet:\n${writeContext.chapterMission.taskSheet}`
          : "",
        writeContext.chapterMission.hookTarget ? `Ending hook: ${writeContext.chapterMission.hookTarget}` : "",
      ].filter(Boolean).join("\n"),
    }),
    writeContext.previousChapterTail
      ? createContextBlock({
        id: "previous_chapter_tail",
        group: "previous_chapter_tail",
        priority: 100,
        required: true,
        allowSummary: false,
        content: [
          "上一章实际尾段（本章开头必须直接承接这里的时间、地点、人物状态和未兑现动作）：",
          writeContext.previousChapterTail,
        ].join("\n"),
      })
      : null,
    hasObligationContract
      ? createContextBlock({
        id: "obligation_contract",
        group: "obligation_contract",
        priority: 99,
        required: true,
        allowSummary: false,
        content: [
          "Chapter execution obligations:",
          toListBlock("Must hit now", writeContext.obligationContract.mustHitNow),
          toListBlock("Must preserve", writeContext.obligationContract.mustPreserve),
          toListBlock("Required payoff touches", writeContext.obligationContract.requiredPayoffTouches),
          toListBlock("Required character appearances", writeContext.obligationContract.requiredCharacterAppearances),
          toListBlock("Required goal changes", writeContext.obligationContract.requiredGoalChanges),
          toListBlock("Can defer", writeContext.obligationContract.canDefer),
          toListBlock("Forbidden crossings", writeContext.obligationContract.forbiddenCrossings),
        ].filter(Boolean).join("\n"),
      })
      : null,
    includeTimelineContext
      ? createContextBlock({
        id: "timeline_context",
        group: "timeline_context",
        priority: 100,
        required: true,
        allowSummary: false,
        content: timelinePromptAdapter.toPromptBlock(writeContext.timelineContext!),
      })
      : createContextBlock({
        id: "timeline_context",
        group: "timeline_context",
        priority: 100,
        required: true,
        allowSummary: false,
        content: "【时间线约束】\n当前没有已登记的时间线资产；不得提前发生后续章节事件，必须严格服从本章任务和上一章实际状态。",
      }),
    includeTimelineContext
      ? createContextBlock({
        id: "previous_chapter_hook",
        group: "previous_chapter_hook",
        priority: 100,
        required: true,
        allowSummary: false,
        content: timelinePromptAdapter.toPreviousHookBlock(writeContext.timelineContext!),
      })
      : createContextBlock({
        id: "previous_chapter_hook",
        group: "previous_chapter_hook",
        priority: 100,
        required: true,
        allowSummary: false,
        content: "【上一章必须承接的钩子】\n- 无已登记钩子；如章节任务或最近状态包含上一章悬念，必须优先承接。",
      }),
    includePayoffDirectives
      ? createContextBlock({
        id: "payoff_directives",
        group: "payoff_directives",
        priority: 98,
        required: true,
        allowSummary: false,
        content: [
          "Payoff directives:",
          ...writeContext.payoffDirectives.map((item) => [
            `- ${item.title} [${item.operation}]`,
            item.ledgerKey ? `ledger=${item.ledgerKey}` : "",
            item.reason ? `reason=${item.reason}` : "",
            item.forbiddenReveal ? `forbiddenReveal=${item.forbiddenReveal}` : "",
          ].filter(Boolean).join(" | ")),
        ].join("\n"),
      })
      : null,
    createContextBlock({
      id: "state_goal",
      group: "state_goal",
      priority: 97,
      required: Boolean(writeContext.chapterStateGoal),
      content: writeContext.chapterStateGoal
        ? [
             `State goal: ${writeContext.chapterStateGoal.summary}`,
             toListBlock("Target conflicts", writeContext.chapterStateGoal.targetConflicts),
             toListBlock("Target relationships", writeContext.chapterStateGoal.targetRelationships),
             toListBlock("Protected secrets", writeContext.protectedSecrets),
           ].filter(Boolean).join("\n")
        : "",
    }),
    buildIncrementalRoundContextBlock(options.incrementalContext),
    includeVolumeWindow
      ? createContextBlock({
        id: "volume_window",
        group: "volume_window",
        priority: 96,
        content: writeContext.volumeWindow
          ? [
              `Current volume: ${writeContext.volumeWindow.title}`,
              `Volume mission: ${writeContext.volumeWindow.missionSummary}`,
              toListBlock("Current volume pending payoffs", writeContext.volumeWindow.pendingPayoffs.slice(0, 3)),
              writeContext.volumeWindow.keyMilestoneGuards.length > 0
                ? toListBlock(
                  "Volume key milestone guards — pacing constraints",
                  writeContext.volumeWindow.keyMilestoneGuards
                    .filter((guard) => guard.status !== "done")
                    .map((guard) => `[${guard.targetChapterRange}] ${guard.event}: ${guard.note}`),
                )
                : "",
            ].filter(Boolean).join("\n")
          : "Current volume: none",
      })
      : null,
    writeContext.narrativeProgressHint
      ? createContextBlock({
        id: "narrative_progress_hint",
        group: "narrative_progress_hint",
        priority: 98,
        required: false,
        content: writeContext.narrativeProgressHint,
      })
      : null,
    includePayoffLedger
      ? createContextBlock({
        id: "payoff_ledger",
        group: "payoff_ledger",
        priority: 95,
        content: [
          writeContext.ledgerSummary
            ? `Payoff ledger summary: pending=${writeContext.ledgerSummary.pendingCount}, urgent=${writeContext.ledgerSummary.urgentCount}, overdue=${writeContext.ledgerSummary.overdueCount}`
            : "Payoff ledger summary: none",
          toListBlock("Urgent payoffs", writeContext.ledgerUrgentItems.map((item) => buildLedgerItemLine(item, "urgent"))),
          toListBlock("Overdue payoffs", writeContext.ledgerOverdueItems.map((item) => buildLedgerItemLine(item, "overdue"))),
          toListBlock(
            "Active pending payoffs",
            writeContext.ledgerPendingItems.slice(0, 3).map((item) => buildLedgerItemLine(item, "pending")),
          ),
        ].join("\n"),
      })
      : null,
    createContextBlock({
      id: "character_hard_facts",
      group: "character_hard_facts",
      priority: 99,
      required: true,
      allowSummary: false,
      content: buildCharacterHardFactsText(writeContext),
    }),
    createContextBlock({
      id: "participant_subset",
      group: "participant_subset",
      priority: 92,
      required: true,
      content: buildParticipantText(writeContext),
    }),
    includeCharacterDynamics
      ? createContextBlock({
        id: "character_dynamics",
        group: "character_dynamics",
        priority: 91,
        content: [
          buildCharacterGuidanceText(writeContext),
          buildRelationStageText(writeContext),
          buildPendingCandidateGuardText(writeContext),
        ].join("\n\n"),
      })
      : null,
    includeCharacterResources
      ? createContextBlock({
        id: "character_resource_context",
        group: "character_resource_context",
        priority: 90,
        required: mode === "review" || mode === "repair",
        content: buildCharacterResourceContextBlock(writeContext),
      })
      : null,
    createContextBlock({
      id: "local_state",
      group: "local_state",
      priority: 89,
      required: true,
      content: `Local state before writing:\n${writeContext.localStateSummary}`,
    }),
    includeOpenConflicts
      ? createContextBlock({
        id: "open_conflicts",
        group: "open_conflicts",
        priority: 88,
        content: toListBlock("Open conflicts", writeContext.openConflictSummaries.slice(0, 6)),
      })
      : null,
    includeRecentChapters
      ? createContextBlock({
        id: "recent_chapters",
        group: "recent_chapters",
        priority: 86,
        content: toListBlock("Recent chapter summaries", writeContext.recentChapterSummaries),
      })
      : null,
    mode === "full"
      ? createContextBlock({
        id: "opening_constraints",
        group: "opening_constraints",
        priority: 80,
        content: [
          `Opening anti-repeat hint:\n${writeContext.openingAntiRepeatHint}`,
          writeContext.recentScenePatterns.length > 0
            ? toListBlock(
              "Scene pattern blacklist — do NOT repeat these exact time+location+action combinations",
              writeContext.recentScenePatterns.slice(0, 6),
            )
            : "",
        ].filter(Boolean).join("\n\n"),
      })
      : null,
    includeStyleContract
      ? createContextBlock({
        id: "style_contract",
        group: "style_contract",
        priority: 74,
        required: mode === "full",
        content: buildWriterStyleContractText(writeContext.styleContract),
      })
      : null,
    includeContinuationConstraints
      ? createContextBlock({
        id: "continuation_constraints",
        group: "continuation_constraints",
        priority: 72,
        content: toListBlock("Continuation constraints", writeContext.continuationConstraints),
      })
      : null,
  ];
  return blocks.filter((block): block is PromptContextBlock => block !== null && block.content.trim().length > 0);
}

export function buildChapterReviewContextBlocks(reviewContext: ChapterReviewContext): PromptContextBlock[] {
  return [
    ...buildChapterWriterContextBlocks(reviewContext, { mode: "review" }),
    createContextBlock({
      id: "structure_obligations",
      group: "structure_obligations",
      priority: 94,
      required: true,
      content: toListBlock("Structure obligations", reviewContext.structureObligations),
    }),
    createContextBlock({
      id: "world_rules",
      group: "world_rules",
      priority: 84,
      content: toListBlock("Relevant world rules", reviewContext.worldRules),
    }),
    createContextBlock({
      id: "historical_issues",
      group: "historical_issues",
      priority: 82,
      content: toListBlock("Historical unresolved issues", reviewContext.historicalIssues),
    }),
  ].filter((block) => block.content.trim().length > 0);
}

export function buildChapterRepairContextBlocks(repairContext: ChapterRepairContext): PromptContextBlock[] {
  return [
    ...buildChapterWriterContextBlocks(repairContext.writeContext, { mode: "repair" }),
    createContextBlock({
      id: "repair_issues",
      group: "repair_issues",
      priority: 100,
      required: true,
      content: repairContext.issues.length > 0
        ? [
            "Repair issues:",
            ...repairContext.issues.map((issue) => (
              `- ${issue.severity}/${issue.category}: ${issue.evidence} | fix: ${issue.fixSuggestion}`
            )),
          ].join("\n")
        : "Repair issues: none",
    }),
    createContextBlock({
      id: "structure_obligations",
      group: "structure_obligations",
      priority: 95,
      required: true,
      content: toListBlock("Structure obligations", repairContext.structureObligations),
    }),
    createContextBlock({
      id: "repair_boundaries",
      group: "repair_boundaries",
      priority: 96,
      required: true,
      content: toListBlock("Allowed edit boundaries", repairContext.allowedEditBoundaries),
    }),
    createContextBlock({
      id: "world_rules",
      group: "world_rules",
      priority: 84,
      content: toListBlock("Relevant world rules", repairContext.worldRules),
    }),
    createContextBlock({
      id: "historical_issues",
      group: "historical_issues",
      priority: 82,
      content: toListBlock("Historical unresolved issues", repairContext.historicalIssues),
    }),
  ].filter((block) => block.content.trim().length > 0);
}

export function getRuntimePromptBudgetProfiles(): PromptBudgetProfile[] {
  return RUNTIME_PROMPT_BUDGET_PROFILES;
}

export function getAllContextBlocks(contextPackage: GenerationContextPackage): PromptContextBlock[] {
  const writeContext = contextPackage.chapterWriteContext;
  if (!writeContext) {
    return [];
  }

  const blocks: PromptContextBlock[] = [
    createContextBlock({
      id: "book_contract",
      group: "book_contract",
      priority: 100,
      required: true,
      content: [
        `Title: ${writeContext.bookContract.title}`,
        `Genre: ${writeContext.bookContract.genre}`,
        `Target audience: ${writeContext.bookContract.targetAudience}`,
        `Selling point: ${writeContext.bookContract.sellingPoint}`,
        `First 30 chapter promise: ${writeContext.bookContract.first30ChapterPromise}`,
        `Narrative POV: ${writeContext.bookContract.narrativePov}`,
        `Pace preference: ${writeContext.bookContract.pacePreference}`,
        `Emotion intensity: ${writeContext.bookContract.emotionIntensity}`,
        writeContext.bookContract.toneGuardrails.length > 0 ? `Tone guardrails: ${writeContext.bookContract.toneGuardrails.join(" | ")}` : "",
        writeContext.bookContract.hardConstraints.length > 0 ? `Hard constraints: ${writeContext.bookContract.hardConstraints.join(" | ")}` : "",
      ].filter(Boolean).join("\n"),
    }),
    ...buildChapterWriterContextBlocks(writeContext),
  ];
  if (writeContext.macroConstraints) {
    blocks.push(createContextBlock({
      id: "story_macro",
      group: "story_macro",
      priority: 98,
      content: [
        `Selling point: ${writeContext.macroConstraints.sellingPoint}`,
        `Core conflict: ${writeContext.macroConstraints.coreConflict}`,
        `Main hook: ${writeContext.macroConstraints.mainHook}`,
        `Progression loop: ${writeContext.macroConstraints.progressionLoop}`,
        `Growth path: ${writeContext.macroConstraints.growthPath}`,
        `Ending flavor: ${writeContext.macroConstraints.endingFlavor}`,
        writeContext.macroConstraints.hardConstraints.length > 0 ? `Hard constraints: ${writeContext.macroConstraints.hardConstraints.join(" | ")}` : "",
      ].filter(Boolean).join("\n"),
    }));
  }
  if (contextPackage.ragContext.trim()) {
    blocks.push(createContextBlock({
      id: "rag_context",
      group: "rag_context",
      priority: 60,
      content: contextPackage.ragContext,
    }));
  }
  return blocks;
}

export function buildChapterRepairContextFromPackage(
  contextPackage: GenerationContextPackage,
  issues: ReviewIssue[],
): ChapterRepairContext | null {
  if (!contextPackage.chapterWriteContext) {
    return null;
  }
  return buildChapterRepairContext({
    writeContext: contextPackage.chapterWriteContext,
    contextPackage,
    issues,
  });
}

export function withChapterRepairContext(
  contextPackage: GenerationContextPackage,
  issues: ReviewIssue[],
): GenerationContextPackage {
  const chapterRepairContext = buildChapterRepairContextFromPackage(contextPackage, issues);
  if (!chapterRepairContext) {
    return contextPackage;
  }
  return {
    ...contextPackage,
    chapterRepairContext,
  };
}
