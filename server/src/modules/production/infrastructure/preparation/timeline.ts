import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { UnitRef } from "../../domain";
import { hashProductionContent } from "../../application";
import { canonicalProductionJson, ProductionVersionConflictError } from "../../common";

type TimelineReader = Pick<Prisma.TransactionClient, "chapter" | "chapterArtifactSyncCheckpoint">;
export interface PreparationTimelineSource {
  chapterId: string; order: number; contentHash: string; updatedAt: string;
  closure: { id: string; mode: string; updatedAt: string } | null;
}
export class PreparationSourceRequiredError extends Error {
  readonly code = "PRODUCTION_PREPARATION_SOURCE_REQUIRED";
  constructor(readonly sourceRoute: string, readonly chapterId: string) {
    super("前文章节需要完成时间线整理，请返回来源页处理后继续写作。");
    this.name = "PreparationSourceRequiredError";
  }
}

/** Read every earlier body version; never call the legacy ensure/finalize path. */
export async function readPreparationTimeline(db: TimelineReader, unit: UnitRef, sourceRoute: string): Promise<PreparationTimelineSource[]> {
  const chapters = await db.chapter.findMany({ where: { novelId: unit.novelId, order: { lt: unit.order } },
    select: { id: true, order: true, content: true, updatedAt: true }, orderBy: { order: "asc" } });
  const checkpoints = chapters.length ? await db.chapterArtifactSyncCheckpoint.findMany({
    where: { novelId: unit.novelId, chapterId: { in: chapters.map(chapter => chapter.id) }, artifactType: "timeline_finalization",
      syncMode: { in: ["stable", "degraded", "manual_pending"] } },
    select: { id: true, chapterId: true, contentHash: true, syncMode: true, status: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  }) : [];
  return chapters.map(chapter => {
    const hash = createHash("sha1").update((chapter.content ?? "").trim()).digest("hex");
    const current = checkpoints.filter(row => row.chapterId === chapter.id && row.contentHash === hash);
    const closed = current.find(row => row.status === "succeeded" && ["stable", "degraded"].includes(row.syncMode));
    const pending = current.find(row => row.status === "pending" && row.syncMode === "manual_pending");
    if (chapter.content?.trim() && (!closed || (pending && pending.updatedAt > closed.updatedAt))) {
      throw new PreparationSourceRequiredError(sourceRoute, chapter.id);
    }
    return { chapterId: chapter.id, order: chapter.order, contentHash: hashProductionContent(chapter.content ?? ""),
      updatedAt: chapter.updatedAt.toISOString(), closure: closed ? { id: closed.id, mode: closed.syncMode, updatedAt: closed.updatedAt.toISOString() } : null };
  });
}

/** The caller already holds novel/lease/current-unit locks; these source locks last through commit. */
export async function assertPreparationTimeline(tx: TimelineReader, unit: UnitRef, expected: PreparationTimelineSource[], sourceRoute: string): Promise<void> {
  const current = await readPreparationTimeline(tx, unit, sourceRoute);
  if (canonicalProductionJson(current) !== canonicalProductionJson(expected)) throw new ProductionVersionConflictError();
  for (const source of current) {
    const chapter = await tx.chapter.findFirst({ where: { id: source.chapterId, novelId: unit.novelId }, select: { content: true } });
    if (!chapter || hashProductionContent(chapter.content ?? "") !== source.contentHash) throw new ProductionVersionConflictError();
    const locked = await tx.chapter.updateMany({ where: { id: source.chapterId, novelId: unit.novelId, content: chapter.content,
      updatedAt: new Date(source.updatedAt) }, data: { updatedAt: new Date(source.updatedAt) } });
    if (locked.count !== 1) throw new ProductionVersionConflictError();
  }
}
