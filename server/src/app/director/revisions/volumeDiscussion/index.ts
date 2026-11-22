import type { Prisma } from "@prisma/client";
import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { volumeReviewFields } from "@ai-novel/shared/types/director/revision";
import { volumeDraftSchema, volumeReplySchema, volumeProposalChanges } from "@ai-novel/shared/types/director/volumeReview/discussion";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { volumeReviewDialoguePrompt } from "../../../../prompting/prompts/novel/volume/reviewDialogue.prompt";
import { getActiveVersionRow } from "../../../../services/novel/volume/volumeWorkspacePersistence";
import { normalizeVolumeDraftInput } from "../../../../services/novel/volume/volumePlanUtils";
import { DIRECTOR_PLANNED_VOLUME_STATUSES } from "../../planning";
import { reviewConversationRouter, type Address } from "../discussion";

async function read(db: Prisma.TransactionClient, { novelId, resourceId, planVersionId }: Address) {
  const version = await getActiveVersionRow(novelId, db);
  if (!version || version.id !== planVersionId) throw new AppError("卷纲版本有变化，请重新打开卷纲确认页。", 409);
  const snapshot = JSON.parse(version.contentJson) as VolumePlanDocument;
  if (!Array.isArray(snapshot.volumes) || snapshot.volumes.filter(item => item.id === resourceId).length !== 1) throw new AppError("在这份卷纲中无法定位所选分卷。", 404);
  const volumes = normalizeVolumeDraftInput(novelId, snapshot.volumes.map(item => ({ ...item, chapters: [] })));
  const index = volumes.findIndex(item => item.id === resourceId);
  const volume = volumes[index];
  if (!volume) throw new AppError("在这份卷纲中找不到所选分卷。", 404);
  const base = { summary: volume.summary ?? "", mainPromise: volume.mainPromise ?? "", climax: volume.climax ?? "", nextVolumeHook: volume.nextVolumeHook ?? "" };
  const row = await db.volumePlan.findFirst({ where: { id: resourceId, novelId, status: { in: [...DIRECTOR_PLANNED_VOLUME_STATUSES] } },
    select: { sourceVersionId: true, summary: true, mainPromise: true, climax: true, nextVolumeHook: true } });
  // Legacy books can keep the entire plan in the active version without relational rows.
  const inconsistent = row
    ? Boolean(row.sourceVersionId && row.sourceVersionId !== version.id) || volumeReviewFields.some(field => (row[field]?.trim() ?? "") !== base[field])
    : await db.volumePlan.count({ where: { novelId } }) > 0;
  if (inconsistent) {
    throw new AppError("分卷资料有变化，请重新打开卷纲确认页。", 409);
  }
  const previous = volumes[index - 1], next = volumes[index + 1];
  return { base, volume: { title: volume.title, sortOrder: volume.sortOrder, openingHook: volume.openingHook, pressure: volume.primaryPressureSource },
    previousVolume: previous ? { title: previous.title, summary: previous.summary, nextVolumeHook: previous.nextVolumeHook } : null,
    nextVolume: next ? { title: next.title, summary: next.summary, mainPromise: next.mainPromise } : null };
}

export function volumeConversationRouter() {
  return reviewConversationRouter("/novels/:novelId/runs/:runId/volume-review/:version/plans/:planVersionId/volumes/:resourceId/conversation", {
    artifact: "volume_strategy", scope: "director-volume", stage: "volume_strategy", progress: "正在读本卷故事和前后卷的安排…",
    draft: volumeDraftSchema, reply: volumeReplySchema, changes: volumeProposalChanges, read,
    async generate({ volume, previousVolume, nextVolume }, draft, context, options) {
      return (await runStructuredPrompt({ asset: volumeReviewDialoguePrompt,
        promptInput: { ...context, volume: { ...volume, ...draft }, previousVolume, nextVolume }, options })).output;
    },
  });
}
