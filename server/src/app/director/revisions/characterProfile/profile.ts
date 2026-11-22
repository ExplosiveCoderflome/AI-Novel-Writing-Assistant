import type { Prisma } from "@prisma/client";
import {
  characterProfileDraftSchema, characterProfileFields, type CharacterProfileSave, type CharacterProfileWorkspace,
} from "@ai-novel/shared/types/director/characterProfile";
import { isInitializationPlaceholderVolumeWorkspace } from "@ai-novel/shared/types/volumePlanning";
import { prisma } from "../../../../db/prisma";
import { withSqliteRetry } from "../../../../db/sqliteRetry";
import { ragConfig } from "../../../../config/rag";
import { novelEventBus } from "../../../../events/publisher";
import { AppError } from "../../../../middleware/errorHandler";
import { assertNovelDirectorVersion } from "../../../../modules/novel/director-routing";
import { lockNovelForCharacterEdit, readCharacterEditBoundary } from "../../../../services/novel/characters/characterEditBoundary";
import { buildDerivedStructuredOutlineFromVolumes, buildFallbackVolumesFromLegacy } from "../../../../services/novel/volume/volumePlanUtils";
import { normalizeVolumeWorkspaceDocument } from "../../../../services/novel/volume/volumeWorkspaceDocument";
import { getActiveVersionRow, isVolumeRowCurrent } from "../../../../services/novel/volume/volumeWorkspacePersistence";

const staleProfile = "角色资料有更新，请重新打开编辑窗口再保存。";
const protectedName = "本书已有大纲、卷章规划或正文，请保留档案中的姓名以便与已有内容对应。";

const selection = {
  name: true, role: true, storyFunction: true, personality: true, background: true, outerGoal: true,
  innerNeed: true, fear: true, secret: true, moralLine: true, appearance: true, voiceTexture: true, updatedAt: true,
} as const;

async function readRenameBoundary(db: Prisma.TransactionClient, novelId: string) {
  const [book, version, volume, chapter] = await Promise.all([
    db.novel.findUniqueOrThrow({where: {id: novelId}, select: {
      outline: true, structuredOutline: true, outlineBookBinding: {select: {id: true}},
    }}),
    getActiveVersionRow(novelId, db),
    db.volumePlan.findFirst({
      where: {novelId, OR: [{chapters: {some: {}}}, {AND: [{summary: {not: null}}, {summary: {not: ""}}]}]},
      select: {id: true},
    }),
    db.chapter.findFirst({where: {novelId, OR: [
      {AND: [{content: {not: null}}, {content: {not: ""}}]},
      {AND: [{taskSheet: {not: null}}, {taskSheet: {not: ""}}]},
    ]}, select: {id: true}}),
  ]);
  if (book.outlineBookBinding || chapter) return protectedName;
  const outline = book.outline?.trim();
  const structuredOutline = book.structuredOutline?.trim();
  if (!version) return outline || structuredOutline || volume ? protectedName : null;

  // Opening can persist a compatibility volume and its derived outlines before any actual planning.
  const document = normalizeVolumeWorkspaceDocument(novelId, version.contentJson);
  if (document.source !== "legacy" || !isInitializationPlaceholderVolumeWorkspace(document.volumes)
    || document.strategyPlan || document.critiqueReport || document.beatSheets.length || document.rebalanceDecisions.length) {
    return protectedName;
  }
  const starter = buildDerivedStructuredOutlineFromVolumes(buildFallbackVolumesFromLegacy(novelId, {chapters: []}));
  if (document.derivedStructuredOutline !== starter
    || (outline && outline !== document.derivedOutline) || (structuredOutline && structuredOutline !== starter)) {
    return protectedName;
  }
  const [row, extraRow] = await db.volumePlan.findMany({
    where: {novelId}, include: {_count: {select: {chapters: true}}}, take: 2,
  });
  const [placeholder] = document.volumes;
  if (row && (extraRow || row.id !== placeholder.id || row._count.chapters || !isVolumeRowCurrent(row, placeholder, version.id))) {
    return protectedName;
  }
  return null;
}

export async function readCharacterProfile(db: Prisma.TransactionClient, novelId: string, characterId: string, lock = false) {
  if (lock) await lockNovelForCharacterEdit(db, novelId);
  await assertNovelDirectorVersion(novelId, "v2", undefined, db);
  const [character, boundary, renameBlockedReason] = await Promise.all([
    db.character.findFirst({where: {id: characterId, novelId}, select: selection}),
    readCharacterEditBoundary(db, novelId, lock),
    readRenameBoundary(db, novelId),
  ]);
  if (!character) throw new AppError("本书没有这个角色。", 404);
  const workspace: CharacterProfileWorkspace = {
    fields: characterProfileDraftSchema.parse(Object.fromEntries(characterProfileFields.map(field => [field, character[field] ?? ""]))),
    editBlockedReason: boundary.reason,
    renameBlockedReason,
  };
  return {workspace, runId: boundary.run?.runId, updatedAt: character.updatedAt};
}

export async function saveCharacterProfile(novelId: string, characterId: string, {changes}: CharacterProfileSave) {
  const saved = await withSqliteRetry(() => prisma.$transaction(async tx => {
    const {workspace, updatedAt} = await readCharacterProfile(tx, novelId, characterId, true);
    if (workspace.editBlockedReason) throw new AppError(workspace.editBlockedReason, 409);
    if (changes.some(({field, before}) => workspace.fields[field] !== before)) throw new AppError(staleProfile, 409);
    const nextName = changes.find(change => change.field === "name")?.after;
    if (nextName !== undefined) {
      if (workspace.renameBlockedReason) throw new AppError(workspace.renameBlockedReason, 409);
      const existing = await tx.character.findFirst({where: {novelId, name: nextName, id: {not: characterId}}, select: {id: true}});
      if (existing) throw new AppError("本书已有同名角色，请换一个姓名。", 409);
    }
    const data = Object.fromEntries(changes.map(({field, after}) => [field, after || null]));
    // Match original field values as well as the row timestamp, including two saves in the same millisecond.
    const originals = changes.map(({field, before}) => (before ? {[field]: before} : {OR: [{[field]: null}, {[field]: ""}]}));
    const updated = await tx.character.updateMany({where: {id: characterId, novelId, updatedAt, AND: originals}, data});
    if (updated.count !== 1) throw new AppError(staleProfile, 409);
    if (ragConfig.enabled) await tx.ragIndexJob.create({data: {
      tenantId: ragConfig.defaultTenantId, jobType: "upsert", ownerType: "character", ownerId: characterId, maxAttempts: ragConfig.workerMaxAttempts,
    }});
    return {...workspace, fields: {...workspace.fields, ...Object.fromEntries(changes.map(({field, after}) => [field, after]))}};
  }, {isolationLevel: "Serializable"}), {label: "director.character_profile"});
  await novelEventBus.emit({type: "character:changed", payload: {novelId, characterId}});
  return saved;
}
