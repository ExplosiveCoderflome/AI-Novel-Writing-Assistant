import type { BookAnalysisEvidenceItem } from "@ai-novel/shared/types/bookAnalysis";
import type { DocumentChapter, DocumentChapterSplitResult } from "@ai-novel/shared/types/knowledge";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { bookAnalysisChapterSplitPrompt } from "../../prompting/prompts/bookAnalysis/bookAnalysisChapter.prompts";
import {
  CHAPTER_HEADING_REGEX,
  MIN_CHAPTER_DETECTION_COUNT,
  MIN_SEGMENT_BODY_LENGTH,
} from "../bookAnalysis/shared/bookAnalysis.constants";

type ChapterSplitter = DocumentChapterSplitResult["splitter"];

interface ChapterDraft {
  chapterIndex: number;
  title: string;
  startOffset: number;
  endOffset: number;
  splitter: ChapterSplitter;
}

function serializeChapter(row: {
  id: string;
  documentVersionId: string;
  chapterIndex: number;
  title: string;
  startOffset: number;
  endOffset: number;
  charCount: number;
  summary: string | null;
  splitter: string;
  createdAt: Date;
  updatedAt: Date;
}): DocumentChapter {
  return {
    id: row.id,
    documentVersionId: row.documentVersionId,
    chapterIndex: row.chapterIndex,
    title: row.title,
    startOffset: row.startOffset,
    endOffset: row.endOffset,
    charCount: row.charCount,
    summary: row.summary,
    splitter: row.splitter === "llm" || row.splitter === "single" ? row.splitter : "rule",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeContent(source: string): string {
  return source.replace(/\r\n?/g, "\n");
}

function buildLineStarts(content: string): Array<{ text: string; startOffset: number }> {
  const lines = content.split("\n");
  let offset = 0;
  return lines.map((text) => {
    const row = { text, startOffset: offset };
    offset += text.length + 1;
    return row;
  });
}

function splitChaptersByRules(content: string): ChapterDraft[] {
  const normalized = normalizeContent(content);
  const headings: Array<{ title: string; startOffset: number }> = [];
  for (const line of buildLineStarts(normalized)) {
    const title = line.text.trim();
    if (!title || title.length > 80) {
      continue;
    }
    if (CHAPTER_HEADING_REGEX.test(title)) {
      headings.push({ title, startOffset: line.startOffset });
    }
  }
  if (headings.length < MIN_CHAPTER_DETECTION_COUNT) {
    return [];
  }

  const chapters: ChapterDraft[] = [];
  for (let index = 0; index < headings.length; index += 1) {
    const startOffset = headings[index].startOffset;
    const endOffset = index + 1 < headings.length ? headings[index + 1].startOffset : normalized.length;
    if (endOffset <= startOffset) {
      continue;
    }
    const body = normalized.slice(startOffset, endOffset).trim();
    if (body.length < MIN_SEGMENT_BODY_LENGTH) {
      continue;
    }
    chapters.push({
      chapterIndex: chapters.length,
      title: headings[index].title,
      startOffset,
      endOffset,
      splitter: "rule",
    });
  }
  return chapters;
}

function validateLlmChapters(content: string, rawChapters: unknown): ChapterDraft[] {
  if (!Array.isArray(rawChapters)) {
    return [];
  }
  const normalized = normalizeContent(content);
  const chapters: ChapterDraft[] = [];
  let previousEnd = 0;
  for (const item of rawChapters) {
    if (!item || typeof item !== "object") {
      return [];
    }
    const row = item as Record<string, unknown>;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const startOffset = Number(row.startOffset);
    const endOffset = Number(row.endOffset);
    if (
      !title ||
      !Number.isInteger(startOffset) ||
      !Number.isInteger(endOffset) ||
      startOffset < previousEnd ||
      endOffset <= startOffset ||
      endOffset > normalized.length
    ) {
      return [];
    }
    chapters.push({
      chapterIndex: chapters.length,
      title,
      startOffset,
      endOffset,
      splitter: "llm",
    });
    previousEnd = endOffset;
  }
  return chapters.length >= MIN_CHAPTER_DETECTION_COUNT ? chapters : [];
}

function buildSingleChapter(content: string): ChapterDraft[] {
  const normalized = normalizeContent(content);
  return [{
    chapterIndex: 0,
    title: "全文",
    startOffset: 0,
    endOffset: normalized.length,
    splitter: "single",
  }];
}

export function bindEvidenceToDocumentChapters(
  evidence: BookAnalysisEvidenceItem[],
  chapters: DocumentChapter[],
  content: string,
): BookAnalysisEvidenceItem[] {
  if (evidence.length === 0 || chapters.length === 0) {
    return evidence;
  }
  const normalizedContent = normalizeContent(content);
  return evidence.map((item) => {
    if (item.chapterIndex !== undefined && item.excerptOffsetRange) {
      return item;
    }
    const excerpt = item.excerpt.trim();
    if (!excerpt) {
      return item;
    }
    const offset = normalizedContent.indexOf(excerpt);
    if (offset < 0) {
      return item;
    }
    const chapter = chapters.find((row) => offset >= row.startOffset && offset < row.endOffset);
    if (!chapter) {
      return item;
    }
    return {
      ...item,
      chapterIndex: chapter.chapterIndex,
      excerptOffsetRange: {
        start: offset,
        end: offset + excerpt.length,
      },
    };
  });
}

export class DocumentChapterService {
  async ensureChaptersForVersion(
    documentVersionId: string,
    documentId?: string,
  ): Promise<DocumentChapterSplitResult> {
    await this.assertVersionBelongsToDocument(documentVersionId, documentId);
    const existing = await this.listChapters(documentVersionId);
    if (existing.length > 0) {
      return {
        documentVersionId,
        splitter: existing[0]?.splitter ?? "rule",
        chapters: existing,
      };
    }
    return this.rebuildChaptersForVersion(documentVersionId);
  }

  async rebuildChaptersForVersion(
    documentVersionId: string,
    documentId?: string,
  ): Promise<DocumentChapterSplitResult> {
    const version = await prisma.knowledgeDocumentVersion.findUnique({
      where: { id: documentVersionId },
      select: {
        id: true,
        documentId: true,
        content: true,
      },
    });
    if (!version) {
      throw new Error("Knowledge document version not found.");
    }
    if (documentId && version.documentId !== documentId) {
      throw new Error("Knowledge document version not found.");
    }

    const drafts = await this.splitContent(version.content);
    await prisma.$transaction(async (tx) => {
      await tx.documentChapter.deleteMany({ where: { documentVersionId } });
      await tx.documentChapter.createMany({
        data: drafts.map((chapter) => ({
          documentVersionId,
          chapterIndex: chapter.chapterIndex,
          title: chapter.title,
          startOffset: chapter.startOffset,
          endOffset: chapter.endOffset,
          charCount: chapter.endOffset - chapter.startOffset,
          splitter: chapter.splitter,
        })),
      });
    });

    return {
      documentVersionId,
      splitter: drafts[0]?.splitter ?? "single",
      chapters: await this.listChapters(documentVersionId),
    };
  }

  async listChapters(documentVersionId: string): Promise<DocumentChapter[]> {
    const rows = await prisma.documentChapter.findMany({
      where: { documentVersionId },
      orderBy: [{ chapterIndex: "asc" }],
    });
    return rows.map(serializeChapter);
  }

  async updateChapter(
    documentVersionId: string,
    chapterIndex: number,
    input: { title?: string; summary?: string | null },
    documentId?: string,
  ): Promise<DocumentChapter> {
    await this.assertVersionBelongsToDocument(documentVersionId, documentId);
    const row = await prisma.documentChapter.update({
      where: {
        documentVersionId_chapterIndex: {
          documentVersionId,
          chapterIndex,
        },
      },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() || `第 ${chapterIndex + 1} 章` } : {}),
        ...(input.summary !== undefined ? { summary: input.summary?.trim() || null } : {}),
      },
    });
    return serializeChapter(row);
  }

  private async assertVersionBelongsToDocument(
    documentVersionId: string,
    documentId: string | undefined,
  ): Promise<void> {
    if (!documentId) {
      return;
    }
    const exists = await prisma.knowledgeDocumentVersion.count({
      where: {
        id: documentVersionId,
        documentId,
      },
    });
    if (!exists) {
      throw new Error("Knowledge document version not found.");
    }
  }

  private async splitContent(content: string): Promise<ChapterDraft[]> {
    const ruleChapters = splitChaptersByRules(content);
    if (ruleChapters.length > 0) {
      return ruleChapters;
    }
    const llmChapters = await this.splitContentWithLlm(content);
    if (llmChapters.length > 0) {
      return llmChapters;
    }
    return buildSingleChapter(content);
  }

  private async splitContentWithLlm(content: string): Promise<ChapterDraft[]> {
    try {
      const result = await runStructuredPrompt({
        asset: bookAnalysisChapterSplitPrompt,
        promptInput: {
          content: normalizeContent(content).slice(0, 24_000),
        },
        options: {
          provider: "deepseek",
          temperature: 0.1,
          maxTokens: 1600,
        },
      });
      return validateLlmChapters(content, result.output?.chapters);
    } catch {
      return [];
    }
  }
}
