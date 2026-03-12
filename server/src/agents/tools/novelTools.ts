import { z } from "zod";
import { prisma } from "../../db/prisma";
import { ragServices } from "../../services/rag";
import { AgentToolError, type AgentToolName } from "../types";
import type { AgentToolDefinition } from "./toolTypes";
import { getChapter, getChapterByOrder } from "./shared";

const getNovelContextInput = z.object({
  novelId: z.string().trim().min(1),
});

const chapterOverviewSchema = z.object({
  id: z.string(),
  order: z.number().int(),
  title: z.string(),
  excerpt: z.string(),
});

const getNovelContextOutput = z.object({
  novelId: z.string(),
  title: z.string(),
  outline: z.string().nullable(),
  structuredOutline: z.string().nullable(),
  chapterCount: z.number().int(),
  completedChapterCount: z.number().int(),
  latestCompletedChapterOrder: z.number().int().nullable(),
  chapterSummary: z.array(chapterOverviewSchema),
});

const listChaptersInput = z.object({
  novelId: z.string().trim().min(1),
});

const chapterMetaSchema = z.object({
  id: z.string(),
  order: z.number().int(),
  title: z.string(),
  hasContent: z.boolean(),
  contentLength: z.number().int(),
});

const listChaptersOutput = z.object({
  novelId: z.string(),
  items: z.array(chapterMetaSchema),
});

const getChapterByOrderInput = z.object({
  novelId: z.string().trim().min(1),
  chapterOrder: z.number().int().min(1),
});

const getChapterByOrderOutput = z.object({
  novelId: z.string(),
  chapterId: z.string(),
  order: z.number().int(),
  title: z.string(),
  hasContent: z.boolean(),
  contentLength: z.number().int(),
});

const getChapterContentInput = z.object({
  novelId: z.string().trim().min(1),
  chapterId: z.string().trim().min(1).optional(),
  chapterOrder: z.number().int().min(1).optional(),
}).refine((input) => Boolean(input.chapterId || input.chapterOrder), {
  message: "chapterId or chapterOrder is required.",
});

const getChapterContentOutput = z.object({
  novelId: z.string(),
  chapterId: z.string(),
  title: z.string(),
  order: z.number().int(),
  content: z.string(),
  contentLength: z.number().int(),
});

const summarizeChapterRangeInput = z.object({
  novelId: z.string().trim().min(1),
  startOrder: z.number().int().min(1),
  endOrder: z.number().int().min(1),
  mode: z.enum(["summary", "excerpt"]).default("summary"),
});

const summarizeChapterRangeOutput = z.object({
  novelId: z.string(),
  startOrder: z.number().int(),
  endOrder: z.number().int(),
  chapterCount: z.number().int(),
  summaryMode: z.enum(["chapter_summary", "content_excerpt"]),
  summary: z.string(),
  chapters: z.array(chapterOverviewSchema),
});

const getStoryBibleInput = z.object({
  novelId: z.string().trim().min(1),
});
const getStoryBibleOutput = z.object({
  novelId: z.string(),
  exists: z.boolean(),
  coreSetting: z.string().nullable(),
  forbiddenRules: z.string().nullable(),
  mainPromise: z.string().nullable(),
  characterArcs: z.string().nullable(),
  worldRules: z.string().nullable(),
});

const getCharacterStatesInput = z.object({
  novelId: z.string().trim().min(1),
});
const getCharacterStatesOutput = z.object({
  novelId: z.string(),
  count: z.number().int(),
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.string(),
      currentState: z.string().nullable(),
      currentGoal: z.string().nullable(),
    }),
  ),
});

const getTimelineFactsInput = z.object({
  novelId: z.string().trim().min(1),
  limit: z.number().int().min(1).max(100).optional(),
});
const getTimelineFactsOutput = z.object({
  novelId: z.string(),
  count: z.number().int(),
  items: z.array(
    z.object({
      id: z.string(),
      chapterId: z.string().nullable(),
      category: z.string(),
      content: z.string(),
    }),
  ),
});

const getWorldConstraintsInput = z.object({
  worldId: z.string().trim().min(1).optional(),
  novelId: z.string().trim().min(1).optional(),
});
const getWorldConstraintsOutput = z.object({
  worldId: z.string().nullable(),
  novelId: z.string().nullable(),
  worldName: z.string().nullable(),
  constraints: z.object({
    axioms: z.string().nullable(),
    magicSystem: z.string().nullable(),
    conflicts: z.string().nullable(),
    consistencyReport: z.string().nullable(),
  }),
});

