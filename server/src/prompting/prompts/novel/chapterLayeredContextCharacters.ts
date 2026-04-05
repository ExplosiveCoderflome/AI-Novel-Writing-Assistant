import type {
  ChapterWriteContext,
  GenerationContextPackage,
} from "@ai-novel/shared/types/chapterRuntime";
import { compactText, takeUnique } from "./chapterLayeredContextShared";

function absenceRiskRank(risk: "none" | "info" | "warn" | "high"): number {
  return ["none", "info", "warn", "high"].indexOf(risk);
}

export function buildDynamicCharacterGuidance(
  contextPackage: GenerationContextPackage,
): Pick<ChapterWriteContext, "characterBehaviorGuides" | "activeRelationStages" | "pendingCandidateGuards"> {
  const overview = contextPackage.characterDynamics;
  if (!overview) {
    return {
      characterBehaviorGuides: [],
      activeRelationStages: [],
      pendingCandidateGuards: [],
    };
  }

  const currentChapterOrder = contextPackage.chapter.order;
  const rosterById = new Map(contextPackage.characterRoster.map((character) => [character.id, character]));
  const planParticipantNames = new Set((contextPackage.plan?.participants ?? []).map((item) => compactText(item)));
  const conflictCharacterIds = new Set(
    contextPackage.openConflicts.flatMap((conflict) => conflict.affectedCharacterIds ?? []),
  );

  const activeRelationStages = overview.relations
    .slice(0, 8)
    .map((relation) => ({
      relationId: relation.relationId ?? null,
      sourceCharacterId: relation.sourceCharacterId,
      sourceCharacterName: compactText(relation.sourceCharacterName, relation.sourceCharacterId),
      targetCharacterId: relation.targetCharacterId,
      targetCharacterName: compactText(relation.targetCharacterName, relation.targetCharacterId),
      stageLabel: compactText(relation.stageLabel),
      stageSummary: compactText(relation.stageSummary),
      nextTurnPoint: compactText(relation.nextTurnPoint, "") || null,
      isCurrent: relation.isCurrent,
    }));
  const relationStageByCharacterId = new Map<string, typeof activeRelationStages>();
  for (const relation of activeRelationStages) {
    const sourceStages = relationStageByCharacterId.get(relation.sourceCharacterId) ?? [];
    sourceStages.push(relation);
    relationStageByCharacterId.set(relation.sourceCharacterId, sourceStages);

    const targetStages = relationStageByCharacterId.get(relation.targetCharacterId) ?? [];
    targetStages.push(relation);
    relationStageByCharacterId.set(relation.targetCharacterId, targetStages);
  }

  const characterBehaviorGuides = overview.characters
    .filter((item) => rosterById.has(item.characterId))
    .map((item) => {
      const roster = rosterById.get(item.characterId);
      const relationStages = relationStageByCharacterId.get(item.characterId) ?? [];
      const shouldPreferAppearance = item.isCoreInVolume && (
        item.plannedChapterOrders.includes(currentChapterOrder)
        || item.absenceRisk === "high"
        || item.absenceRisk === "warn"
      );
      let score = 0;
      if (item.isCoreInVolume) {
        score += 40;
      }
      if (item.volumeResponsibility) {
        score += 20;
      }
      if (item.plannedChapterOrders.includes(currentChapterOrder)) {
        score += 25;
      }
      if (relationStages.length > 0) {
        score += 24;
      }
      if (item.absenceRisk === "high") {
        score += 30;
      } else if (item.absenceRisk === "warn") {
        score += 20;
      } else if (item.absenceRisk === "info") {
        score += 8;
      }
      if (planParticipantNames.has(item.name)) {
        score += 16;
      }
      if (conflictCharacterIds.has(item.characterId)) {
        score += 12;
      }
      if (item.currentGoal) {
        score += 4;
      }
      return {
        score,
        guide: {
          characterId: item.characterId,
          name: item.name,
          role: roster?.role ?? item.role,
          castRole: item.castRole ?? null,
          volumeRoleLabel: item.volumeRoleLabel ?? null,
          volumeResponsibility: item.volumeResponsibility ?? null,
          currentGoal: roster?.currentGoal ?? item.currentGoal ?? null,
          currentState: roster?.currentState ?? item.currentState ?? null,
          factionLabel: item.factionLabel ?? null,
          stanceLabel: item.stanceLabel ?? null,
          relationStageLabels: takeUnique(
            relationStages.map((relation) => (
              relation.nextTurnPoint
                ? `${relation.stageLabel} -> ${relation.nextTurnPoint}`
                : relation.stageLabel
            )),
            3,
          ),
          relationRiskNotes: takeUnique(
            relationStages.map((relation) => (
              `${relation.sourceCharacterName} / ${relation.targetCharacterName}: ${relation.stageSummary}${relation.nextTurnPoint ? ` | next=${relation.nextTurnPoint}` : ""}`
            )),
            3,
          ),
          plannedChapterOrders: item.plannedChapterOrders,
          absenceRisk: item.absenceRisk,
          absenceSpan: item.absenceSpan,
          isCoreInVolume: item.isCoreInVolume,
          shouldPreferAppearance,
        },
      };
    })
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      if (left.guide.shouldPreferAppearance !== right.guide.shouldPreferAppearance) {
        return left.guide.shouldPreferAppearance ? -1 : 1;
      }
      if (left.guide.isCoreInVolume !== right.guide.isCoreInVolume) {
        return left.guide.isCoreInVolume ? -1 : 1;
      }
      if (left.guide.absenceRisk !== right.guide.absenceRisk) {
        return absenceRiskRank(right.guide.absenceRisk) - absenceRiskRank(left.guide.absenceRisk);
      }
      return left.guide.name.localeCompare(right.guide.name, "zh-Hans-CN");
    })
    .slice(0, 8)
    .map((item) => item.guide);

  return {
    characterBehaviorGuides,
    activeRelationStages,
    pendingCandidateGuards: overview.candidates
      .slice(0, 4)
      .map((candidate) => ({
        id: candidate.id,
        proposedName: compactText(candidate.proposedName),
        proposedRole: compactText(candidate.proposedRole, "") || null,
        summary: compactText(candidate.summary, "") || null,
        evidence: takeUnique(candidate.evidence, 3),
        sourceChapterOrder: candidate.sourceChapterOrder ?? null,
      })),
  };
}

