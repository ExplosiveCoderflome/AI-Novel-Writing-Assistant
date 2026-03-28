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
import type { ReviewIssue } from "@ai-novel/shared/types/novel";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import { createContextBlock } from "../../core/contextBudget";
import type { PromptContextBlock } from "../../core/promptTypes";
import { RUNTIME_PROMPT_BUDGET_PROFILES } from "./promptBudgetProfiles";

export const WRITER_FORBIDDEN_GROUPS = [
  "full_outline",
  "full_bible",
  "all_characters",
  "all_audit_issues",
  "anti_copy_corpus",
  "raw_rag_dump",
] as const;

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

function compactText(value: string | null | undefined, fallback = ""): string {
  return value?.replace(/\s+/g, " ").trim() || fallback;
}

function takeUnique(items: Array<string | null | undefined>, limit = items.length): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const item of items) {
    const normalized = compactText(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    results.push(normalized);
    if (results.length >= limit) {
      break;
    }
  }
  return results;
}

function splitLines(value: string | null | undefined, limit = 4): string[] {
  return takeUnique(
    (value ?? "")
      .split(/\r?\n+/g)
      .map((line) => line.replace(/^[-*\d.\s]+/, "").trim()),
    limit,
  );
}

function toListBlock(title: string, values: string[], emptyLabel = "none"): string {
  if (values.length === 0) {
    return `${title}: ${emptyLabel}`;
  }
  return [title, ...values.map((value) => `- ${value}`)].join("\n");
}

function summarizeStateSnapshot(contextPackage: GenerationContextPackage): string {
  const fragments = takeUnique([
    contextPackage.stateSnapshot?.summary,
    ...contextPackage.stateSnapshot?.characterStates
      .slice(0, 3)
      .map((state) => {
        const parts = takeUnique([
          state.currentGoal ? `goal=${state.currentGoal}` : "",
          state.emotion ? `emotion=${state.emotion}` : "",
          state.summary,
        ]);
        if (parts.length === 0) {
          return "";
        }
        return `${state.characterId}: ${parts.join(" | ")}`;
      }) ?? [],
    ...contextPackage.stateSnapshot?.informationStates
      .slice(0, 2)
      .map((info) => `${info.fact} (${info.status})`) ?? [],
  ], 6);
  return fragments.join("\n") || "No prior state snapshot.";
}

function summarizeOpenConflicts(contextPackage: GenerationContextPackage): string[] {
  return contextPackage.openConflicts
    .slice(0, 4)
    .map((conflict) => {
      const parts = takeUnique([
        conflict.title,
        conflict.summary,
        conflict.resolutionHint ? `resolution hint: ${conflict.resolutionHint}` : "",
      ], 3);
      return parts.join(" | ");
    })
    .filter(Boolean);
}

function summarizeWorldRules(contextPackage: GenerationContextPackage): string[] {
  const worldSlice = contextPackage.storyWorldSlice;
  if (!worldSlice) {
    return [];
  }
  return takeUnique([
    worldSlice.coreWorldFrame,
    ...worldSlice.appliedRules.slice(0, 3).map((rule) => `${rule.name}: ${rule.summary}`),
    ...worldSlice.forbiddenCombinations.slice(0, 2),
    worldSlice.storyScopeBoundary,
  ], 6);
}

function summarizeHistoricalIssues(contextPackage: GenerationContextPackage): string[] {
  return contextPackage.openAuditIssues
    .slice(0, 4)
    .map((issue) => `${issue.severity}/${issue.auditType}: ${issue.description}`)
    .filter(Boolean);
}

function summarizeStyleConstraints(contextPackage: GenerationContextPackage): string[] {
  const compiled = contextPackage.styleContext?.compiledBlocks;
  if (!compiled) {
    return [];
  }
  return takeUnique([
    ...splitLines(compiled.style, 2),
    ...splitLines(compiled.character, 2),
    ...splitLines(compiled.antiAi, 2),
    ...splitLines(compiled.selfCheck, 1),
  ], 6);
}

function summarizeContinuationConstraints(contextPackage: GenerationContextPackage): string[] {
  if (!contextPackage.continuation.enabled) {
    return [];
  }
  return takeUnique([
    compactText(contextPackage.continuation.systemRule),
    ...splitLines(contextPackage.continuation.humanBlock, 3),
  ], 4);
}

