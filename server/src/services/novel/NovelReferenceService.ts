import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import { prisma } from "../../db/prisma";
import {
  listActiveKnowledgeDocumentContents,
  resolveKnowledgeDocumentIds,
} from "../knowledge/common";

export type NovelReferenceStage =
  | "outline"
  | "structured_outline"
  | "bible"
  | "beats"
  | "chapter"
  | "character";

const MAX_REFERENCE_CHARS_PER_STAGE = 5_000;
const MAX_KNOWLEDGE_EXCERPT_CHARS = 1_500;

interface ResolvedAnalysis {
  id: string;
  title: string;
  documentTitle: string;
  documentVersionNumber: number;
  sections: Array<{
    sectionKey: string;
    title: string;
    structuredDataJson: string | null;
  }>;
}

function clipText(source: string, maxChars: number): string {
  const normalized = source.replace(/\r\n?/g, "\n").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars).trim()}\n...(已截断)`;
}

function formatStructuredData(data: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      const arr = value.filter((v) => v !== null && v !== undefined && String(v).trim());
      if (arr.length > 0) {
        lines.push(`- ${key}：${arr.map((v) => String(v)).join("；")}`);
      }
    } else if (typeof value === "object") {
      continue;
    } else {
      const str = String(value).trim();
      if (str) {
        lines.push(`- ${key}：${str}`);
      }
    }
  }
  return lines.join("\n");
}

function parseStructuredData(json: string | null): Record<string, unknown> | null {
  if (!json?.trim()) return null;
  try {
    const parsed = JSON.parse(json) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractSectionText(
  section: { sectionKey: string; title: string; structuredDataJson: string | null },
): string {
  const data = parseStructuredData(section.structuredDataJson);
  if (!data || Object.keys(data).length === 0) return "";
  return `【${section.title}】\n${formatStructuredData(data)}`;
}

const STAGE_SECTION_MAP: Record<NovelReferenceStage, BookAnalysisSectionKey[]> = {
  outline: ["plot_structure", "worldbuilding", "overview"],
  structured_outline: ["plot_structure", "character_system"],
  bible: ["character_system", "worldbuilding", "themes"],
  beats: ["plot_structure", "market_highlights"],
  chapter: ["style_technique"],
  character: ["character_system"],
};

export class NovelReferenceService {
  async resolveAnalysesForNovel(novelId: string): Promise<ResolvedAnalysis[]> {
    const bindings = await prisma.knowledgeBinding.findMany({
      where: {
        targetType: "novel",
        targetId: novelId,
        document: { status: "enabled" },
      },
      select: { documentId: true },
    });
    const documentIds = [...new Set(bindings.map((b) => b.documentId))];
    if (documentIds.length === 0) return [];

    const analyses = await prisma.bookAnalysis.findMany({
      where: {
        documentId: { in: documentIds },
        status: "succeeded",
      },
      include: {
        document: { select: { title: true } },
        documentVersion: { select: { versionNumber: true } },
        sections: {
          orderBy: { sortOrder: "asc" },
          select: {
            sectionKey: true,
            title: true,
            structuredDataJson: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return analyses.map((a) => ({
      id: a.id,
      title: a.title,
      documentTitle: a.document.title,
      documentVersionNumber: a.documentVersion.versionNumber,
      sections: a.sections,
    }));
  }

  async resolveKnowledgeContentsForNovel(novelId: string): Promise<
    Array<{
      id: string;
      title: string;
      content: string;
    }>
  > {
    const documentIds = await resolveKnowledgeDocumentIds({
      targetType: "novel",
      targetId: novelId,
    });
    if (documentIds.length === 0) return [];

    const contents = await listActiveKnowledgeDocumentContents(documentIds);
    return contents.map((c) => ({
      id: c.id,
      title: c.title,
      content: c.content,
    }));
  }

  async buildReferenceForStage(
    novelId: string,
    stage: NovelReferenceStage,
  ): Promise<string> {
    const [analyses, knowledgeContents] = await Promise.all([
      this.resolveAnalysesForNovel(novelId),
      this.resolveKnowledgeContentsForNovel(novelId),
    ]);

    const parts: string[] = [];

    const sectionKeys = STAGE_SECTION_MAP[stage];
    for (const analysis of analyses) {
      const sectionTexts: string[] = [];
      for (const section of analysis.sections) {
        if (!sectionKeys.includes(section.sectionKey as BookAnalysisSectionKey)) continue;
        const text = extractSectionText(section);
        if (text) sectionTexts.push(text);
      }
      if (sectionTexts.length > 0) {
        parts.push(
          `【拆书参考】${analysis.title}（来源：${analysis.documentTitle} v${analysis.documentVersionNumber}）\n${sectionTexts.join("\n\n")}`,
        );
      }
    }

    if (knowledgeContents.length > 0 && stage !== "chapter") {
      const knowledgeExcerpts = knowledgeContents
        .map(
          (k) =>
            `【知识库】${k.title}\n${clipText(k.content, MAX_KNOWLEDGE_EXCERPT_CHARS)}`,
        )
        .join("\n\n");
      parts.push(knowledgeExcerpts);
    }

    const combined = parts.join("\n\n");
    if (!combined.trim()) return "";

    return clipText(combined, MAX_REFERENCE_CHARS_PER_STAGE);
  }

}

export const novelReferenceService = new NovelReferenceService();

export function getRagQueryForChapter(
  chapterOrder: number,
  novelTitle: string,
  structuredOutline?: string | null,
): string {
  if (!structuredOutline?.trim()) {
    return `小说上下文 第${chapterOrder}章 ${novelTitle}`;
  }
  try {
    const chapters = JSON.parse(structuredOutline) as Array<{
      order?: number;
      title?: string;
      summary?: string;
    }>;
    const chapter = Array.isArray(chapters)
      ? chapters.find((c) => Number(c.order) === chapterOrder)
      : null;
    if (chapter?.title || chapter?.summary) {
      return `第${chapterOrder}章 ${chapter.title ?? ""} ${chapter.summary ?? ""} ${novelTitle}`.trim();
    }
  } catch {
    // fall through
  }
  return `小说上下文 第${chapterOrder}章 ${novelTitle}`;
}
