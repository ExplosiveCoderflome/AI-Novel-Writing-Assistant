import {Prisma} from "@prisma/client";
import type {NovelBookProgress} from "@ai-novel/shared/types/director/bookProgress";
import {prisma} from "../../../../db/prisma";
import {readRunExecutionEpoch} from "../../../../modules/novel/director-routing";

type Book = {id: string; directorVersion?: string | null; directorEpoch?: number; narrativeForm?: string | null; estimatedChapterCount?: number | null};

/** Indexed catalog reads only; never execute a workflow or infer completion from task success. */
export async function readNovelBookProgress(books: Book[]): Promise<Map<string, NovelBookProgress>> {
  if (!books.length) return new Map();
  const counts = await prisma.$queryRaw<Array<{novelId: string; written: bigint | number}>>(Prisma.sql`
    SELECT "novelId", COUNT(DISTINCT "order") AS "written" FROM "Chapter"
    WHERE "novelId" IN (${Prisma.join(books.map(book => book.id))})
      AND LENGTH(TRIM(REPLACE(REPLACE(REPLACE(COALESCE("content", ''), ${"\n"}, ''), ${"\r"}, ''), ${"\t"}, ''))) > 0
    GROUP BY "novelId"`);
  const written = new Map(counts.map(row => [row.novelId, Number(row.written)]));
  return new Map(await Promise.all(books.map(async book => {
    const run = book.narrativeForm !== "short_story" && book.directorVersion !== "v1"
      ? await prisma.directorNextRun.findFirst({where: {novelId: book.id}, orderBy: [{createdAt: "desc"}, {id: "desc"}],
        select: {id: true, contractJson: true, control: {select: {status: true}}}}) : null;
    const director = run?.control && readRunExecutionEpoch(run.contractJson) === (book.directorEpoch ?? 0)
      ? {runId: run.id, status: run.control.status as NonNullable<NovelBookProgress["director"]>["status"]} : null;
    return [book.id, {writtenChapters: written.get(book.id) ?? 0,
      targetChapters: book.estimatedChapterCount && book.estimatedChapterCount > 0 ? book.estimatedChapterCount : null,
      director}] as const;
  })));
}
