import type {Prisma} from "@prisma/client";
import type {VolumePlanDocument} from "@ai-novel/shared/types/novel";
import {reviewAssetEditSchema, type ReviewAssetEdit} from "@ai-novel/shared/types/director/revision";
import {ragConfig} from "../../../config/rag";
import {AppError} from "../../../middleware/errorHandler";
import {assertOutlineWorkspaceWrite} from "../../../modules/planning/outline/constraints";
import {normalizeVolumeWorkspaceDocument} from "../../../services/novel/volume/volumeWorkspaceDocument";
import {getActiveVersionRow, syncVolumeArc} from "../../../services/novel/volume/volumeWorkspacePersistence";
import {DIRECTOR_PLANNED_VOLUME_STATUSES} from "../planning";

function changed(): never {
  throw new AppError("资料与打开编辑时不同，请关闭编辑窗口，重新读取后再修改。", 409);
}

/** Save only selected fields inside the command transaction. Other authors' edits can coexist. */
export async function saveReviewAssetEdit(novelId: string, raw: ReviewAssetEdit, tx: Prisma.TransactionClient) {
  const result = reviewAssetEditSchema.safeParse(raw);
  if (!result.success) throw new AppError("请检查修改的字段和内容。", 400);
  const edit = result.data;
  if (edit.type === "character_cast") {
    const ids = new Set<string>();
    for (const {id, field, before, after} of edit.changes) {
      const match = before === "" ? {OR: [{[field]: null}, {[field]: ""}]} : {[field]: before};
      const updated = await tx.character.updateMany({
        where: {id, novelId, ...match},
        data: {[field]: after || null, ...(field === "currentGoal" ? {lastEvolvedAt: new Date()} : {})},
      });
      if (!updated.count) changed();
      ids.add(id);
    }
    if (ragConfig.enabled) await tx.ragIndexJob.createMany({data: [...ids].map(ownerId => ({
      tenantId: ragConfig.defaultTenantId, jobType: "upsert", ownerType: "character", ownerId, maxAttempts: ragConfig.workerMaxAttempts,
    }))});
    return;
  }

  const version = await getActiveVersionRow(novelId, tx);
  if (!version) changed();
  const snapshot = JSON.parse(version.contentJson) as VolumePlanDocument;
  const original = normalizeVolumeWorkspaceDocument(novelId, snapshot);
  const hasRows = await tx.volumePlan.count({where: {novelId}});
  for (const {id, field, before, after} of edit.changes) {
    const matches = snapshot.volumes.filter(volume => volume.id === id);
    if (matches.length !== 1 || (matches[0][field]?.trim() ?? "") !== before) changed();
    matches[0][field] = after || null;
    // Older workspaces can store their entire plan in the active version alone.
    if (hasRows) {
      const row = await tx.volumePlan.findFirst({where: {id, novelId, status: {in: [...DIRECTOR_PLANNED_VOLUME_STATUSES]}}});
      if (!row || (row[field]?.trim() ?? "") !== before || (row.sourceVersionId && row.sourceVersionId !== version.id)) changed();
      const saved = await tx.volumePlan.updateMany({where: {id, novelId, updatedAt: row.updatedAt, [field]: row[field]}, data: {[field]: after || null}});
      if (!saved.count) changed();
    }
  }
  const document = normalizeVolumeWorkspaceDocument(novelId, snapshot);
  await assertOutlineWorkspaceWrite(tx, novelId, document);
  snapshot.derivedOutline = document.derivedOutline;
  snapshot.derivedStructuredOutline = document.derivedStructuredOutline;
  const saved = await tx.volumePlanVersion.updateMany({where: {id: version.id, novelId, status: "active", contentJson: version.contentJson}, data: {contentJson: JSON.stringify(snapshot)}});
  if (!saved.count) changed();
  for (const volume of document.volumes) {
    const fields = edit.changes.filter(change => change.id === volume.id).map(change => change.field);
    if (fields.length) await syncVolumeArc(tx, novelId, volume, fields);
  }
  // Refresh derived views only while the book still follows the volume plan.
  await tx.novel.updateMany({where: {id: novelId, OR: [{outline: null}, {outline: original.derivedOutline}]}, data: {outline: document.derivedOutline}});
  await tx.novel.updateMany({where: {id: novelId, OR: [{structuredOutline: null}, {structuredOutline: original.derivedStructuredOutline}]}, data: {structuredOutline: document.derivedStructuredOutline}});
}
