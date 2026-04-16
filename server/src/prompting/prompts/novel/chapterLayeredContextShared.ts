import type {
  ChapterWriteContext,
  GenerationContextPackage,
} from "@ai-novel/shared/types/chapterRuntime";
import { resolveLengthBudgetContract } from "@ai-novel/shared/types/chapterLengthControl";

export function compactText(value: string | null | undefined, fallback = ""): string {
  return value?.replace(/\s+/g, " ").trim() || fallback;
}

export function takeUnique(items: Array<string | null | undefined>, limit = items.length): string[] {
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

export function splitLines(value: string | null | undefined, limit = 4): string[] {
  return takeUnique(
    (value ?? "")
      .split(/\r?\n+/g)
      .map((line) => line.replace(/^[-*\d.\s]+/, "").trim()),
    limit,
  );
}

export function toListBlock(title: string, values: string[], emptyLabel = "none"): string {
  if (values.length === 0) {
    return `${title}: ${emptyLabel}`;
  }
  return [title, ...values.map((value) => `- ${value}`)].join("\n");
}

export function resolveTargetWordRange(targetWordCount: number | null | undefined): {
  targetWordCount: number | null;
  minWordCount: number | null;
  maxWordCount: number | null;
} {
  const budget = resolveLengthBudgetContract(targetWordCount);
  if (!budget) {
    return {
      targetWordCount: null,
      minWordCount: null,
      maxWordCount: null,
    };
  }
  return {
    targetWordCount: budget.targetWordCount,
    minWordCount: budget.softMinWordCount,
    maxWordCount: budget.softMaxWordCount,
  };
}

export function summarizeStateSnapshot(contextPackage: GenerationContextPackage): string {
  if (contextPackage.canonicalState) {
    const snapshot = contextPackage.canonicalState;
    const fragments = takeUnique([
      snapshot.narrative.currentChapterGoal,
      ...snapshot.characters
        .slice(0, 3)
        .map((state) => {
          const parts = takeUnique([
            state.currentGoal ? `goal=${state.currentGoal}` : "",
            state.currentState ? `state=${state.currentState}` : "",
            state.emotion ? `emotion=${state.emotion}` : "",
            state.summary,
          ]);
          if (parts.length === 0) {
            return "";
          }
          return `${state.name}: ${parts.join(" | ")}`;
        }),
      ...snapshot.narrative.publicKnowledge
        .slice(0, 2)
        .map((fact) => `${fact} (reader)`),
    ], 6);
    return fragments.join("\n") || "No prior canonical state snapshot.";
  }

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

export function summarizeOpenConflicts(contextPackage: GenerationContextPackage): string[] {
  if (contextPackage.canonicalState) {
    return contextPackage.canonicalState.narrative.openConflicts
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

export function summarizeWorldRules(contextPackage: GenerationContextPackage): string[] {
  if (contextPackage.canonicalState?.worldState) {
    const world = contextPackage.canonicalState.worldState;
    return takeUnique([
      world.summary,
      ...world.rules.slice(0, 3),
      ...world.tabooRules.slice(0, 2),
      world.currentSituation,
    ], 6);
  }

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

export function summarizeHistoricalIssues(contextPackage: GenerationContextPackage): string[] {
  return contextPackage.openAuditIssues
    .slice(0, 4)
    .map((issue) => `${issue.severity}/${issue.auditType}: ${issue.description}`)
    .filter(Boolean);
}

export function summarizeStyleConstraints(contextPackage: GenerationContextPackage): string[] {
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

export function summarizeContinuationConstraints(contextPackage: GenerationContextPackage): string[] {
  if (!contextPackage.continuation.enabled) {
    return [];
  }
  return takeUnique([
    compactText(contextPackage.continuation.systemRule),
    ...splitLines(contextPackage.continuation.humanBlock, 3),
  ], 4);
}

function formatLedgerWindow(start?: number | null, end?: number | null): string {
  if (typeof start === "number" && typeof end === "number") {
    return `目标窗口=${start}-${end}`;
  }
  if (typeof end === "number") {
    return `目标窗口截止第${end}章`;
  }
  if (typeof start === "number") {
    return `目标窗口起于第${start}章`;
  }
  return "";
}

export function buildLedgerItemLine(
  item: GenerationContextPackage["ledgerPendingItems"][number],
  label: string,
): string {
  return takeUnique([
    `${label}: ${item.title}`,
    item.summary,
    formatLedgerWindow(item.targetStartChapterOrder, item.targetEndChapterOrder),
    item.statusReason ?? "",
  ], 4).join(" | ");
}

export function buildParticipantText(writeContext: ChapterWriteContext): string {
  if (writeContext.participants.length === 0) {
    return "Participants: none";
  }
  const guideByCharacterId = new Map(
    writeContext.characterBehaviorGuides.map((guide) => [guide.characterId, guide]),
  );
  return [
    "Participants:",
    ...writeContext.participants.map((character) => {
      const guide = guideByCharacterId.get(character.id);
      const parts = takeUnique([
        character.role,
        guide?.volumeRoleLabel ? `volume role=${guide.volumeRoleLabel}` : "",
        guide?.volumeResponsibility ? `volume duty=${guide.volumeResponsibility}` : "",
        character.personality,
        character.currentState ? `state=${character.currentState}` : "",
        character.currentGoal ? `goal=${character.currentGoal}` : "",
        guide?.relationStageLabels.length ? `relation=${guide.relationStageLabels.join(" / ")}` : "",
        guide?.absenceRisk && guide.absenceRisk !== "none"
          ? `absence risk=${guide.absenceRisk}(span=${guide.absenceSpan})`
          : "",
      ], 4);
      return `- ${character.name}: ${parts.join(" | ")}`;
    }),
  ].join("\n");
}

export function buildCharacterGuidanceText(writeContext: ChapterWriteContext): string {
  if (writeContext.characterBehaviorGuides.length === 0) {
    return "Character behavior guidance: none";
  }
  return [
    "Character behavior guidance:",
    ...writeContext.characterBehaviorGuides.map((guide) => {
      const parts = takeUnique([
        guide.isCoreInVolume ? "core in current volume" : "supporting in current volume",
        guide.volumeRoleLabel ? `volume role=${guide.volumeRoleLabel}` : "",
        guide.volumeResponsibility ? `duty=${guide.volumeResponsibility}` : "",
        guide.currentGoal ? `goal=${guide.currentGoal}` : "",
        guide.currentState ? `state=${guide.currentState}` : "",
        guide.relationStageLabels.length ? `relation=${guide.relationStageLabels.join(" / ")}` : "",
        guide.absenceRisk !== "none" ? `absence=${guide.absenceRisk}(span=${guide.absenceSpan})` : "",
        guide.factionLabel ? `faction=${guide.factionLabel}` : "",
        guide.stanceLabel ? `stance=${guide.stanceLabel}` : "",
        guide.shouldPreferAppearance ? "prefer appearance in this chapter" : "",
      ], 6);
      return `- ${guide.name}: ${parts.join(" | ")}`;
    }),
  ].join("\n");
}

export function buildRelationStageText(writeContext: ChapterWriteContext): string {
  if (writeContext.activeRelationStages.length === 0) {
    return "Active relationship stages: none";
  }
  return [
    "Active relationship stages:",
    ...writeContext.activeRelationStages.map((relation) => (
      `- ${relation.sourceCharacterName} -> ${relation.targetCharacterName}: ${relation.stageLabel} | ${relation.stageSummary}${relation.nextTurnPoint ? ` | next=${relation.nextTurnPoint}` : ""}`
    )),
  ].join("\n");
}

export function buildPendingCandidateGuardText(writeContext: ChapterWriteContext): string {
  if (writeContext.pendingCandidateGuards.length === 0) {
    return "Pending candidate guardrails: none";
  }
  return [
    "Pending candidate guardrails (read-only, do not inject into generation):",
    ...writeContext.pendingCandidateGuards.map((candidate) => {
      const parts = takeUnique([
        candidate.proposedRole ? `role=${candidate.proposedRole}` : "",
        candidate.summary ?? "",
        candidate.sourceChapterOrder != null ? `source chapter=${candidate.sourceChapterOrder}` : "",
        ...candidate.evidence.slice(0, 2),
      ], 4);
      return `- ${candidate.proposedName}: ${parts.join(" | ")}`;
    }),
  ].join("\n");
}
