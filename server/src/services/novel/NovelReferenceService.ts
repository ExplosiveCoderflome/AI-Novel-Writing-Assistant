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
const MAX_FALLBACK_SECTION_CHARS = 1_200;
const ALL_SECTION_KEYS: BookAnalysisSectionKey[] = [
  "overview",
  "plot_structure",
  "timeline",
  "character_system",
  "worldbuilding",
  "themes",
  "style_technique",
  "market_highlights",
];
const ALL_SECTION_KEY_SET = new Set<BookAnalysisSectionKey>(ALL_SECTION_KEYS);

interface ResolvedAnalysis {
  id: string;
  title: string;
  documentTitle: string;
  documentVersionNumber: number;
  sections: Array<{
    sectionKey: string;
    title: string;
    structuredDataJson: string | null;
    aiContent: string | null;
    editedContent: string | null;
  }>;
}

interface ContinuationAnalysisConfig {
  enabled: boolean;
  analysisId: string | null;
  sectionKeys: Set<BookAnalysisSectionKey> | null;
}

function clipText(source: string, maxChars: number): string {
  const normalized = source.replace(/\r\n?/g, "\n").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars).trim()}\n...(truncated)`;
}

function formatStructuredData(data: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      const items = value.filter((item) => item !== null && item !== undefined && String(item).trim());
      if (items.length > 0) {
        lines.push(`- ${key}: ${items.map((item) => String(item)).join("; ")}`);
      }
      continue;
    }
    if (typeof value === "object") {
      continue;
    }
    const text = String(value).trim();
    if (text) {
      lines.push(`- ${key}: ${text}`);
    }
  }
  return lines.join("\n");
}

function parseStructuredData(json: string | null): Record<string, unknown> | null {
  if (!json?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(json) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractSectionText(
  section: {
    title: string;
    structuredDataJson: string | null;
    aiContent: string | null;
    editedContent: string | null;
  },
): string {
  const data = parseStructuredData(section.structuredDataJson);
  if (data && Object.keys(data).length > 0) {
    return `## ${section.title}\n${formatStructuredData(data)}`;
  }
  const fallback = section.editedContent?.trim() || section.aiContent?.trim() || "";
  if (!fallback) {
    return "";
  }
  return `## ${section.title}\n${clipText(fallback, MAX_FALLBACK_SECTION_CHARS)}`;
}

function parseContinuationSectionKeys(raw: string | null | undefined): Set<BookAnalysisSectionKey> | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return null;
    }
    const keys = parsed
      .map((item) => (typeof item === "string" ? item : ""))
      .filter((item): item is BookAnalysisSectionKey => ALL_SECTION_KEY_SET.has(item as BookAnalysisSectionKey));
    if (keys.length === 0) {
      return null;
    }
    return new Set(keys);
  } catch {
    return null;
  }
}

function toResolvedAnalysis(source: {
  id: string;
  title: string;
  document: { title: string };
  documentVersion: { versionNumber: number };
  sections: Array<{
    sectionKey: string;
    title: string;
    structuredDataJson: string | null;
    aiContent: string | null;
    editedContent: string | null;
  }>;
}): ResolvedAnalysis {
  return {
    id: source.id,
    title: source.title,
    documentTitle: source.document.title,
    documentVersionNumber: source.documentVersion.versionNumber,
    sections: source.sections,
  };
}

const STAGE_SECTION_MAP: Record<NovelReferenceStage, BookAnalysisSectionKey[]> = {
  outline: ["plot_structure", "timeline", "worldbuilding", "overview"],
  structured_outline: ["plot_structure", "timeline", "character_system"],
  bible: ["character_system", "worldbuilding", "themes"],
  beats: ["plot_structure", "timeline", "market_highlights"],
  chapter: ["timeline", "style_technique"],
  character: ["character_system"],
};

