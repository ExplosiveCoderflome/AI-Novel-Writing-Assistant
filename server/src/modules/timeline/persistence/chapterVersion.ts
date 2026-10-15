import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";

export function buildTimelineContentHash(content: string): string {
  return createHash("sha1").update(content.trim()).digest("hex");
}

export class TimelineContentVersionError extends Error {
  constructor() {
    super("章节正文版本已变化，时间线同步将使用最新正文。");
    this.name = "TimelineContentVersionError";
  }
}

/** Derived rows are retained as history; planned and manually authored events remain intact. */
export async function supersedeChapterTimeline(
  db: Prisma.TransactionClient,
  input: { novelId: string; chapterId: string },
): Promise<void> {
  await db.storyTimelineEvent.updateMany({
    where: { novelId: input.novelId, chapterId: input.chapterId,
      source: "chapter_extraction", status: { not: "superseded" } },
    data: { status: "superseded" },
  });
  await db.timelineHook.updateMany({
    where: { novelId: input.novelId, createdInChapterId: input.chapterId },
    data: { status: "dropped" },
  });
  await db.timelineHook.updateMany({
    where: { novelId: input.novelId, resolvedInChapterId: input.chapterId,
      createdInChapterId: { not: input.chapterId }, status: { in: ["addressed", "resolved", "expired"] } },
    data: { status: "open", resolvedInChapterId: null, resolvedInChapterIndex: null },
  });
}

/** The chapter row lock makes the version check and every derived write one boundary. */
export async function withCurrentTimelineContent<T>(
  input: { novelId: string; chapterId: string; content: string },
  commit: (db: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (db) => {
    const current = await db.chapter.findFirst({
      where: { id: input.chapterId, novelId: input.novelId },
      select: { content: true, updatedAt: true },
    });
    if (!current || (current.content ?? "").trim() !== input.content.trim()) {
      throw new TimelineContentVersionError();
    }
    const locked = await db.chapter.updateMany({
      where: { id: input.chapterId, novelId: input.novelId, content: current.content, updatedAt: current.updatedAt },
      // Acquire a write lock without changing the editor's saved version.
      data: { updatedAt: current.updatedAt },
    });
    if (locked.count !== 1) throw new TimelineContentVersionError();
    return commit(db);
  });
}
