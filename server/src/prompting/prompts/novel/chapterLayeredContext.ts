import type {
  BookContractContext,
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
import type { ReviewIssue } from "@ai-novel/shared/types/novel";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import { createContextBlock } from "../../core/contextBudget";
import type { PromptContextBlock } from "../../core/promptTypes";
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

export const WRITER_FORBIDDEN_GROUPS = [
  "full_outline",
  "full_bible",
  "all_characters",
  "all_audit_issues",
  "anti_copy_corpus",
  "raw_rag_dump",
] as const;

export { resolveTargetWordRange } from "./chapterLayeredContextShared";

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
    targetWordCount: contextPackage.chapter.targetWordCount ?? null,
    planRole: contextPackage.plan?.planRole ?? null,
    hookTarget: compactText(contextPackage.plan?.hookTarget, "Leave a fresh tension point at the ending."),
    mustAdvance: takeUnique([
      ...(stateGoal?.targetConflicts ?? []),
      ...(stateGoal?.targetPayoffs ?? []),
      ...(contextPackage.plan?.mustAdvance ?? []),
    ], 5),
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

export function buildChapterWriteContext(input: {
  bookContract: BookContractContext;
  macroConstraints: MacroConstraintContext | null;
  volumeWindow: VolumeWindowContext | null;
  contextPackage: GenerationContextPackage;
}): ChapterWriteContext {
  const dynamicCharacterGuidance = buildDynamicCharacterGuidance(input.contextPackage);
  const scenePlan = parseChapterScenePlan(input.contextPackage.chapter.sceneCards, {
    targetWordCount: input.contextPackage.chapter.targetWordCount ?? undefined,
  });
  return {
    bookContract: input.bookContract,
    macroConstraints: input.macroConstraints,
    volumeWindow: input.volumeWindow,
    chapterMission: buildChapterMissionContext(input.contextPackage),
    nextAction: input.contextPackage.nextAction,
    chapterStateGoal: input.contextPackage.chapterStateGoal ?? null,
    protectedSecrets: input.contextPackage.protectedSecrets ?? [],
    lengthBudget: resolveLengthBudgetContract(input.contextPackage.chapter.targetWordCount),
    scenePlan,
    participants: buildParticipants(input.contextPackage, dynamicCharacterGuidance.characterBehaviorGuides),
    characterBehaviorGuides: dynamicCharacterGuidance.characterBehaviorGuides,
    activeRelationStages: dynamicCharacterGuidance.activeRelationStages,
    pendingCandidateGuards: dynamicCharacterGuidance.pendingCandidateGuards,
    localStateSummary: summarizeStateSnapshot(input.contextPackage),
    openConflictSummaries: summarizeOpenConflicts(input.contextPackage),
    ledgerPendingItems: input.contextPackage.ledgerPendingItems,
    ledgerUrgentItems: input.contextPackage.ledgerUrgentItems,
    ledgerOverdueItems: input.contextPackage.ledgerOverdueItems,
    ledgerSummary: input.contextPackage.ledgerSummary ?? null,
    recentChapterSummaries: takeUnique(input.contextPackage.previousChaptersSummary.slice(0, 3), 3),
    openingAntiRepeatHint: compactText(input.contextPackage.openingHint, "No recent opening guidance."),
    styleConstraints: summarizeStyleConstraints(input.contextPackage),
    continuationConstraints: summarizeContinuationConstraints(input.contextPackage),
    ragFacts: [],
  };
}

export function buildChapterReviewContext(
  writeContext: ChapterWriteContext,
  contextPackage: GenerationContextPackage,
): ChapterReviewContext {
  return {
    ...writeContext,
    structureObligations: takeUnique([
      ...writeContext.chapterMission.mustAdvance,
      ...writeContext.chapterMission.mustPreserve,
      ...(writeContext.chapterStateGoal?.targetPayoffs ?? []).map((item) => `state payoff: ${item}`),
      ...(writeContext.chapterStateGoal?.targetConflicts ?? []).map((item) => `state conflict: ${item}`),
      writeContext.chapterMission.hookTarget ? `hook target: ${writeContext.chapterMission.hookTarget}` : "",
      writeContext.volumeWindow?.missionSummary ? `volume mission: ${writeContext.volumeWindow.missionSummary}` : "",
      ...writeContext.ledgerPendingItems.map((item) => buildLedgerItemLine(item, "pending payoff")),
      ...writeContext.ledgerUrgentItems.map((item) => buildLedgerItemLine(item, "urgent payoff")),
      ...writeContext.ledgerOverdueItems.map((item) => buildLedgerItemLine(item, "overdue payoff")),
    ], 14),
    worldRules: summarizeWorldRules(contextPackage),
    historicalIssues: summarizeHistoricalIssues(contextPackage),
  };
}

export function buildChapterRepairContext(input: {
  writeContext: ChapterWriteContext;
  contextPackage: GenerationContextPackage;
  issues: ReviewIssue[];
}): ChapterRepairContext {
  return {
    writeContext: input.writeContext,
    issues: input.issues.slice(0, 8).map((issue) => ({
      severity: issue.severity,
      category: issue.category,
      evidence: compactText(issue.evidence),
      fixSuggestion: compactText(issue.fixSuggestion),
    })),
    structureObligations: takeUnique([
      ...input.writeContext.chapterMission.mustAdvance,
      ...input.writeContext.chapterMission.mustPreserve,
      ...(input.writeContext.chapterStateGoal?.targetPayoffs ?? []).map((item) => `state payoff: ${item}`),
      ...(input.writeContext.chapterStateGoal?.targetConflicts ?? []).map((item) => `state conflict: ${item}`),
      input.writeContext.volumeWindow?.missionSummary
        ? `volume mission: ${input.writeContext.volumeWindow.missionSummary}`
        : "",
      ...input.writeContext.ledgerPendingItems.map((item) => buildLedgerItemLine(item, "pending payoff")),
      ...input.writeContext.ledgerUrgentItems.map((item) => buildLedgerItemLine(item, "urgent payoff")),
      ...input.writeContext.ledgerOverdueItems.map((item) => buildLedgerItemLine(item, "overdue payoff")),
    ], 16),
    worldRules: summarizeWorldRules(input.contextPackage),
    historicalIssues: summarizeHistoricalIssues(input.contextPackage),
    allowedEditBoundaries: takeUnique([
      "Keep the chapter's established objective, participants, and major outcome direction intact.",
      "Do not introduce new core characters, new world rules, or off-outline twists.",
      input.writeContext.volumeWindow?.missionSummary
        ? `Keep the repair aligned with the current volume mission: ${input.writeContext.volumeWindow.missionSummary}`
        : "",
      ...input.writeContext.ledgerPendingItems.map((item) => `Do not erase pending payoff setup: ${item.title}`),
      ...input.writeContext.ledgerUrgentItems.map((item) => `This chapter must visibly touch the urgent payoff thread: ${item.title}`),
      ...input.writeContext.ledgerOverdueItems.map((item) => `You must either兑现 or explicitly explain the overdue payoff pressure: ${item.title}`),
      input.writeContext.chapterMission.hookTarget
        ? `Preserve or strengthen the ending tension: ${input.writeContext.chapterMission.hookTarget}`
        : "",
      ...input.writeContext.characterBehaviorGuides
        .filter((guide) => guide.shouldPreferAppearance || guide.isCoreInVolume)
        .slice(0, 4)
        .map((guide) => `Keep ${guide.name} aligned with current role duty: ${guide.volumeResponsibility ?? guide.volumeRoleLabel ?? guide.role}`),
      input.writeContext.pendingCandidateGuards.length > 0
        ? "Pending character candidates remain read-only unless they are confirmed outside the repair flow."
        : "",
      ...input.writeContext.protectedSecrets.map((item) => `do not disclose: ${item}`),
      ...input.writeContext.chapterMission.mustPreserve.map((item) => `must preserve: ${item}`),
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

export function buildChapterWriterContextBlocks(writeContext: ChapterWriteContext): PromptContextBlock[] {
  const wordRange = resolveTargetWordRange(writeContext.chapterMission.targetWordCount);
  const blocks: PromptContextBlock[] = [
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
        toListBlock("Must advance", writeContext.chapterMission.mustAdvance),
        toListBlock("Must preserve", writeContext.chapterMission.mustPreserve),
        toListBlock("Risk notes", writeContext.chapterMission.riskNotes),
        writeContext.chapterMission.hookTarget ? `Ending hook: ${writeContext.chapterMission.hookTarget}` : "",
      ].filter(Boolean).join("\n"),
    }),
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
            toListBlock("Target payoffs", writeContext.chapterStateGoal.targetPayoffs),
            toListBlock("Protected secrets", writeContext.protectedSecrets),
          ].filter(Boolean).join("\n")
        : "",
    }),
    createContextBlock({
      id: "volume_window",
      group: "volume_window",
      priority: 96,
      required: true,
      content: writeContext.volumeWindow
        ? [
            `Current volume: ${writeContext.volumeWindow.title}`,
            `Volume mission: ${writeContext.volumeWindow.missionSummary}`,
            writeContext.volumeWindow.adjacentSummary,
            toListBlock("Pending payoffs", writeContext.volumeWindow.pendingPayoffs),
            `Future window: ${writeContext.volumeWindow.softFutureSummary}`,
          ].filter(Boolean).join("\n")
        : "Current volume: none",
    }),
    createContextBlock({
      id: "payoff_ledger",
      group: "payoff_ledger",
      priority: 95,
      required: true,
      content: [
        writeContext.ledgerSummary
          ? `Payoff ledger summary: pending=${writeContext.ledgerSummary.pendingCount}, urgent=${writeContext.ledgerSummary.urgentCount}, overdue=${writeContext.ledgerSummary.overdueCount}, paid_off=${writeContext.ledgerSummary.paidOffCount}`
          : "Payoff ledger summary: none",
        toListBlock("Canonical pending payoffs", writeContext.ledgerPendingItems.map((item) => buildLedgerItemLine(item, "pending"))),
        toListBlock("Urgent payoffs", writeContext.ledgerUrgentItems.map((item) => buildLedgerItemLine(item, "urgent"))),
        toListBlock("Overdue payoffs", writeContext.ledgerOverdueItems.map((item) => buildLedgerItemLine(item, "overdue"))),
      ].join("\n"),
    }),
    createContextBlock({
      id: "scene_plan",
      group: "scene_plan",
      priority: 94,
      required: Boolean(writeContext.scenePlan),
      content: writeContext.scenePlan
        ? [
            `Scene count: ${writeContext.scenePlan.scenes.length}`,
            ...writeContext.scenePlan.scenes.map((scene, index) => `${index + 1}. ${scene.title} [${scene.targetWordCount}] ${scene.purpose}`),
          ].join("\n")
        : "",
    }),
    createContextBlock({
      id: "participant_subset",
      group: "participant_subset",
      priority: 92,
      required: true,
      content: buildParticipantText(writeContext),
    }),
    createContextBlock({
      id: "character_dynamics",
      group: "character_dynamics",
      priority: 91,
      content: [
        buildCharacterGuidanceText(writeContext),
        buildRelationStageText(writeContext),
        buildPendingCandidateGuardText(writeContext),
      ].join("\n\n"),
    }),
    createContextBlock({
      id: "local_state",
      group: "local_state",
      priority: 90,
      required: true,
      content: `Local state before writing:\n${writeContext.localStateSummary}`,
    }),
    createContextBlock({
      id: "open_conflicts",
      group: "open_conflicts",
      priority: 88,
      content: toListBlock("Open conflicts", writeContext.openConflictSummaries),
    }),
    createContextBlock({
      id: "recent_chapters",
      group: "recent_chapters",
      priority: 86,
      content: toListBlock("Recent chapter summaries", writeContext.recentChapterSummaries),
    }),
    createContextBlock({
      id: "opening_constraints",
      group: "opening_constraints",
      priority: 80,
      content: `Opening anti-repeat hint:\n${writeContext.openingAntiRepeatHint}`,
    }),
    createContextBlock({
      id: "style_constraints",
      group: "style_constraints",
      priority: 74,
      content: toListBlock("Style constraints", writeContext.styleConstraints),
    }),
    createContextBlock({
      id: "continuation_constraints",
      group: "continuation_constraints",
      priority: 72,
      content: toListBlock("Continuation constraints", writeContext.continuationConstraints),
    }),
  ];
  return blocks.filter((block) => block.content.trim().length > 0);
}

export function buildChapterReviewContextBlocks(reviewContext: ChapterReviewContext): PromptContextBlock[] {
  return [
    ...buildChapterWriterContextBlocks(reviewContext),
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
    ...buildChapterWriterContextBlocks(repairContext.writeContext),
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