export class NovelReferenceService {
  private async resolveContinuationAnalysisConfig(novelId: string): Promise<ContinuationAnalysisConfig> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        writingMode: true,
        continuationBookAnalysisId: true,
        continuationBookAnalysisSections: true,
      },
    });
    if (!novel || novel.writingMode !== "continuation" || !novel.continuationBookAnalysisId) {
      return {
        enabled: false,
        analysisId: null,
        sectionKeys: null,
      };
    }
    return {
      enabled: true,
      analysisId: novel.continuationBookAnalysisId,
      sectionKeys: parseContinuationSectionKeys(novel.continuationBookAnalysisSections),
    };
  }

  async resolveAnalysesForNovel(novelId: string): Promise<ResolvedAnalysis[]> {
    const bindings = await prisma.knowledgeBinding.findMany({
      where: {
        targetType: "novel",
        targetId: novelId,
        document: { status: "enabled" },
      },
      select: { documentId: true },
    });
    const documentIds = [...new Set(bindings.map((item) => item.documentId))];
    if (documentIds.length === 0) {
      return [];
    }

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
            aiContent: true,
            editedContent: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return analyses.map((item) => toResolvedAnalysis(item));
  }

  private async resolveAnalysisById(analysisId: string): Promise<ResolvedAnalysis | null> {
    const analysis = await prisma.bookAnalysis.findFirst({
      where: {
        id: analysisId,
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
            aiContent: true,
            editedContent: true,
          },
        },
      },
    });
    return analysis ? toResolvedAnalysis(analysis) : null;
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
    if (documentIds.length === 0) {
      return [];
    }
    const contents = await listActiveKnowledgeDocumentContents(documentIds);
    return contents.map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content,
    }));
  }

  private buildAnalysisBlock(
    analysis: ResolvedAnalysis,
    sectionKeys: Set<BookAnalysisSectionKey>,
    tag: string,
  ): string {
    const texts = analysis.sections
      .filter((section) => sectionKeys.has(section.sectionKey as BookAnalysisSectionKey))
      .map((section) => extractSectionText(section))
      .filter((item) => item.trim().length > 0);
    if (texts.length === 0) {
      return "";
    }
    return `[${tag}] ${analysis.title} (source: ${analysis.documentTitle} v${analysis.documentVersionNumber})\n${texts.join("\n\n")}`;
  }

  async buildReferenceForStage(novelId: string, stage: NovelReferenceStage): Promise<string> {
    const [continuationConfig, analyses, knowledgeContents] = await Promise.all([
      this.resolveContinuationAnalysisConfig(novelId),
      this.resolveAnalysesForNovel(novelId),
      this.resolveKnowledgeContentsForNovel(novelId),
    ]);

    const parts: string[] = [];
    const stageSectionKeySet = new Set(STAGE_SECTION_MAP[stage]);

    let preferredAnalysisId: string | null = null;
    if (continuationConfig.enabled && continuationConfig.analysisId) {
      const preferred = await this.resolveAnalysisById(continuationConfig.analysisId);
      if (preferred) {
        preferredAnalysisId = preferred.id;
        const preferredKeySet = continuationConfig.sectionKeys
          ? new Set(continuationConfig.sectionKeys)
          : new Set(stageSectionKeySet);
        preferredKeySet.add("timeline");

        const timelineOnly = this.buildAnalysisBlock(
          preferred,
          new Set<BookAnalysisSectionKey>(["timeline"]),
          "continuation.timeline.priority",
        );
        if (timelineOnly) {
          parts.push(timelineOnly);
        }

        const preferredBlock = this.buildAnalysisBlock(preferred, preferredKeySet, "continuation.analysis.primary");
        if (preferredBlock) {
          parts.push(preferredBlock);
        }
      }
    }

    for (const analysis of analyses) {
      if (preferredAnalysisId && analysis.id === preferredAnalysisId) {
        continue;
      }
      const block = this.buildAnalysisBlock(analysis, stageSectionKeySet, "analysis.reference");
      if (block) {
        parts.push(block);
      }
    }

    if (knowledgeContents.length > 0 && stage !== "chapter") {
      const knowledgeExcerpts = knowledgeContents
        .map((item) => `[knowledge] ${item.title}\n${clipText(item.content, MAX_KNOWLEDGE_EXCERPT_CHARS)}`)
        .join("\n\n");
      parts.push(knowledgeExcerpts);
    }

    const combined = parts.join("\n\n");
    if (!combined.trim()) {
      return "";
    }
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
    return `novel context chapter ${chapterOrder} ${novelTitle}`;
  }
  try {
    const chapters = JSON.parse(structuredOutline) as Array<{
      order?: number;
      title?: string;
      summary?: string;
    }>;
    const chapter = Array.isArray(chapters)
      ? chapters.find((item) => Number(item.order) === chapterOrder)
      : null;
    if (chapter?.title || chapter?.summary) {
      return `chapter ${chapterOrder} ${chapter.title ?? ""} ${chapter.summary ?? ""} ${novelTitle}`.trim();
    }
  } catch {
    // ignore parse failure and use fallback query
  }
  return `novel context chapter ${chapterOrder} ${novelTitle}`;
}
