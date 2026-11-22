import type { Prisma } from "@prisma/client";
import type { BatchProseReview } from "@ai-novel/shared/types/director/proseReview/discussion";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { hashProductionContent } from "../../../../modules/production";
import type { RunContract } from "../../../../modules/director";
import { assertNovelDirectorVersion, readRunExecutionEpoch } from "../../../../modules/novel/director-routing";
import { saveManualChapterContent } from "../../../../services/novel/chapterEditor/persistence/ManualChapterStore";
import { queueRagUpsert } from "../../../../services/novel/novelCoreSupport";
import { nextProseBatchRange } from "./range";

type Chapter = { id: string; order: number; content: string | null };
function matchesReview(rows: readonly Chapter[], contract: RunContract, review: BatchProseReview) {
  const range = contract.chapterRange;
  if (
    !range ||
    review.chapters.length !== range.to - range.from + 1 ||
    rows.length !== review.chapters.length ||
    rows.some(
      (row, i) => row.order !== range.from + i || row.id !== review.chapters[i].chapterId || !row.content?.trim(),
    )
  ) {
    throw new AppError("正文范围或章序有变化，请重新打开本批正文。", 409);
  }
}
async function verifyNextRange(tx: Prisma.TransactionClient, contract: RunContract, review: BatchProseReview) {
  if (!review.nextRange) return;
  const rows = await tx.chapter.findMany({
    where: { novelId: contract.novelId },
    select: { order: true, content: true },
  });
  const next = nextProseBatchRange(
    rows,
    contract.launchInput?.estimatedChapterCount ?? 0,
    Boolean(contract.launchInput?.outlineBinding),
  );
  if (!next || next.from !== review.nextRange.from || next.to !== review.nextRange.to) {
    throw new AppError("待写章节范围有变化，请重新打开正文确认页。", 409);
  }
}

/** Persist all selected edits and their sync obligations before slow synchronization. A retry accepts exactly its saved text. */
export async function prepareProseEdits(contract: RunContract, review: BatchProseReview, version: number) {
  const range = contract.chapterRange;
  if (!range) throw new AppError("缺少本批正文范围。", 409);
  const changedIds = await prisma.$transaction(
    async (tx) => {
      await assertNovelDirectorVersion(contract.novelId, "v2", readRunExecutionEpoch(JSON.stringify(contract)), tx);
      const control = await tx.directorNextRunControl.findUnique({ where: { runId: contract.runId } });
      const types = control?.gateJson ? JSON.parse(control.gateJson)?.artifactTypes : undefined;
      if (
        !control ||
        control.novelId !== contract.novelId ||
        control.status !== "waiting_gate" ||
        control.version !== version ||
        !Array.isArray(types) ||
        types.length !== 1 ||
        types[0] !== "chapter_batch_closed"
      ) {
        throw new AppError("本批正文确认已结束或有变化，请刷新导演台。", 409);
      }
      const claimed = await tx.directorNextRunControl.updateMany({
        where: { runId: contract.runId, status: "waiting_gate", version, gateJson: control.gateJson },
        data: { version },
      });
      if (!claimed.count) throw new AppError("确认阶段有变化，请刷新导演台。", 409);
      await verifyNextRange(tx, contract, review);
      const rows = await tx.chapter.findMany({
        where: { novelId: contract.novelId, order: { gte: range.from, lte: range.to } },
        orderBy: { order: "asc" },
        select: { id: true, novelId: true, order: true, content: true, updatedAt: true },
      });
      matchesReview(rows, contract, review);
      const changed: string[] = [];
      for (const [i, row] of rows.entries()) {
        const { baseHash, content } = review.chapters[i];
        if (content !== undefined && row.content === content) continue;
        if (hashProductionContent(row.content!) !== baseHash)
          throw new AppError(`第 ${row.order} 章有新正文，请重新打开并核对修改。`, 409);
        if (content !== undefined) {
          await saveManualChapterContent(tx, row, content);
          changed.push(row.id);
        }
      }
      return changed;
    },
    { isolationLevel: "Serializable" },
  );
  for (const id of changedIds) queueRagUpsert("chapter", id);
}

/** The gate can release only the exact bodies reviewed, even if a different editor saved during synchronization. */
export async function verifyReviewedProse(
  tx: Prisma.TransactionClient,
  contract: RunContract,
  rows: readonly Chapter[],
  review: BatchProseReview,
) {
  matchesReview(rows, contract, review);
  for (const [i, row] of rows.entries()) {
    const item = review.chapters[i];
    if (
      item.content !== undefined ? row.content !== item.content : hashProductionContent(row.content!) !== item.baseHash
    ) {
      throw new AppError(`第 ${row.order} 章在确认期间有变化，请重新核对。`, 409);
    }
  }
  await verifyNextRange(tx, contract, review);
}
