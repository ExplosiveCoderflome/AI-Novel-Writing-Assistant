import { exactCharacter } from "./ownership";
import { compact, nullable, type ConsumerWriter } from "./types";

export const writeKnowledge: ConsumerWriter = async ({ tx, context, output }) => {
  const novelId = context.run.progress.unit.novelId;
  const characters = await tx.character.findMany({ where: { novelId }, select: { id: true, name: true, currentState: true } });
  let count = 0; let unresolvedIdentityCount = 0;
  for (const update of output.characterKnowledgeStates) {
    const id = exactCharacter(characters, { name: update.characterName });
    if (!id) { unresolvedIdentityCount++; continue; }
    if (!update.knownFacts.length && !update.hiddenFacts.length) continue;
    const boundary = `【信息边界】已知：${update.knownFacts.join("；") || "无新增"}未知/不应超前知情：${update.hiddenFacts.join("；") || "无"}`.slice(0, 1200);
    const original = characters.find(character => character.id === id)?.currentState ?? "";
    const base = original.replace(/\n?【信息边界】[^\n]*/g, "").trim();
    const currentState = [base.slice(0, Math.max(0, 1199 - boundary.length)).trim(), boundary].filter(Boolean).join("\n");
    if (currentState === original) continue;
    await tx.character.update({ where: { id, novelId }, data: { currentState } }); count++;
  }
  return { characterKnowledgeStateCount: count, unresolvedIdentityCount };
};

export const writeMind: ConsumerWriter = async ({ tx, context, output }) => {
  const { novelId, chapterId } = context.run.progress.unit;
  const characters = await tx.character.findMany({ where: { novelId }, select: { id: true, name: true } });
  let count = 0; let unresolvedIdentityCount = 0;
  for (const update of output.characterMindDeltas) {
    const characterId = exactCharacter(characters, { name: update.characterName });
    if (!characterId) { unresolvedIdentityCount++; continue; }
    await tx.characterMindSnapshot.deleteMany({ where: { novelId, characterId, sourceChapterId: chapterId, sourceType: "artifact_delta" } });
    await tx.characterMindSnapshot.updateMany({ where: { novelId, characterId, isCurrent: true }, data: { isCurrent: false } });
    await tx.characterMindSnapshot.create({ data: { novelId, characterId, sourceChapterId: chapterId, sourceType: "artifact_delta",
      currentInterpretation: compact(update.currentInterpretation), privateIntent: nullable(update.privateIntent), activePlan: nullable(update.activePlan),
      emotionalStance: nullable(update.emotionalStance), actionTendency: nullable(update.actionTendency), decisionTrigger: nullable(update.decisionTrigger),
      beliefsJson: JSON.stringify(update.beliefs), misbeliefsJson: JSON.stringify(update.misbeliefs), evidenceJson: JSON.stringify(update.evidence),
      confidence: update.confidence ?? null, isCurrent: true } }); count++;
  }
  return { characterMindSnapshotCount: count, unresolvedIdentityCount };
};