const searchKnowledgeInput = z.object({
  query: z.string().trim().min(1),
  novelId: z.string().trim().min(1).optional(),
  worldId: z.string().trim().min(1).optional(),
  topK: z.number().int().min(1).max(20).optional(),
});
const searchKnowledgeOutput = z.object({
  query: z.string(),
  contextBlock: z.string(),
  hitCount: z.number().int(),
});

function toChapterOverview(chapter: {
  id: string;
  order: number;
  title: string;
  content?: string | null;
  chapterSummary?: { summary: string } | null;
}) {
  const excerpt = (chapter.chapterSummary?.summary?.trim() || chapter.content || "").slice(0, 300);
  return {
    id: chapter.id,
    order: chapter.order,
    title: chapter.title,
    excerpt,
  };
}

export const novelToolDefinitions: Partial<
  Record<AgentToolName, AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>>
> = {
  get_novel_context: {
    name: "get_novel_context",
    title: "读取小说总览",
    description: "读取小说总览，包括标题、大纲和进度信息。",
    category: "read",
    riskLevel: "low",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "chapter"],
    inputSchema: getNovelContextInput,
    outputSchema: getNovelContextOutput,
    execute: async (_context, rawInput) => {
      const input = getNovelContextInput.parse(rawInput);
      const novel = await prisma.novel.findUnique({
        where: { id: input.novelId },
        include: {
          chapters: {
            orderBy: { order: "desc" },
            take: 6,
            select: {
              id: true,
              order: true,
              title: true,
              content: true,
              chapterSummary: {
                select: {
                  summary: true,
                },
              },
            },
          },
        },
      });
      if (!novel) {
        throw new AgentToolError("NOT_FOUND", "Novel not found.");
      }
      const [chapterCount, completedChapters] = await Promise.all([
        prisma.chapter.count({ where: { novelId: input.novelId } }),
        prisma.chapter.findMany({
          where: {
            novelId: input.novelId,
            content: { not: "" },
          },
          orderBy: { order: "asc" },
          select: { order: true },
        }),
      ]);
      return getNovelContextOutput.parse({
        novelId: novel.id,
        title: novel.title,
        outline: novel.outline,
        structuredOutline: novel.structuredOutline,
        chapterCount,
        completedChapterCount: completedChapters.length,
        latestCompletedChapterOrder: completedChapters.at(-1)?.order ?? null,
        chapterSummary: [...novel.chapters]
          .sort((left, right) => left.order - right.order)
          .map((chapter) => toChapterOverview(chapter)),
      });
    },
  },
  list_chapters: {
    name: "list_chapters",
    title: "列出章节元信息",
    description: "列出小说全部章节元信息，用于按章节序号定位。",
    category: "read",
    riskLevel: "low",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "chapter"],
    inputSchema: listChaptersInput,
    outputSchema: listChaptersOutput,
    execute: async (_context, rawInput) => {
      const input = listChaptersInput.parse(rawInput);
      const items = await prisma.chapter.findMany({
        where: { novelId: input.novelId },
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          title: true,
          content: true,
        },
      });
      return listChaptersOutput.parse({
        novelId: input.novelId,
        items: items.map((item) => ({
          id: item.id,
          order: item.order,
          title: item.title,
          hasContent: (item.content ?? "").trim().length > 0,
          contentLength: (item.content ?? "").length,
        })),
      });
    },
  },
  get_chapter_by_order: {
    name: "get_chapter_by_order",
    title: "按序号读取章节",
    description: "按章节序号读取章节元信息。",
    category: "read",
    riskLevel: "low",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "chapter"],
    inputSchema: getChapterByOrderInput,
    outputSchema: getChapterByOrderOutput,
    execute: async (_context, rawInput) => {
      const input = getChapterByOrderInput.parse(rawInput);
      const chapter = await getChapterByOrder(input.novelId, input.chapterOrder);
      return getChapterByOrderOutput.parse({
        novelId: input.novelId,
        chapterId: chapter.id,
        order: chapter.order,
        title: chapter.title,
        hasContent: (chapter.content ?? "").trim().length > 0,
        contentLength: (chapter.content ?? "").length,
      });
    },
  },
  get_chapter_content_by_order: {
    name: "get_chapter_content_by_order",
    title: "按序号读取章节正文",
    description: "按章节序号读取章节正文。",
    category: "read",
    riskLevel: "low",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "chapter"],
    inputSchema: getChapterByOrderInput,
    outputSchema: getChapterContentOutput,
    execute: async (_context, rawInput) => {
      const input = getChapterByOrderInput.parse(rawInput);
      const chapter = await getChapterByOrder(input.novelId, input.chapterOrder);
      return getChapterContentOutput.parse({
        novelId: input.novelId,
        chapterId: chapter.id,
        title: chapter.title,
        order: chapter.order,
        content: chapter.content ?? "",
        contentLength: (chapter.content ?? "").length,
      });
    },
  },
  get_chapter_content: {
    name: "get_chapter_content",
    title: "读取章节正文",
    description: "按章节 ID 或章节序号读取章节正文。",
    category: "read",
    riskLevel: "low",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "chapter"],
    inputSchema: getChapterContentInput,
    outputSchema: getChapterContentOutput,
    execute: async (_context, rawInput) => {
      const input = getChapterContentInput.parse(rawInput);
      const chapter = input.chapterId
        ? await getChapter(input.novelId, input.chapterId)
        : await getChapterByOrder(input.novelId, input.chapterOrder as number);
      return getChapterContentOutput.parse({
        novelId: input.novelId,
        chapterId: chapter.id,
        title: chapter.title,
        order: chapter.order,
        content: chapter.content ?? "",
        contentLength: (chapter.content ?? "").length,
      });
    },
  },
  summarize_chapter_range: {
    name: "summarize_chapter_range",
    title: "总结章节范围",
    description: "总结指定章节范围，用于前 N 章或连续章节问答。",
    category: "inspect",
    riskLevel: "low",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "chapter"],
    inputSchema: summarizeChapterRangeInput,
    outputSchema: summarizeChapterRangeOutput,
    execute: async (_context, rawInput) => {
      const input = summarizeChapterRangeInput.parse(rawInput);
      if (input.startOrder > input.endOrder) {
        throw new AgentToolError("INVALID_INPUT", "startOrder must be <= endOrder.");
      }
      const chapters = await prisma.chapter.findMany({
        where: {
          novelId: input.novelId,
          order: { gte: input.startOrder, lte: input.endOrder },
        },
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          title: true,
          content: true,
          chapterSummary: {
            select: {
              summary: true,
            },
          },
        },
      });
      const summaryMode = chapters.every((chapter) => chapter.chapterSummary?.summary?.trim()) && input.mode === "summary"
        ? "chapter_summary"
        : "content_excerpt";
      const summary = chapters.map((chapter) => {
        const basis = summaryMode === "chapter_summary"
          ? chapter.chapterSummary?.summary?.trim() ?? ""
          : (chapter.content ?? "").slice(0, 260).trim();
        return `第${chapter.order}章《${chapter.title}》：${basis || "暂无可用内容"}`;
      }).join("\n");
      return summarizeChapterRangeOutput.parse({
        novelId: input.novelId,
        startOrder: input.startOrder,
        endOrder: input.endOrder,
        chapterCount: chapters.length,
        summaryMode,
        summary,
        chapters: chapters.map((chapter) => toChapterOverview(chapter)),
      });
    },
  },
  get_story_bible: {
    name: "get_story_bible",
    title: "读取小说圣经",
    description: "读取小说圣经信息。",
    category: "read",
    riskLevel: "low",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel"],
    inputSchema: getStoryBibleInput,
    outputSchema: getStoryBibleOutput,
    execute: async (_context, rawInput) => {
      const input = getStoryBibleInput.parse(rawInput);
      const bible = await prisma.novelBible.findUnique({
        where: { novelId: input.novelId },
      });
      return getStoryBibleOutput.parse({
        novelId: input.novelId,
        exists: Boolean(bible),
        coreSetting: bible?.coreSetting ?? null,
        forbiddenRules: bible?.forbiddenRules ?? null,
        mainPromise: bible?.mainPromise ?? null,
        characterArcs: bible?.characterArcs ?? null,
        worldRules: bible?.worldRules ?? null,
      });
    },
  },
  get_character_states: {
    name: "get_character_states",
    title: "读取角色状态",
    description: "读取小说角色状态。",
    category: "read",
    riskLevel: "low",
    domainAgent: "CharacterAgent",
    resourceScopes: ["novel", "chapter"],
    inputSchema: getCharacterStatesInput,
    outputSchema: getCharacterStatesOutput,
    execute: async (_context, rawInput) => {
      const input = getCharacterStatesInput.parse(rawInput);
      const items = await prisma.character.findMany({
        where: { novelId: input.novelId },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          name: true,
          role: true,
          currentState: true,
          currentGoal: true,
        },
      });
      return getCharacterStatesOutput.parse({
        novelId: input.novelId,
        count: items.length,
        items,
      });
    },
  },
  get_timeline_facts: {
    name: "get_timeline_facts",
    title: "读取时间线事实",
    description: "读取时间线事实与一致性事实。",
    category: "inspect",
    riskLevel: "low",
    domainAgent: "NovelAgent",
    resourceScopes: ["novel", "chapter"],
    inputSchema: getTimelineFactsInput,
    outputSchema: getTimelineFactsOutput,
    execute: async (_context, rawInput) => {
      const input = getTimelineFactsInput.parse(rawInput);
      const rows = await prisma.consistencyFact.findMany({
        where: { novelId: input.novelId },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: input.limit ?? 30,
        select: {
          id: true,
          chapterId: true,
          category: true,
          content: true,
        },
      });
      return getTimelineFactsOutput.parse({
        novelId: input.novelId,
        count: rows.length,
        items: rows,
      });
    },
  },
  get_world_constraints: {
    name: "get_world_constraints",
    title: "读取世界观约束",
    description: "读取世界观硬规则和一致性约束。",
    category: "inspect",
    riskLevel: "low",
    domainAgent: "WorldAgent",
    resourceScopes: ["world", "novel"],
    inputSchema: getWorldConstraintsInput,
    outputSchema: getWorldConstraintsOutput,
    execute: async (_context, rawInput) => {
      const input = getWorldConstraintsInput.parse(rawInput);
      let worldId = input.worldId ?? null;
      const novelId = input.novelId ?? null;
      if (!worldId && novelId) {
        const novel = await prisma.novel.findUnique({
          where: { id: novelId },
          select: { worldId: true },
        });
        worldId = novel?.worldId ?? null;
      }
      if (!worldId) {
        return getWorldConstraintsOutput.parse({
          worldId: null,
          novelId,
          worldName: null,
          constraints: {
            axioms: null,
            magicSystem: null,
            conflicts: null,
            consistencyReport: null,
          },
        });
      }
      const world = await prisma.world.findUnique({
        where: { id: worldId },
        select: {
          id: true,
          name: true,
          axioms: true,
          magicSystem: true,
          conflicts: true,
          consistencyReport: true,
        },
      });
      if (!world) {
        throw new AgentToolError("NOT_FOUND", "World not found.");
      }
      return getWorldConstraintsOutput.parse({
        worldId: world.id,
        novelId,
        worldName: world.name,
        constraints: {
          axioms: world.axioms ?? null,
          magicSystem: world.magicSystem ?? null,
          conflicts: world.conflicts ?? null,
          consistencyReport: world.consistencyReport ?? null,
        },
      });
    },
  },
  search_knowledge: {
    name: "search_knowledge",
    title: "检索知识库",
    description: "检索知识库并返回上下文块。",
    category: "inspect",
    riskLevel: "low",
    domainAgent: "KnowledgeAgent",
    resourceScopes: ["knowledge_document", "novel", "world"],
    inputSchema: searchKnowledgeInput,
    outputSchema: searchKnowledgeOutput,
    execute: async (_context, rawInput) => {
      const input = searchKnowledgeInput.parse(rawInput);
      const contextBlock = await ragServices.hybridRetrievalService.buildContextBlock(input.query, {
        novelId: input.novelId,
        worldId: input.worldId,
        finalTopK: input.topK ?? 6,
      });
      const hitCount = contextBlock ? contextBlock.split("[RAG-").length - 1 : 0;
      return searchKnowledgeOutput.parse({
        query: input.query,
        contextBlock,
        hitCount,
      });
    },
  },
};
