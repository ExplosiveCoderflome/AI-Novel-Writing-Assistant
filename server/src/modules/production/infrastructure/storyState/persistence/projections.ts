import { characterLocationProjectionSchema } from "@ai-novel/shared/types/characterLocation";
import { projectLocationDeltas } from "../../../../../services/novel/characters/locations/locationProjection";
import { exactCharacter } from "./ownership";
import { compact, wire, type ConsumerWriter } from "./types";
import { buildChapterArtifactContentHash } from "../../../../../services/novel/runtime/artifactSync/ChapterArtifactContentVersion";

export const writeLocations: ConsumerWriter = async ({ tx, context, output }) => {
  const { novelId, chapterId, order } = context.run.progress.unit;
  const characters = await tx.character.findMany({ where: { novelId }, select: { id: true, name: true } });
  const contentProvenance = context.run.progress.debts?.length ? "debt" : "confirmed";
  const contentHash = buildChapterArtifactContentHash(context.content);
  const projection = characterLocationProjectionSchema.parse({ schemaVersion: 1, novelId, chapterId,
    chapterOrder: order, contentHash, contentProvenance,
    records: projectLocationDeltas({ content: context.content, characters, deltas: output.characterLocationDeltas, contentProvenance }) });
  // Preserve the existing readers' wire identity; the caller's route/version policy lives outside the kernel.
  const identity = { novelId, chapterId, contentHash, artifactType: "character_location_projection:v1", syncMode: "director_v2" };
  const data = { status: "succeeded", metadataJson: JSON.stringify(projection), sourceType: "chapter_artifact_delta", sourceStage: "production_kernel" };
  await tx.chapterArtifactSyncCheckpoint.upsert({ where: { novelId_chapterId_contentHash_artifactType_syncMode: identity }, create: { ...identity, ...data }, update: data });
  return wire(projection);
};

export const writeAppearances: ConsumerWriter = async ({ tx, context, output }) => {
  const { novelId, chapterId } = context.run.progress.unit;
  const characters = await tx.character.findMany({ where: { novelId }, select: { id: true, name: true } });
  const records: NonNullable<typeof output.characterAppearances> = [];
  let complete = output.characterAppearances !== undefined && !await tx.characterCandidate.count({ where: { novelId, sourceChapterId: chapterId, status: "v2_pending" } });
  for (const item of output.characterAppearances ?? []) {
    const characterId = exactCharacter(characters, { id: item.characterId, name: item.characterName });
    if (!characterId || !compact(item.evidence) || !compact(context.content).includes(compact(item.evidence))) { complete = false; continue; }
    if (!records.some(record => record.characterId === characterId && record.kind === item.kind)) records.push({ ...item, characterId });
  }
  const result = { schemaVersion: 1, records, coverage: complete ? "recorded" : "untracked" };
  const identity = { novelId, chapterId, contentHash: buildChapterArtifactContentHash(context.content), artifactType: "director_v2_character_appearances:v1", syncMode: "director_v2" };
  const data = { status: "succeeded", metadataJson: JSON.stringify(result) };
  await tx.chapterArtifactSyncCheckpoint.upsert({ where: { novelId_chapterId_contentHash_artifactType_syncMode: identity }, create: { ...identity, ...data }, update: data });
  return wire(result);
};
