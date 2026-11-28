import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  characterForwardFieldLabels, characterForwardFieldNames,
  type CharacterForwardApply, type CharacterForwardFields, type CharacterForwardPreview,
} from "@ai-novel/shared/types/characterForwardAdjustment";
import { prisma } from "../../../../db/prisma";
import { withSqliteRetry } from "../../../../db/sqliteRetry";
import { novelEventBus } from "../../../../events/publisher";
import { AppError } from "../../../../middleware/errorHandler";
import { assertNovelDirectorVersion } from "../../../../modules/novel/director-routing/ownership";
import { queueRagUpsert } from "../../novelCoreSupport";
import { lockNovelForCharacterEdit, readCharacterEditBoundary } from "../characterEditBoundary";
import { readChapterCharacterAdjustments } from "./chapterFields";
import type { ForwardFieldPatch } from "./fieldPolicy";
import { previewForwardPlans, readForwardChapterBoundary } from "./plans";

const conflict = "创作进度或角色资料有变化，请重新预览后保存。";

async function readInputs(db: Prisma.TransactionClient, novelId: string, characterId: string, lock = false) {
  if (lock) await lockNovelForCharacterEdit(db, novelId);
  const identity = await assertNovelDirectorVersion(novelId, "v2", undefined, db);
  const [runBoundary, boundary, book, character, last] = await Promise.all([
    readCharacterEditBoundary(db, novelId, lock),
    readForwardChapterBoundary(db, novelId),
    db.novel.findUniqueOrThrow({ where: { id: novelId }, select: { estimatedChapterCount: true } }),
    db.character.findFirst({
      where: { id: characterId, novelId },
      select: { id: true, name: true, currentState: true, currentGoal: true, development: true, updatedAt: true },
    }),
    db.characterForwardAdjustment.findFirst({
      where: { novelId, characterId }, orderBy: { revision: "desc" }, select: { revision: true },
    }),
  ]);
  if (!character) throw new AppError("本书没有这个角色。", 404);

  const { next } = boundary;
  const [adjustments, snapshot, affectedPlans] = await Promise.all([
    last ? readChapterCharacterAdjustments(db, novelId, next, false, characterId) : new Map<string, ForwardFieldPatch>(),
    db.storyStateSnapshot.findFirst({
      where: { novelId, sourceChapter: { order: { lt: next } }, characterStates: { some: { characterId } } },
      orderBy: [{ sourceChapter: { order: "desc" } }, { createdAt: "desc" }],
      select: { characterStates: { where: { characterId }, select: { currentGoal: true, summary: true } } },
    }),
    previewForwardPlans(db, novelId, boundary, character),
  ]);
  const fields: CharacterForwardFields = {
    currentState: snapshot?.characterStates[0]?.summary?.trim() || character.currentState,
    currentGoal: snapshot?.characterStates[0]?.currentGoal?.trim() || character.currentGoal,
    development: character.development,
    ...adjustments.get(characterId),
  };
  const { run } = runBoundary;
  const fingerprint = createHash("sha256").update(JSON.stringify([
    identity.epoch, run?.runId, run?.version, next, character.updatedAt,
    last?.revision, fields, affectedPlans,
  ])).digest("hex");
  const blockedReason = runBoundary.reason ?? (
    [...boundary.completed].some(order => order > next) ? "请先补齐前面未完成的章节，再调整后续角色。"
      : book.estimatedChapterCount && next > book.estimatedChapterCount && !boundary.chapters.some(chapter => chapter.order === next)
        && !affectedPlans.length ? "本书的目标章节均已完成，没有可调整的后续章节。" : null
  );
  const preview: CharacterForwardPreview = { effectiveFromChapterOrder: next, fields, fingerprint, blockedReason, affectedPlans };
  return { character, preview, revision: (last?.revision ?? 0) + 1, runId: run?.runId };
}

export async function previewCharacterForwardAdjustment(novelId: string, characterId: string) {
  return (await readInputs(prisma, novelId, characterId)).preview;
}

export async function applyCharacterForwardAdjustment(novelId: string, characterId: string, input: CharacterForwardApply) {
  const saved = await withSqliteRetry(() => prisma.$transaction(async tx => {
    const { character, preview, revision, runId } = await readInputs(tx, novelId, characterId, true);
    if (preview.blockedReason) throw new AppError(preview.blockedReason, 409);
    if (preview.fingerprint !== input.fingerprint || preview.effectiveFromChapterOrder !== input.effectiveFromChapterOrder) {
      throw new AppError(conflict, 409);
    }
    const changed = characterForwardFieldNames.filter(field => (
      input.fields[field] !== undefined && input.fields[field] !== (preview.fields[field]?.trim() || null)
    ));
    if (!changed.length) throw new AppError("请至少修改一项角色资料。", 400);
    const before = Object.fromEntries(changed.map(field => [field, character[field]]));
    const after = Object.fromEntries(changed.map(field => [field, input.fields[field]]));
    const createdAt = new Date();
    const where = { id: characterId, novelId, updatedAt: character.updatedAt };
    const write = await tx.character.updateMany({
      where, data: { ...after, ...(changed.some(field => field !== "development") ? { lastEvolvedAt: createdAt } : {}) },
    });
    if (write.count !== 1) throw new AppError(conflict, 409);
    await tx.characterForwardAdjustment.create({ data: {
      novelId, characterId, revision, effectiveFromChapterOrder: preview.effectiveFromChapterOrder,
      runId, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(after), createdAt,
    } });
    await tx.characterTimeline.create({ data: {
      novelId, characterId, chapterOrder: preview.effectiveFromChapterOrder,
      title: "作者调整", content: `调整了${changed.map(field => characterForwardFieldLabels[field]).join("、")}。`, source: "author_adjust",
    } });
    return { effectiveFromChapterOrder: preview.effectiveFromChapterOrder };
  }), { label: "director.character_forward_adjustment" });
  queueRagUpsert("character", characterId);
  await novelEventBus.emit({ type: "character:changed", payload: { novelId, characterId } });
  return saved;
}
