function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeKeySegment(value: string | null | undefined): string {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) {
    return "item";
  }
  return normalized
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "item";
}

function valuesDiffer(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = normalizeText(left).toLowerCase();
  const normalizedRight = normalizeText(right).toLowerCase();
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return normalizedLeft !== normalizedRight;
}

function rankForeshadowStatus(status: string | null | undefined): number {
  const normalized = normalizeText(status).toLowerCase();
  if (
    normalized.includes("resolved")
    || normalized.includes("complete")
    || normalized.includes("兑现")
    || normalized.includes("回收")
  ) {
    return 4;
  }
  if (normalized.includes("payoff") || normalized.includes("paid") || normalized.includes("reveal")) {
    return 3;
  }
  if (
    normalized.includes("active")
    || normalized.includes("progress")
    || normalized.includes("develop")
    || normalized.includes("推进")
  ) {
    return 2;
  }
  return 1;
}

function rankInformationStatus(status: string | null | undefined): number {
  const normalized = normalizeText(status).toLowerCase();
  if (
    normalized.includes("confirmed")
    || normalized.includes("known")
    || normalized.includes("revealed")
    || normalized.includes("open")
    || normalized.includes("公开")
    || normalized.includes("已知")
  ) {
    return 3;
  }
  if (
    normalized.includes("hint")
    || normalized.includes("suspect")
    || normalized.includes("partial")
    || normalized.includes("线索")
    || normalized.includes("怀疑")
  ) {
    return 2;
  }
  return 1;
}

interface SnapshotCharacterState {
  characterId: string;
  currentGoal?: string | null;
  summary?: string | null;
}

interface SnapshotRelationState {
  sourceCharacterId: string;
  targetCharacterId: string;
  trustScore?: number | null;
  intimacyScore?: number | null;
  conflictScore?: number | null;
  dependencyScore?: number | null;
  summary?: string | null;
}

interface SnapshotInformationState {
  holderType: string;
  holderRefId?: string | null;
  fact: string;
  status: string;
  summary?: string | null;
}

interface SnapshotForeshadowState {
  title: string;
  summary?: string | null;
  status: string;
  setupChapterId?: string | null;
}

export interface SnapshotConflictComparable {
  characterStates: SnapshotCharacterState[];
  relationStates: SnapshotRelationState[];
  informationStates: SnapshotInformationState[];
  foreshadowStates: SnapshotForeshadowState[];
}

export interface StateDiffConflictCandidate {
  conflictKey: string;
  conflictType: string;
  title: string;
  summary: string;
  severity: string;
  evidence: string[];
  affectedCharacterIds: string[];
  resolutionHint: string | null;
}

export interface StateDiffConflictResult {
  trackedConflictKeys: string[];
  conflicts: StateDiffConflictCandidate[];
}

interface DetectStateDiffConflictsInput {
  characters: Array<{ id: string; name: string }>;
  previousSnapshot: SnapshotConflictComparable | null;
  currentSnapshot: SnapshotConflictComparable;
}

