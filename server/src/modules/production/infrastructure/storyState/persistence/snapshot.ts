import { detectStateDiffConflicts } from "../../../../../services/state/stateConflictDetection";
import { exactCharacter } from "./ownership";
import { nullable, wire, type ConsumerWriter } from "./types";

export const writeSnapshot: ConsumerWriter = async ({ tx, context, output }) => {
  if (output.syncPlan.stateSnapshot === "skip") return { stateSnapshotId: null };
  const { novelId, chapterId, order } = context.run.progress.unit;
  const characters = await tx.character.findMany({ where: { novelId }, select: { id: true, name: true } });
  const chapters = await tx.chapter.findMany({ where: { novelId }, select: { id: true, order: true } });
  const reference = (value: string | null | undefined, fallback: string | null) => value
    ? chapters.find(chapter => chapter.id === value || String(chapter.order) === value)?.id ?? null : fallback;
  const include = { characterStates: true, relationStates: true, informationStates: true, foreshadowStates: true };
  const previous = await tx.storyStateSnapshot.findFirst({ where: { novelId, sourceChapter: { order: { lt: order } } },
    orderBy: [{ sourceChapter: { order: "desc" } }, { createdAt: "desc" }], include });
  const summary = nullable(output.stateDeltas.summary) ?? output.summary;
  const snapshot = await tx.storyStateSnapshot.upsert({ where: { novelId_sourceChapterId: { novelId, sourceChapterId: chapterId } },
    create: { novelId, sourceChapterId: chapterId, summary, rawStateJson: JSON.stringify(output.stateDeltas) },
    update: { summary, rawStateJson: JSON.stringify(output.stateDeltas) }, select: { id: true } });
  await tx.characterState.deleteMany({ where: { snapshotId: snapshot.id } });
  await tx.relationState.deleteMany({ where: { snapshotId: snapshot.id } });
  await tx.informationState.deleteMany({ where: { snapshotId: snapshot.id } });
  await tx.foreshadowState.deleteMany({ where: { snapshotId: snapshot.id } });
  let unresolvedIdentityCount = 0;
  for (const state of output.stateDeltas.characterStates) {
    const characterId = exactCharacter(characters, { id: state.characterId, name: state.characterName });
    if (!characterId) { unresolvedIdentityCount++; continue; }
    await tx.characterState.create({ data: { snapshotId: snapshot.id, characterId, currentGoal: nullable(state.currentGoal),
      emotion: nullable(state.emotion), stressLevel: state.stressLevel == null ? null : Math.round(state.stressLevel),
      secretExposure: nullable(state.secretExposure), knownFactsJson: JSON.stringify(state.knownFacts), misbeliefsJson: JSON.stringify(state.misbeliefs), summary: nullable(state.summary) } });
  }
  for (const state of output.stateDeltas.relationStates) {
    const sourceCharacterId = exactCharacter(characters, { id: state.sourceCharacterId, name: state.sourceCharacterName });
    const targetCharacterId = exactCharacter(characters, { id: state.targetCharacterId, name: state.targetCharacterName });
    if (!sourceCharacterId || !targetCharacterId || sourceCharacterId === targetCharacterId) { unresolvedIdentityCount++; continue; }
    const score = (value: number | null | undefined) => value == null ? null : Math.round(value);
    await tx.relationState.create({ data: { snapshotId: snapshot.id, sourceCharacterId, targetCharacterId,
      trustScore: score(state.trustScore), intimacyScore: score(state.intimacyScore), conflictScore: score(state.conflictScore),
      dependencyScore: score(state.dependencyScore), summary: nullable(state.summary) } });
  }
  for (const state of output.stateDeltas.informationStates) {
    const holderRefId = state.holderType === "character" ? exactCharacter(characters, { id: state.holderRefId, name: state.holderRefName }) : null;
    if (state.holderType === "character" && !holderRefId) { unresolvedIdentityCount++; continue; }
    await tx.informationState.create({ data: { snapshotId: snapshot.id, holderType: state.holderType, holderRefId,
      fact: state.fact, status: state.status, summary: nullable(state.summary) } });
  }
  for (const state of output.stateDeltas.foreshadowStates) {
    await tx.foreshadowState.create({ data: { snapshotId: snapshot.id, title: state.title, summary: nullable(state.summary),
      status: state.status, setupChapterId: reference(state.setupChapterId, chapterId), payoffChapterId: reference(state.payoffChapterId, null) } });
  }
  const current = await tx.storyStateSnapshot.findUniqueOrThrow({ where: { id: snapshot.id }, include });
  // Existing deterministic projection of structured state output; no new conflict classifier.
  const detected = detectStateDiffConflicts({ characters, previousSnapshot: previous, currentSnapshot: current });
  const active = detected.conflicts.map(item => item.conflictKey);
  if (detected.trackedConflictKeys.length) await tx.openConflict.updateMany({ where: { novelId, sourceType: "state_diff", status: "open",
    conflictKey: { in: detected.trackedConflictKeys, notIn: active } }, data: { status: "resolved" } });
  for (const conflict of detected.conflicts) {
    await tx.openConflict.updateMany({ where: { novelId, sourceType: "state_diff", conflictKey: conflict.conflictKey, status: "open", NOT: { chapterId } }, data: { status: "resolved" } });
    const data = { sourceSnapshotId: snapshot.id, sourceIssueId: null, conflictType: conflict.conflictType, title: conflict.title,
      summary: conflict.summary, severity: conflict.severity, status: "open", evidenceJson: JSON.stringify(conflict.evidence),
      affectedCharacterIdsJson: JSON.stringify(conflict.affectedCharacterIds), resolutionHint: conflict.resolutionHint, lastSeenChapterOrder: order };
    await tx.openConflict.upsert({ where: { novelId_chapterId_sourceType_conflictKey: { novelId, chapterId, sourceType: "state_diff", conflictKey: conflict.conflictKey } },
      create: { novelId, chapterId, sourceType: "state_diff", conflictKey: conflict.conflictKey, ...data }, update: data });
  }
  return wire({ stateSnapshotId: snapshot.id, unresolvedIdentityCount });
};
