import { z } from "zod";
import { prisma } from "../../db/prisma";
import type { AgentToolName } from "../types";
import type { AgentToolDefinition } from "./toolTypes";
import {
  buildPatchedContent,
  dryRunField,
  getChapter,
  makeDiffSummary,
  novelService,
} from "./shared";

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

export const writeToolDefinitions: Partial<
  Record<AgentToolName, AgentToolDefinition<Record<string, unknown>, Record<string, unknown>>>
> = {
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
      const patched = buildPatchedContent(base, input);
      return diffChapterPatchOutput.parse({
        novelId: input.novelId,
        chapterId: input.chapterId,
        mode: input.mode,
        ...makeDiffSummary(base, patched),
      });
    },
  },
  save_chapter_draft: {
    name: "save_chapter_draft",
    description: "保存章节草稿，支持 dryRun。",
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
          summary: "dryRun: 章节草稿将被写入，但未实际落库。",
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
    description: "对章节正文执行增量或覆盖修订，支持 dryRun。",
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
  preview_pipeline_run: {
    name: "preview_pipeline_run",
    description: "预览流水线会覆盖的章节范围。",
    riskLevel: "low",
    inputSchema: previewPipelineRunInput,
    outputSchema: previewPipelineRunOutput,
    execute: async (_context, rawInput) => {
      const input = previewPipelineRunInput.parse(rawInput);
      if (input.startOrder > input.endOrder) {
        throw new Error("startOrder must be <= endOrder.");
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
  queue_pipeline_run: {
    name: "queue_pipeline_run",
    description: "创建小说流水线任务，支持 dryRun。",
    riskLevel: "high",
    inputSchema: queuePipelineRunInput,
    outputSchema: queuePipelineRunOutput,
    execute: async (context, rawInput) => {
      const input = queuePipelineRunInput.parse(rawInput);
      if (input.startOrder > input.endOrder) {
        throw new Error("startOrder must be <= endOrder.");
      }
      if (input.dryRun) {
        return queuePipelineRunOutput.parse({
          novelId: input.novelId,
          jobId: null,
          status: "preview_only",
          startOrder: input.startOrder,
          endOrder: input.endOrder,
          dryRun: true,
          summary: "dryRun: 流水线任务将被创建，但未实际落库。",
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
