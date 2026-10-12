import { createHash } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import type { NovelUsageChapter, NovelUsagePage, NovelUsageQuery } from "@ai-novel/shared/types/llmUsage";
import { projectNovelUsage } from "../domain/novelUsageProjection";

export interface NovelUsageScope {
  novel: { id: string; title: string };
  chapters: NovelUsageChapter[];
  workflowTaskIds: string[];
  generationJobIds: string[];
}

const badPaging = () => Object.assign(new Error("分页位置无效或不属于本书及当前筛选。"), { statusCode: 400 });
const filterKeys = ["chapterId", "stage", "provider", "model", "status"] as const;

/** Pure read projection over distinct invocation IDs; never combines task counter totals. */
export class NovelInvocationUsageQueryService {
  constructor(
    private readonly rows: Pick<PrismaClient["llmInvocationUsageRecord"], "groupBy" | "findMany">,
    private readonly loadScope: (novelId: string) => Promise<NovelUsageScope | null>,
  ) {}

  async getNovelUsage(novelId: string, query: NovelUsageQuery): Promise<NovelUsagePage> {
    const limit = query.limit ?? 30;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Object.assign(new Error("invalid usage limit"), { statusCode: 400 });
    const scope = await this.loadScope(novelId);
    if (!scope || scope.novel.id !== novelId) throw Object.assign(new Error("找不到这本小说。"), { statusCode: 404 });
    if (query.chapterId && !scope.chapters.some(chapter => chapter.id === query.chapterId)) {
      throw Object.assign(new Error("筛选章节不属于这本小说。"), { statusCode: 400 });
    }
    const filters = Object.fromEntries(filterKeys.filter(key => query[key] !== undefined).map(key => [key, query[key]]));
    const identity = createHash("sha256").update(JSON.stringify({ novelId, ...filters })).digest("hex");
    let cursor: { at: string; id: string } | null = null;
    if (query.cursor) {
      try {
        if (query.cursor.length > 2048) throw badPaging();
        const decoded = JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"));
        if (decoded.scope !== identity || typeof decoded.id !== "string" || !decoded.id || decoded.id.length > 250
          || typeof decoded.at !== "string" || new Date(decoded.at).toISOString() !== decoded.at) throw badPaging();
        cursor = decoded;
      } catch { throw badPaging(); }
    }
    // Pre-book opening requests may lack a novelId but retain a saved task/job identity.
    // An explicit conflicting novelId always wins; it must never leak across books.
    const linked: Prisma.LlmInvocationUsageRecordWhereInput[] = [];
    if (scope.workflowTaskIds.length) linked.push({ workflowTaskId: { in: scope.workflowTaskIds } });
    if (scope.generationJobIds.length) linked.push({ generationJobId: { in: scope.generationJobIds } });
    const bookWhere: Prisma.LlmInvocationUsageRecordWhereInput = linked.length
      ? { OR: [{ novelId }, { novelId: null, OR: linked }] } : { novelId };
    const where: Prisma.LlmInvocationUsageRecordWhereInput = { AND: [bookWhere, filters, ...(cursor ? [{ OR: [
      { startedAt: { lt: new Date(cursor.at) } },
      { startedAt: new Date(cursor.at), id: { lt: cursor.id } },
    ] }] : [])] };
    const [groups, records] = await Promise.all([
      this.rows.groupBy({
        by: ["chapterId", "stage", "provider", "model", "status", "cacheUsageStatus"], where: bookWhere,
        _sum: { promptTokens: true, completionTokens: true, totalTokens: true, cacheHitTokens: true, cacheMissTokens: true },
        _count: { _all: true, promptTokens: true, completionTokens: true, totalTokens: true, cacheHitTokens: true, cacheMissTokens: true },
        _min: { startedAt: true },
      }),
      this.rows.findMany({ where, orderBy: [{ startedAt: "desc" }, { id: "desc" }], take: limit + 1 }),
    ]);
    const chapterMap = new Map(scope.chapters.map(chapter => [chapter.id, chapter]));
    const chapterIds = [...new Set(groups.map(g => g.chapterId))];
    const filteredGroups = groups.filter(g => filterKeys.every(key => query[key] === undefined || query[key] === g[key]));
    const page = records.slice(0, limit), last = page.at(-1);
    const items = page.map(row => ({
      invocationId: row.id, runId: row.runId, generationJobId: row.generationJobId, workflowTaskId: row.workflowTaskId,
      novelId: row.novelId, chapterId: row.chapterId, chapter: row.chapterId ? chapterMap.get(row.chapterId) ?? null : null,
      stage: row.stage, provider: row.provider, model: row.model, requestProtocol: row.requestProtocol,
      promptId: row.promptId, promptVersion: row.promptVersion, status: row.status,
      startedAt: row.startedAt.toISOString(), finishedAt: row.finishedAt.toISOString(),
      promptTokens: row.promptTokens, completionTokens: row.completionTokens, totalTokens: row.totalTokens,
      inputCache: { cacheHitTokens: row.cacheHitTokens, cacheMissTokens: row.cacheMissTokens, cacheWriteTokens: row.cacheWriteTokens,
        cacheUsageStatus: row.cacheUsageStatus as "reported" | "unavailable" | "invalid" },
    }));
    const values = (key: "stage" | "provider" | "model") => [...new Set(groups.map(g => g[key]).filter((value): value is string => value !== null))].sort();
    const firstRecordedAt = groups.reduce<Date | null>((first, g) => !first || (g._min.startedAt && g._min.startedAt < first) ? g._min.startedAt : first, null);
    return {
      novel: scope.novel, summary: projectNovelUsage(groups), filteredSummary: projectNovelUsage(filteredGroups), items,
      chapterBreakdown: chapterIds.map(chapterId => {
        const chapter = chapterId ? chapterMap.get(chapterId) : null;
        return { chapterId, label: chapter ? `第 ${chapter.order} 章 · ${chapter.title}` : chapterId ? "章节信息未记录" : "书级规划及未归属章节的调用",
          ...projectNovelUsage(groups.filter(g => g.chapterId === chapterId)) };
      }).sort((a, b) => (b.totalTokens ?? 0) - (a.totalTokens ?? 0)),
      facets: { chapters: scope.chapters, stages: values("stage"), providers: values("provider"), models: values("model") },
      nextCursor: records.length > limit && last ? Buffer.from(JSON.stringify({ scope: identity, at: last.startedAt.toISOString(), id: last.id })).toString("base64url") : null,
      firstRecordedAt: firstRecordedAt?.toISOString() ?? null,
    };
  }
}