export function detectStateDiffConflicts(input: DetectStateDiffConflictsInput): StateDiffConflictResult {
  const trackedConflictKeys = new Set<string>();
  const conflicts = new Map<string, StateDiffConflictCandidate>();
  const characterNameById = new Map(input.characters.map((item) => [item.id, item.name]));

  const previousCharacterMap = new Map(
    (input.previousSnapshot?.characterStates ?? []).map((item) => [item.characterId, item]),
  );
  for (const currentState of input.currentSnapshot.characterStates) {
    const previousState = previousCharacterMap.get(currentState.characterId);
    const previousGoal = normalizeText(previousState?.currentGoal);
    const currentGoal = normalizeText(currentState.currentGoal);
    if (!previousGoal || !currentGoal) {
      continue;
    }
    const conflictKey = `character_goal_shift:${currentState.characterId}`;
    trackedConflictKeys.add(conflictKey);
    if (!valuesDiffer(previousGoal, currentGoal)) {
      continue;
    }
    const characterName = characterNameById.get(currentState.characterId) ?? currentState.characterId;
    conflicts.set(conflictKey, {
      conflictKey,
      conflictType: "character_goal_shift",
      title: `${characterName} goal changed`,
      summary: `${characterName} current goal changed from "${previousGoal}" to "${currentGoal}". Confirm this chapter includes a clear transition trigger.`,
      severity: "medium",
      evidence: [
        `Previous goal: ${previousGoal}`,
        previousState?.summary ? `Previous state: ${normalizeText(previousState.summary)}` : "",
        `Current goal: ${currentGoal}`,
        currentState.summary ? `Current state: ${normalizeText(currentState.summary)}` : "",
      ].filter(Boolean),
      affectedCharacterIds: [currentState.characterId],
      resolutionHint: "If this is an intentional turn, make the trigger explicit in the chapter or plan. Otherwise restore the prior goal.",
    });
  }

  const previousRelationMap = new Map(
    (input.previousSnapshot?.relationStates ?? []).map((item) => [`${item.sourceCharacterId}:${item.targetCharacterId}`, item]),
  );
  for (const currentState of input.currentSnapshot.relationStates) {
    const relationKey = `${currentState.sourceCharacterId}:${currentState.targetCharacterId}`;
    const previousState = previousRelationMap.get(relationKey);
    if (!previousState) {
      continue;
    }
    const comparableScores = [
      ["trust", previousState.trustScore, currentState.trustScore],
      ["intimacy", previousState.intimacyScore, currentState.intimacyScore],
      ["conflict", previousState.conflictScore, currentState.conflictScore],
      ["dependency", previousState.dependencyScore, currentState.dependencyScore],
    ].filter((item): item is [string, number, number] => typeof item[1] === "number" && typeof item[2] === "number");
    if (comparableScores.length === 0) {
      continue;
    }
    const conflictKey = `relation_jump:${relationKey}`;
    trackedConflictKeys.add(conflictKey);
    const changedScores = comparableScores
      .map(([label, previousValue, currentValue]) => ({
        label,
        previousValue,
        currentValue,
        delta: Math.abs(currentValue - previousValue),
      }))
      .filter((item) => item.delta >= 35);
    if (changedScores.length === 0) {
      continue;
    }
    const sourceName = characterNameById.get(currentState.sourceCharacterId) ?? currentState.sourceCharacterId;
    const targetName = characterNameById.get(currentState.targetCharacterId) ?? currentState.targetCharacterId;
    const maxDelta = Math.max(...changedScores.map((item) => item.delta));
    conflicts.set(conflictKey, {
      conflictKey,
      conflictType: "relation_jump",
      title: `${sourceName} / ${targetName} relation jumped`,
      summary: `${sourceName} and ${targetName} relation metrics changed sharply: ${changedScores.map((item) => `${item.label} ${item.previousValue}->${item.currentValue}`).join(", ")}.`,
      severity: maxDelta >= 60 ? "high" : "medium",
      evidence: [
        previousState.summary ? `Previous relation: ${normalizeText(previousState.summary)}` : "",
        currentState.summary ? `Current relation: ${normalizeText(currentState.summary)}` : "",
      ].filter(Boolean),
      affectedCharacterIds: [currentState.sourceCharacterId, currentState.targetCharacterId],
      resolutionHint: "Make the causal event explicit, or soften the state extraction by revising the chapter/summary if the change is not real.",
    });
  }

  const previousInformationMap = new Map(
    (input.previousSnapshot?.informationStates ?? []).map((item) => [
      `${item.holderType}:${item.holderRefId ?? "-"}:${normalizeKeySegment(item.fact)}`,
      item,
    ]),
  );
  for (const currentState of input.currentSnapshot.informationStates) {
    const infoKey = `${currentState.holderType}:${currentState.holderRefId ?? "-"}:${normalizeKeySegment(currentState.fact)}`;
    const previousState = previousInformationMap.get(infoKey);
    if (!previousState) {
      continue;
    }
    const conflictKey = `information_regression:${infoKey}`;
    trackedConflictKeys.add(conflictKey);
    const previousRank = rankInformationStatus(previousState.status);
    const currentRank = rankInformationStatus(currentState.status);
    if (currentRank >= previousRank) {
      continue;
    }
    conflicts.set(conflictKey, {
      conflictKey,
      conflictType: "information_regression",
      title: "Knowledge state regressed",
      summary: `Fact "${normalizeText(currentState.fact)}" moved from "${normalizeText(previousState.status) || "known"}" to "${normalizeText(currentState.status) || "unknown"}".`,
      severity: previousRank - currentRank >= 2 ? "high" : "medium",
      evidence: [
        previousState.summary ? `Previous knowledge: ${normalizeText(previousState.summary)}` : "",
        currentState.summary ? `Current knowledge: ${normalizeText(currentState.summary)}` : "",
      ].filter(Boolean),
      affectedCharacterIds: currentState.holderType === "character" && currentState.holderRefId ? [currentState.holderRefId] : [],
      resolutionHint: "Confirm whether the knowledge should truly be forgotten or hidden again. Otherwise keep the higher-confidence state.",
    });
  }

  const previousForeshadowMap = new Map(
    (input.previousSnapshot?.foreshadowStates ?? []).map((item) => [normalizeKeySegment(item.title), item]),
  );
  for (const currentState of input.currentSnapshot.foreshadowStates) {
    const foreshadowKey = normalizeKeySegment(currentState.title);
    const previousState = previousForeshadowMap.get(foreshadowKey);
    const regressionKey = `foreshadow_regression:${foreshadowKey}`;
    if (previousState) {
      trackedConflictKeys.add(regressionKey);
      const previousRank = rankForeshadowStatus(previousState.status);
      const currentRank = rankForeshadowStatus(currentState.status);
      if (currentRank + 1 < previousRank) {
        conflicts.set(regressionKey, {
          conflictKey: regressionKey,
          conflictType: "foreshadow_regression",
          title: `${normalizeText(currentState.title)} regressed`,
          summary: `Foreshadow "${normalizeText(currentState.title)}" moved from "${normalizeText(previousState.status) || "resolved"}" back to "${normalizeText(currentState.status) || "setup"}".`,
          severity: "high",
          evidence: [
            previousState.summary ? `Previous foreshadow: ${normalizeText(previousState.summary)}` : "",
            currentState.summary ? `Current foreshadow: ${normalizeText(currentState.summary)}` : "",
          ].filter(Boolean),
          affectedCharacterIds: [],
          resolutionHint: "Do not reopen resolved foreshadowing unless the chapter explicitly creates a new thread.",
        });
      }
    }

    const setupMissingKey = `foreshadow_missing_setup:${foreshadowKey}`;
    const normalizedForeshadowStatus = normalizeText(currentState.status).toLowerCase();
    const currentRank = rankForeshadowStatus(currentState.status);
    if (currentRank >= 3 && normalizedForeshadowStatus !== "pending_payoff") {
      trackedConflictKeys.add(setupMissingKey);
      if (!previousState && !normalizeText(currentState.setupChapterId)) {
        conflicts.set(setupMissingKey, {
          conflictKey: setupMissingKey,
          conflictType: "foreshadow_missing_setup",
          title: `${normalizeText(currentState.title)} paid off without setup`,
          summary: `Foreshadow "${normalizeText(currentState.title)}" looks like a payoff/resolution, but no prior setup state was found.`,
          severity: "high",
          evidence: [currentState.summary ? `Current foreshadow: ${normalizeText(currentState.summary)}` : ""].filter(Boolean),
          affectedCharacterIds: [],
          resolutionHint: "Either add the missing setup earlier, or downgrade the current state to setup/active until the payoff chapter arrives.",
        });
      }
    }
  }

  return {
    trackedConflictKeys: Array.from(trackedConflictKeys),
    conflicts: Array.from(conflicts.values()),
  };
}
