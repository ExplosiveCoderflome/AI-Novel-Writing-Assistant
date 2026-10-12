import type {Prisma} from "@prisma/client";
import {chapterPlanEditSchema, chapterPlanRevisionKey, type ChapterPlanEdit} from "@ai-novel/shared/types/director/revision";
import {parseChapterScenePlan, serializeChapterScenePlan} from "@ai-novel/shared/types/chapterLengthControl";
import type {VolumePlanDocument} from "@ai-novel/shared/types/novel";
import type {RunContract} from "../../../modules/director";
import {AppError} from "../../../middleware/errorHandler";

/** The gate transaction owns the save; client input never chooses another chapter or writes prose. */
export async function saveChapterPlanEdit(contract: RunContract, raw: ChapterPlanEdit, tx: Prisma.TransactionClient): Promise<void> {
  const parsed = chapterPlanEditSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("请填写完整的章节任务、场景与目标字数。", 400);
  const edit = parsed.data;
  const scenePlan = parseChapterScenePlan(edit.sceneCards, {targetWordCount: edit.targetWordCount});
  if (!scenePlan) throw new AppError("请填写至少 3 个完整场景，每个场景需包含目标、入场状态、离场状态与字数。", 400);
  const from = contract.chapterRange?.from;
  if (!from) throw new AppError("缺少本阶段的章节授权范围。", 400);
  const rows = await tx.volumeChapterPlan.findMany({where: {volume: {novelId: contract.novelId, status: "active"}, chapterOrder: from}});
  const version = await tx.volumePlanVersion.findFirst({where: {novelId: contract.novelId, status: "active"}, orderBy: {version: "desc"}});
  if (rows.length !== 1 || !version) throw new AppError("无法定位当前章节计划，请刷新本书。", 409);
  const row = rows[0];
  if (contract.launchInput?.targetVolumeId && row.volumeId !== contract.launchInput.targetVolumeId) throw new AppError("章节计划不属于本次选择的卷。", 409);
  const document = JSON.parse(version.contentJson) as VolumePlanDocument;
  const matches = document.volumes?.filter(volume => volume.id === row.volumeId)
    .flatMap(volume => volume.chapters.filter(chapter => chapter.id === row.id && chapter.chapterOrder === from)) ?? [];
  if (matches.length !== 1 || chapterPlanRevisionKey(matches[0]) !== edit.baseRevision || chapterPlanRevisionKey(row) !== edit.baseRevision) {
    throw new AppError("章节计划已变化，请刷新后重新编辑。", 409);
  }
  const saved = {taskSheet: edit.taskSheet, sceneCards: serializeChapterScenePlan(scenePlan), targetWordCount: edit.targetWordCount, mustAvoid: edit.mustAvoid};
  Object.assign(matches[0], saved);
  await tx.volumeChapterPlan.update({where: {id: row.id}, data: saved});
  await tx.volumePlanVersion.update({where: {id: version.id}, data: {contentJson: JSON.stringify(document)}});
}
