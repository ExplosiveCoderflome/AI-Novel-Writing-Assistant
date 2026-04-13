import type { RuntimeDynamicCharacterOverview } from "@ai-novel/shared/types/chapterRuntime";

type PlannerCharacterSeed = {
  id: string;
  name: string;
  role: string;
  currentGoal: string | null;
  currentState: string | null;
};

interface ResolveChapterPlanParticipantsInput {
  outputParticipants?: string[] | null;
  characters: PlannerCharacterSeed[];
  characterDynamicsOverview?: RuntimeDynamicCharacterOverview | null;
  chapterOrder: number;
  limit?: number;
}

function compactText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function normalizeName(value: string | null | undefined): string {
  return compactText(value).toLocaleLowerCase("zh-Hans-CN");
}

function absenceRiskRank(risk: "none" | "info" | "warn" | "high"): number {
  return ["none", "info", "warn", "high"].indexOf(risk);
}

function buildPreferredDynamicParticipantNames(
  overview: RuntimeDynamicCharacterOverview | null | undefined,
  chapterOrder: number,
): string[] {
  if (!overview) {
    return [];
  }

  const relationCharacterIds = new Set<string>();
  for (const relation of overview.relations) {
    if (!relation.isCurrent) {
      continue;
    }
    relationCharacterIds.add(relation.sourceCharacterId);
    relationCharacterIds.add(relation.targetCharacterId);
  }

  return overview.characters
    .map((item) => {
      const plannedForCurrentChapter = item.plannedChapterOrders.includes(chapterOrder);
      const relationDriven = relationCharacterIds.has(item.characterId);
      const highAbsenceRisk = item.absenceRisk === "high" || item.absenceRisk === "warn";
      const shouldPreferAppearance = item.isCoreInVolume && (
        plannedForCurrentChapter
        || highAbsenceRisk
      );

      let score = 0;
      if (item.isCoreInVolume) {
        score += 40;
      }
      if (plannedForCurrentChapter) {
        score += 32;
      }
      if (highAbsenceRisk) {
        score += item.absenceRisk === "high" ? 28 : 18;
      }
      if (relationDriven) {
        score += 22;
      }
      if (item.volumeResponsibility) {
        score += 14;
      }
      if (item.currentGoal) {
        score += 6;
      }

      return {
        name: item.name,
        score,
        shouldPreferAppearance,
        isCoreInVolume: item.isCoreInVolume,
        absenceRisk: item.absenceRisk,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      if (left.shouldPreferAppearance !== right.shouldPreferAppearance) {
        return left.shouldPreferAppearance ? -1 : 1;
      }
      if (left.isCoreInVolume !== right.isCoreInVolume) {
        return left.isCoreInVolume ? -1 : 1;
      }
      if (left.absenceRisk !== right.absenceRisk) {
        return absenceRiskRank(right.absenceRisk) - absenceRiskRank(left.absenceRisk);
      }
      return left.name.localeCompare(right.name, "zh-Hans-CN");
    })
    .map((item) => item.name);
}

export function resolveChapterPlanParticipants(
  input: ResolveChapterPlanParticipantsInput,
): string[] {
  const limit = Math.max(1, input.limit ?? 6);
  const minimumDynamicSetSize = Math.min(limit, 4);
  const rosterByName = new Map(
    input.characters.map((character) => [normalizeName(character.name), compactText(character.name)]),
  );
  const pendingCandidateNames = new Set(
    (input.characterDynamicsOverview?.candidates ?? []).map((candidate) => normalizeName(candidate.proposedName)),
  );
  const selected: string[] = [];
  const selectedNames = new Set<string>();

  const pushParticipant = (value: string | null | undefined) => {
    const normalized = normalizeName(value);
    if (!normalized || selectedNames.has(normalized) || pendingCandidateNames.has(normalized)) {
      return;
    }
    const matchedName = rosterByName.get(normalized);
    if (!matchedName) {
      return;
    }
    selectedNames.add(normalized);
    selected.push(matchedName);
  };

  for (const participant of input.outputParticipants ?? []) {
    pushParticipant(participant);
  }

  const preferredDynamicNames = buildPreferredDynamicParticipantNames(
    input.characterDynamicsOverview,
    input.chapterOrder,
  );
  if (selected.length < minimumDynamicSetSize) {
    for (const participant of preferredDynamicNames) {
      pushParticipant(participant);
      if (selected.length >= minimumDynamicSetSize) {
        break;
      }
    }
  }

  if (selected.length === 0) {
    for (const character of input.characters) {
      pushParticipant(character.name);
      if (selected.length >= minimumDynamicSetSize) {
        break;
      }
    }
  }

  return selected.slice(0, limit);
}
