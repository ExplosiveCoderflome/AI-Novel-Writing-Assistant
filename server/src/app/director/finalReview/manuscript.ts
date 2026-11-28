import type { Prisma } from "@prisma/client";
import { proseParagraphs } from "@ai-novel/shared/types/director/proseReview/discussion";
import { chapterInspection } from "@ai-novel/shared/types/director/finalReview/contract";
import { readChapterQualityDebtDetails } from "@ai-novel/shared/types/chapterQualityLoop";
import { AppError } from "../../../middleware/errorHandler";
import { exportVersion } from "../../../modules/export";
import { artifactContentHash, type RunContract } from "../../../modules/director";
import { assertNovelDirectorVersion, readRunExecutionEpoch } from "../../../modules/novel/director-routing";
import { projectBookCompletion, readBookCompletionActivity } from "../../../services/novel/production/completion";
import {
  finalInspectionPrompt,
  type InspectionInput,
} from "../../../prompting/prompts/novel/finalReview/inspection.prompt";

type Db = Prisma.TransactionClient;
const chapterSelect = {
  id: true,
  novelId: true,
  order: true,
  title: true,
  content: true,
  taskSheet: true,
  mustAvoid: true,
  updatedAt: true,
  chapterStatus: true,
  generationState: true,
  riskFlags: true,
  auditReports: {
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      auditType: true,
      issues: {
        where: { status: "open" },
        orderBy: { id: "asc" },
        select: { description: true, evidence: true, fixSuggestion: true },
      },
    },
  },
  finalReviewChecks: { select: { sourceHash: true, findingsJson: true } },
} satisfies Prisma.ChapterSelect;
type Chapter = Prisma.ChapterGetPayload<{ select: typeof chapterSelect }>;
async function header(db: Db, novelId: string) {
  const { epoch } = await assertNovelDirectorVersion(novelId, "v2", undefined, db);
  const book = await db.novel.findUniqueOrThrow({
    where: { id: novelId },
    select: {
      title: true,
      description: true,
      estimatedChapterCount: true,
      bookContract: { select: { readingPromise: true } },
      _count: { select: { chapters: true } },
    },
  });
  const run = await db.directorNextRun.findFirst({
    where: { novelId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { contractJson: true, control: { select: { status: true } } },
  });
  const current = run && readRunExecutionEpoch(run.contractJson) === epoch ? run : null;
  // Match the completion banner, including books delivered before V2 began recording runs.
  if (!book.estimatedChapterCount || readBookCompletionActivity(current?.control?.status))
    throw new AppError("请先完成导演台中的写作与阶段确认，再开始全书检查。", 409);
  const target = Math.max(book.estimatedChapterCount, book._count.chapters);
  // Sample the whole arc without rereading every saved summary for every chapter.
  const count = Math.min(target, 24);
  const milestoneOrders = Array.from(
    { length: count },
    (_, i) => 1 + Math.round((i * (target - 1)) / Math.max(1, count - 1)),
  );
  const [ends, summaries] = await Promise.all([
    db.chapter.findMany({ where: { novelId, order: { in: [1, target] } }, select: { order: true, content: true } }),
    db.chapterSummary.findMany({
      where: { novelId, chapter: { order: { in: milestoneOrders } } },
      orderBy: { chapter: { order: "asc" } },
      select: { summary: true, chapter: { select: { order: true } } },
    }),
  ]);
  const milestones = summaries.map((row) => `第 ${row.chapter.order} 章 · ${row.summary.slice(0, 200)}`);
  const opening = ends.find((row) => row.order === 1)?.content?.slice(0, 900) ?? null;
  const ending = ends.find((row) => row.order === target)?.content?.slice(-900) ?? null;
  return {
    novelId,
    epoch,
    opening,
    ending,
    milestones,
    title: book.title,
    description: book.description,
    target,
    promise: book.bookContract?.readingPromise ?? null,
    contract: current ? (JSON.parse(current.contractJson) as RunContract) : null,
  };
}
type Header = Awaited<ReturnType<typeof header>>;
function inspectable(book: Header, row: Chapter, previous?: string | null, next?: string | null) {
  const seen = new Set<string>(),
    earlierConcerns: string[] = [];
  for (const report of row.auditReports) {
    if (seen.has(report.auditType)) continue;
    seen.add(report.auditType);
    for (const issue of report.issues)
      earlierConcerns.push([issue.description, issue.evidence, issue.fixSuggestion].join(" "));
  }
  const debt = readChapterQualityDebtDetails(row.riskFlags);
  if (debt) earlierConcerns.push(debt.reason);
  const input: InspectionInput = {
    book: {
      title: book.title,
      premise: book.description,
      promise: book.promise,
      target: book.target,
      opening: book.opening,
      ending: book.ending,
      milestones: book.milestones,
    },
    chapter: {
      order: row.order,
      title: row.title,
      taskSheet: row.taskSheet,
      mustAvoid: row.mustAvoid,
      paragraphs: proseParagraphs(row.content ?? "").fields,
    },
    previousEnding: previous?.slice(-1200) ?? null,
    nextOpening: next?.slice(0, 1200) ?? null,
    earlierConcerns,
  };
  const sourceHash = artifactContentHash([finalInspectionPrompt.version, book.epoch, row.id, row.content, input]);
  const saved = row.finalReviewChecks.find((item) => item.sourceHash === sourceHash);
  const findings = saved ? chapterInspection.parse(JSON.parse(saved.findingsJson)).findings : null;
  return { input, sourceHash, findings };
}
export async function readFinalChapter(db: Db, novelId: string, id: string, sourceHash: string) {
  const book = await header(db, novelId);
  const row = await db.chapter.findFirst({ where: { id, novelId }, select: chapterSelect });
  if (!row) throw new AppError("找不到本书的这一章。", 404);
  const neighbors = await db.chapter.findMany({
    where: { novelId, order: { in: [row.order - 1, row.order + 1] } },
    select: { order: true, content: true },
  });
  const at = (order: number) => neighbors.find((other) => other.order === order)?.content;
  const data = inspectable(book, row, at(row.order - 1), at(row.order + 1));
  if (!row.content?.trim() || data.sourceHash !== sourceHash)
    throw new AppError("本章或相邻章节有更新，请重新打开完稿检查。", 409);
  return { book, row, ...data };
}
export async function readFinalManuscript(db: Db, novelId: string) {
  const book = await header(db, novelId);
  const rows = await db.chapter.findMany({ where: { novelId }, orderBy: { order: "asc" }, select: chapterSelect });
  const completion = projectBookCompletion({ target: book.target, chapters: rows, activity: null });
  if (completion?.status !== "completed" || rows.some((row, i) => row.order !== i + 1))
    throw new AppError("全书章节尚未写完，请回到导演台完成写作。", 409);
  const chapters = rows.map((row, i) => {
    const { sourceHash, findings } = inspectable(book, row, rows[i - 1]?.content, rows[i + 1]?.content);
    return { id: row.id, order: row.order, title: row.title, content: row.content!, sourceHash, findings };
  });
  const manuscriptVersion = exportVersion(book, rows);
  const version = artifactContentHash([manuscriptVersion, chapters.map((c) => c.sourceHash)]);
  return { book, rows, chapters, manuscriptVersion, version };
}
