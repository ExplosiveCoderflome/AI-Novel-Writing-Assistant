import { z } from "zod";
import { prisma } from "../../db/prisma";
import { NovelService } from "../../services/novel/NovelService";
import { AgentToolError } from "../types";

export const novelService = new NovelService();
export const dryRunField = z.boolean().optional();

export async function getChapter(novelId: string, chapterId: string) {
  const chapter = await prisma.chapter.findFirst({
    where: { id: chapterId, novelId },
  });
  if (!chapter) {
    throw new AgentToolError("NOT_FOUND", "Chapter not found.");
  }
  return chapter;
}

export async function getChapterByOrder(novelId: string, chapterOrder: number) {
  const chapter = await prisma.chapter.findFirst({
    where: {
      novelId,
      order: chapterOrder,
    },
  });
  if (!chapter) {
    throw new AgentToolError("NOT_FOUND", `Chapter ${chapterOrder} not found.`);
  }
  return chapter;
}

export function buildPatchedContent(
  base: string,
  input: {
    mode: "append" | "replace_segment" | "full_replace";
    content: string;
    marker?: string;
  },
): string {
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

export function makeDiffSummary(beforeText: string, afterText: string): {
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
