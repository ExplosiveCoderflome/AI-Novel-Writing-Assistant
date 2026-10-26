import { exactCharacter } from "./ownership";
import { nullable, type ConsumerWriter } from "./types";

export const writeDynamics: ConsumerWriter = async ({ tx, context, output }) => {
  if (output.syncPlan.characterDynamics === "skip") return { characterDynamicsCount: 0, unresolvedIdentityCount: 0 };
  const { novelId, chapterId, order } = context.run.progress.unit;
  const characters = await tx.character.findMany({ where: { novelId }, select: { id: true, name: true } });
  const volume = await tx.volumePlan.findFirst({ where: { novelId, chapters: { some: { chapterOrder: order } } }, select: { id: true } });
  const sourceType = "chapter_artifact_delta";
  const where = { novelId, chapterId, sourceType };
  await tx.characterFactionTrack.deleteMany({ where });
  await tx.characterRelationStage.deleteMany({ where });
  let count = 0; let unresolvedIdentityCount = 0;
  for (const update of output.factionUpdates) {
    const characterId = exactCharacter(characters, { name: update.characterName });
    if (!characterId) { unresolvedIdentityCount++; continue; }
    await tx.characterFactionTrack.create({ data: { novelId, chapterId, chapterOrder: order, characterId, volumeId: volume?.id ?? null,
      sourceType, factionLabel: update.factionLabel, stanceLabel: nullable(update.stanceLabel), summary: nullable(update.summary), confidence: update.confidence ?? null } });
    count++;
  }
  for (const update of output.relationDynamics) {
    const sourceCharacterId = exactCharacter(characters, { name: update.sourceCharacterName });
    const targetCharacterId = exactCharacter(characters, { name: update.targetCharacterName });
    if (!sourceCharacterId || !targetCharacterId || sourceCharacterId === targetCharacterId) { unresolvedIdentityCount++; continue; }
    const relation = await tx.characterRelation.findFirst({ where: { novelId, sourceCharacterId, targetCharacterId }, select: { id: true } });
    await tx.characterRelationStage.updateMany({ where: { novelId, sourceCharacterId, targetCharacterId, isCurrent: true }, data: { isCurrent: false } });
    await tx.characterRelationStage.create({ data: { novelId, chapterId, chapterOrder: order, sourceCharacterId, targetCharacterId,
      relationId: relation?.id ?? null, volumeId: volume?.id ?? null, sourceType, stageLabel: update.stageLabel, stageSummary: update.stageSummary,
      nextTurnPoint: nullable(update.nextTurnPoint), confidence: update.confidence ?? null, isCurrent: true } });
    count++;
  }
  return { characterDynamicsCount: count, unresolvedIdentityCount };
};