export function buildParticipants(
  contextPackage: GenerationContextPackage,
  characterBehaviorGuides: ChapterWriteContext["characterBehaviorGuides"] = [],
): GenerationContextPackage["characterRoster"] {
  const rosterById = new Map(contextPackage.characterRoster.map((character) => [character.id, character]));
  const participantNames = new Set(contextPackage.plan?.participants ?? []);
  const conflictCharacterIds = new Set(
    contextPackage.openConflicts.flatMap((conflict) => conflict.affectedCharacterIds ?? []),
  );
  if (characterBehaviorGuides.length > 0) {
    const selected = characterBehaviorGuides
      .filter((guide) => (
        guide.shouldPreferAppearance
        || guide.isCoreInVolume
        || guide.relationStageLabels.length > 0
        || participantNames.has(guide.name)
        || conflictCharacterIds.has(guide.characterId)
      ))
      .map((guide) => rosterById.get(guide.characterId))
      .filter((character): character is NonNullable<typeof character> => Boolean(character));
    if (selected.length > 0) {
      return selected.slice(0, 6);
    }
  }

  const selected = contextPackage.characterRoster.filter((character) => (
    participantNames.has(character.name) || conflictCharacterIds.has(character.id)
  ));
  if (selected.length > 0) {
    return selected.slice(0, 6);
  }
  return contextPackage.characterRoster.slice(0, 4);
}