function buildParticipants(contextPackage: GenerationContextPackage): GenerationContextPackage["characterRoster"] {
  const participantNames = new Set(contextPackage.plan?.participants ?? []);
  const conflictCharacterIds = new Set(
    contextPackage.openConflicts.flatMap((conflict) => conflict.affectedCharacterIds ?? []),
  );
  const selected = contextPackage.characterRoster.filter((character) => (
    participantNames.has(character.name) || conflictCharacterIds.has(character.id)
  ));
  if (selected.length > 0) {
    return selected.slice(0, 6);
  }
  return contextPackage.characterRoster.slice(0, 4);
}

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
  return {
    chapterId: contextPackage.chapter.id,
    chapterOrder: contextPackage.chapter.order,
    title: compactText(contextPackage.chapter.title),
    objective: compactText(
      contextPackage.plan?.objective,
      contextPackage.chapter.expectation ?? "Push the current chapter mission forward.",
    ),
    expectation: compactText(
      contextPackage.chapter.expectation,
      contextPackage.plan?.title ?? "Deliver the current chapter mission.",
    ),
    planRole: contextPackage.plan?.planRole ?? null,
    hookTarget: compactText(contextPackage.plan?.hookTarget, "Leave a fresh tension point at the ending."),
    mustAdvance: takeUnique(contextPackage.plan?.mustAdvance ?? [], 5),
    mustPreserve: takeUnique(contextPackage.plan?.mustPreserve ?? [], 5),
    riskNotes: takeUnique(contextPackage.plan?.riskNotes ?? [], 5),
  };
}

export function buildChapterWriteContext(input: {
  bookContract: BookContractContext;
  macroConstraints: MacroConstraintContext | null;
  volumeWindow: VolumeWindowContext | null;
  contextPackage: GenerationContextPackage;
}): ChapterWriteContext {
  return {
    bookContract: input.bookContract,
    macroConstraints: input.macroConstraints,
    volumeWindow: input.volumeWindow,
    chapterMission: buildChapterMissionContext(input.contextPackage),
    participants: buildParticipants(input.contextPackage),
    localStateSummary: summarizeStateSnapshot(input.contextPackage),
    openConflictSummaries: summarizeOpenConflicts(input.contextPackage),
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
      writeContext.chapterMission.hookTarget ? `hook target: ${writeContext.chapterMission.hookTarget}` : "",
    ], 8),
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
    ], 8),
    worldRules: summarizeWorldRules(input.contextPackage),
    historicalIssues: summarizeHistoricalIssues(input.contextPackage),
    allowedEditBoundaries: takeUnique([
      "Keep the chapter's established objective, participants, and major outcome direction intact.",
      "Do not introduce new core characters, new world rules, or off-outline twists.",
      input.writeContext.chapterMission.hookTarget
        ? `Preserve or strengthen the ending tension: ${input.writeContext.chapterMission.hookTarget}`
        : "",
      ...input.writeContext.chapterMission.mustPreserve.map((item) => `must preserve: ${item}`),
    ], 8),
  };
}

function buildParticipantText(writeContext: ChapterWriteContext): string {
  if (writeContext.participants.length === 0) {
    return "Participants: none";
  }
  return [
    "Participants:",
    ...writeContext.participants.map((character) => {
      const parts = takeUnique([
        character.role,
        character.personality,
        character.currentState ? `state=${character.currentState}` : "",
        character.currentGoal ? `goal=${character.currentGoal}` : "",
      ], 4);
      return `- ${character.name}: ${parts.join(" | ")}`;
    }),
  ].join("\n");
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
        writeContext.chapterMission.planRole ? `Plan role: ${writeContext.chapterMission.planRole}` : "",
        toListBlock("Must advance", writeContext.chapterMission.mustAdvance),
        toListBlock("Must preserve", writeContext.chapterMission.mustPreserve),
        toListBlock("Risk notes", writeContext.chapterMission.riskNotes),
        writeContext.chapterMission.hookTarget ? `Ending hook: ${writeContext.chapterMission.hookTarget}` : "",
      ].filter(Boolean).join("\n"),
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
      id: "participant_subset",
      group: "participant_subset",
      priority: 92,
      required: true,
      content: buildParticipantText(writeContext),
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
