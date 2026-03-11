import { z } from "zod";
import { prisma } from "../db/prisma";
import { ragServices } from "../services/rag";
import { NovelService } from "../services/novel/NovelService";
import { AgentToolError } from "./types";
import type { AgentToolName, ToolExecutionContext } from "./types";

type ToolRiskLevel = "low" | "medium" | "high";

export interface AgentToolDefinition<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>> {
  name: AgentToolName;
  description: string;
  riskLevel: ToolRiskLevel;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  execute: (context: ToolExecutionContext, input: TInput) => Promise<TOutput>;
}

const novelService = new NovelService();

const dryRunField = z.boolean().optional();

const getNovelContextInput = z.object({
  novelId: z.string().trim().min(1),
  chapterOrder: z.number().int().min(1).optional(),
});
const getNovelContextOutput = z.object({
  novelId: z.string(),
  title: z.string(),
  outline: z.string().nullable(),
  structuredOutline: z.string().nullable(),
  chapterCount: z.number().int(),
  chapterSummary: z.array(
    z.object({
      id: z.string(),
      order: z.number().int(),
      title: z.string(),
      excerpt: z.string(),
    }),
  ),
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

const getChapterContentInput = z.object({
  novelId: z.string().trim().min(1),
  chapterId: z.string().trim().min(1),
});
const getChapterContentOutput = z.object({
  novelId: z.string(),
  chapterId: z.string(),
  title: z.string(),
  order: z.number().int(),
  content: z.string(),
  contentLength: z.number().int(),
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

const diffChapterPatchInput = z.object({
  novelId: z.string().trim().min(1),
  chapterId: z.string().trim().min(1),
  mode: z.enum(["append", "replace_segment", "full_replace"]).default("append"),
  content: z.string().trim().min(1),
  marker: z.string().trim().optional(),
});
const diffChapterPatchOutput = z.object({
  novelId: z.string(),
  chapterId: z.string(),
  mode: z.enum(["append", "replace_segment", "full_replace"]),
  beforeLength: z.number().int(),
  afterLength: z.number().int(),
  summary: z.string(),
  beforePreview: z.string(),
  afterPreview: z.string(),
});

const saveChapterDraftInput = z.object({
  novelId: z.string().trim().min(1),
  chapterId: z.string().trim().min(1),
  content: z.string().trim().min(1),
  title: z.string().trim().optional(),
  dryRun: dryRunField,
});
const saveChapterDraftOutput = z.object({
  novelId: z.string(),
  chapterId: z.string(),
  contentLength: z.number().int(),
  updatedAt: z.string().nullable(),
  dryRun: z.boolean(),
  summary: z.string(),
});

const applyChapterPatchInput = z.object({
  novelId: z.string().trim().min(1),
  chapterId: z.string().trim().min(1),
  mode: z.enum(["append", "replace_segment", "full_replace"]).default("append"),
  content: z.string().trim().min(1),
  marker: z.string().trim().optional(),
  chapterIds: z.array(z.string().trim().min(1)).optional(),
  worldRuleChange: z.boolean().optional(),
  worldId: z.string().trim().optional(),
  dryRun: dryRunField,
});
const applyChapterPatchOutput = z.object({
  novelId: z.string(),
  chapterId: z.string(),
  mode: z.enum(["append", "replace_segment", "full_replace"]),
  contentLength: z.number().int(),
  updatedAt: z.string().nullable(),
  dryRun: z.boolean(),
  summary: z.string(),
  beforePreview: z.string(),
  afterPreview: z.string(),
});

const previewPipelineRunInput = z.object({
  novelId: z.string().trim().min(1),
  startOrder: z.number().int().min(1),
  endOrder: z.number().int().min(1),
});
const previewPipelineRunOutput = z.object({
  novelId: z.string(),
  startOrder: z.number().int(),
  endOrder: z.number().int(),
  chapterCount: z.number().int(),
  chapterIds: z.array(z.string()),
});

const queuePipelineRunInput = z.object({
  novelId: z.string().trim().min(1),
  startOrder: z.number().int().min(1),
  endOrder: z.number().int().min(1),
  maxRetries: z.number().int().min(0).max(5).optional(),
  dryRun: dryRunField,
});
const queuePipelineRunOutput = z.object({
  novelId: z.string(),
  jobId: z.string().nullable(),
  status: z.string(),
  startOrder: z.number().int(),
  endOrder: z.number().int(),
  dryRun: z.boolean(),
  summary: z.string(),
});

async function getChapter(novelId: string, chapterId: string) {
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, novelId },
  });
  if (!chapter) {
    throw new AgentToolError("NOT_FOUND", "Chapter not found.");
  }
  return chapter;
}

function buildPatchedContent(base: string, input: z.infer<typeof applyChapterPatchInput>): string {
  if (input.mode === "append") {
    return `${base}\n\n${input.content}`.trim();
  }
  if (input.mode === "replace_segment") {
    if (!input.marker?.trim()) {
      throw new AgentToolError("INVALID_INPUT", "marker is required for replace_segment mode.");
    }
    return base.includes(input.marker)
      ? base.replace(input.marker, input.content)
      : `${base}\n\n[PatchMarkerMissing:${input.marker}]\n${input.content}`.trim();
  }
  return input.content;
}

function makeDiffSummary(beforeText: string, afterText: string): {
  beforeLength: number;
  afterLength: number;
  summary: string;
  beforePreview: string;
  afterPreview: string;
} {
  const beforeLength = beforeText.length;
  const afterLength = afterText.length;
  const delta = afterLength - beforeLength;
  return {
    beforeLength,
    afterLength,
    summary: `length ${beforeLength} -> ${afterLength} (delta ${delta >= 0 ? "+" : ""}${delta})`,
    beforePreview: beforeText.slice(0, 180),
    afterPreview: afterText.slice(0, 180),
  };
}

const definitions: Record<AgentToolName, AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>> = {
  get_novel_context: {
    name: "get_novel_context",
    description: "读取小说主上下文和章节概览。",
    riskLevel: "low",
    inputSchema: getNovelContextInput,
    outputSchema: getNovelContextOutput,
    execute: async (_context, rawInput) => {
      const input = getNovelContextInput.parse(rawInput);
      const novel = await prisma.novel.findUnique({
        where: { id: input.novelId },
        include: {
          chapters: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              order: true,
              title: true,
              content: true,
            },
          },
        },
      });
      if (!novel) {
        throw new AgentToolError("NOT_FOUND", "Novel not found.");
      }
      const chapterSummary = novel.chapters
        .slice(-12)
        .map((chapter) => ({
          id: chapter.id,
          order: chapter.order,
          title: chapter.title,
          excerpt: (chapter.content ?? "").slice(0, 120),
        }));
      return getNovelContextOutput.parse({
        novelId: novel.id,
        title: novel.title,
        outline: novel.outline,
        structuredOutline: novel.structuredOutline,
        chapterCount: novel.chapters.length,
        chapterSummary,
      });
    },
  },
  get_story_bible: {
    name: "get_story_bible",
    description: "读取小说圣经信息。",
    riskLevel: "low",
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
  get_chapter_content: {
    name: "get_chapter_content",
    description: "读取章节正文。",
    riskLevel: "low",
    inputSchema: getChapterContentInput,
    outputSchema: getChapterContentOutput,
    execute: async (_context, rawInput) => {
      const input = getChapterContentInput.parse(rawInput);
      const chapter = await getChapter(input.novelId, input.chapterId);
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
  get_character_states: {
    name: "get_character_states",
    description: "读取小说角色状态。",
    riskLevel: "low",
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
    description: "读取时间线事实与一致性事实。",
    riskLevel: "low",
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
    description: "读取世界观硬规则和一致性约束。",
    riskLevel: "low",
    inputSchema: getWorldConstraintsInput,
    outputSchema: getWorldConstraintsOutput,
    execute: async (_context, rawInput) => {
      const input = getWorldConstraintsInput.parse(rawInput);
      let worldId = input.worldId ?? null;
      let novelId = input.novelId ?? null;
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
    description: "检索知识库并返回上下文块。",
    riskLevel: "low",
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
  diff_chapter_patch: {
    name: "diff_chapter_patch",
    description: "对补丁进行预览，不落库。",
    riskLevel: "low",
    inputSchema: diffChapterPatchInput,
    outputSchema: diffChapterPatchOutput,
    execute: async (_context, rawInput) => {
      const input = diffChapterPatchInput.parse(rawInput);
      const chapter = await getChapter(input.novelId, input.chapterId);
      const base = chapter.content ?? "";
      const patched = buildPatchedContent(base, {
        ...input,
        dryRun: true,
      });
      return diffChapterPatchOutput.parse({
        novelId: input.novelId,
        chapterId: input.chapterId,
        mode: input.mode,
        ...makeDiffSummary(base, patched),
      });
    },
  },
  preview_pipeline_run: {
    name: "preview_pipeline_run",
    description: "预览流水线会覆盖的章节范围。",
    riskLevel: "low",
    inputSchema: previewPipelineRunInput,
    outputSchema: previewPipelineRunOutput,
    execute: async (_context, rawInput) => {
      const input = previewPipelineRunInput.parse(rawInput);
      if (input.startOrder > input.endOrder) {
        throw new AgentToolError("INVALID_INPUT", "startOrder must be <= endOrder.");
      }
      const rows = await prisma.chapter.findMany({
        where: {
          novelId: input.novelId,
          order: { gte: input.startOrder, lte: input.endOrder },
        },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      return previewPipelineRunOutput.parse({
        novelId: input.novelId,
        startOrder: input.startOrder,
        endOrder: input.endOrder,
        chapterCount: rows.length,
        chapterIds: rows.map((item) => item.id),
      });
    },
  },
  save_chapter_draft: {
    name: "save_chapter_draft",
    description: "保存章节草稿（支持 dryRun）。",
    riskLevel: "medium",
    inputSchema: saveChapterDraftInput,
    outputSchema: saveChapterDraftOutput,
    execute: async (_context, rawInput) => {
      const input = saveChapterDraftInput.parse(rawInput);
      await getChapter(input.novelId, input.chapterId);
      if (input.dryRun) {
        return saveChapterDraftOutput.parse({
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentLength: input.content.length,
          updatedAt: null,
          dryRun: true,
          summary: "dryRun: 草稿将被写入但未实际落库。",
        });
      }
      const updated = await novelService.updateChapter(input.novelId, input.chapterId, {
        content: input.content,
        ...(input.title ? { title: input.title } : {}),
      });
      return saveChapterDraftOutput.parse({
        novelId: input.novelId,
        chapterId: updated.id,
        contentLength: (updated.content ?? "").length,
        updatedAt: updated.updatedAt.toISOString(),
        dryRun: false,
        summary: "章节草稿已保存。",
      });
    },
  },
  apply_chapter_patch: {
    name: "apply_chapter_patch",
    description: "对章节正文执行增量或覆盖修订（支持 dryRun）。",
    riskLevel: "high",
    inputSchema: applyChapterPatchInput,
    outputSchema: applyChapterPatchOutput,
    execute: async (_context, rawInput) => {
      const input = applyChapterPatchInput.parse(rawInput);
      const chapter = await getChapter(input.novelId, input.chapterId);
      const before = chapter.content ?? "";
      const after = buildPatchedContent(before, input);
      const diff = makeDiffSummary(before, after);
      if (input.dryRun) {
        return applyChapterPatchOutput.parse({
          novelId: input.novelId,
          chapterId: input.chapterId,
          mode: input.mode,
          contentLength: after.length,
          updatedAt: null,
          dryRun: true,
          summary: `dryRun: ${diff.summary}`,
          beforePreview: diff.beforePreview,
          afterPreview: diff.afterPreview,
        });
      }
      const updated = await novelService.updateChapter(input.novelId, input.chapterId, {
        content: after,
      });
      return applyChapterPatchOutput.parse({
        novelId: input.novelId,
        chapterId: updated.id,
        mode: input.mode,
        contentLength: (updated.content ?? "").length,
        updatedAt: updated.updatedAt.toISOString(),
        dryRun: false,
        summary: diff.summary,
        beforePreview: diff.beforePreview,
        afterPreview: diff.afterPreview,
      });
    },
  },
  queue_pipeline_run: {
    name: "queue_pipeline_run",
    description: "创建小说流水线任务（支持 dryRun）。",
    riskLevel: "high",
    inputSchema: queuePipelineRunInput,
    outputSchema: queuePipelineRunOutput,
    execute: async (context, rawInput) => {
      const input = queuePipelineRunInput.parse(rawInput);
      if (input.startOrder > input.endOrder) {
        throw new AgentToolError("INVALID_INPUT", "startOrder must be <= endOrder.");
      }
      if (input.dryRun) {
        return queuePipelineRunOutput.parse({
          novelId: input.novelId,
          jobId: null,
          status: "preview_only",
          startOrder: input.startOrder,
          endOrder: input.endOrder,
          dryRun: true,
          summary: "dryRun: 流水线任务将被创建但未实际落库。",
        });
      }
      const job = await novelService.startPipelineJob(input.novelId, {
        startOrder: input.startOrder,
        endOrder: input.endOrder,
        maxRetries: input.maxRetries,
        provider: context.provider,
        model: context.model,
        temperature: context.temperature,
      });
      return queuePipelineRunOutput.parse({
        novelId: input.novelId,
        jobId: job.id,
        status: job.status,
        startOrder: job.startOrder,
        endOrder: job.endOrder,
        dryRun: false,
        summary: "流水线任务已创建。",
      });
    },
  },
};

export function getAgentToolDefinition(toolName: AgentToolName) {
  return definitions[toolName];
}

export function listAgentToolDefinitions(): Array<{
  name: AgentToolName;
  description: string;
  riskLevel: ToolRiskLevel;
}> {
  return Object.values(definitions).map((item) => ({
    name: item.name,
    description: item.description,
    riskLevel: item.riskLevel,
  }));
}
