import type { BookAnalysisSectionKey, BookAnalysisTimelineNode } from "@ai-novel/shared/types/bookAnalysis";
import { prisma } from "../../db/prisma";
import {
  listActiveKnowledgeDocumentContents,
  resolveKnowledgeDocumentIds,
} from "../knowledge/common";
import { normalizeBookAnalysisStructuredData } from "../bookAnalysis/bookAnalysis.utils";

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

function formatTimelineNode(node: BookAnalysisTimelineNode): string {
  const meta = [
    node.timeHint ? `时间=${node.timeHint}` : "",
    node.sourceRefs?.length ? `来源=${node.sourceRefs.join(", ")}` : "",
  ].filter(Boolean).join("; ");
  return meta ? `- ${node.label} (${meta})` : `- ${node.label}`;
}

function formatTimelineNodes(nodes: BookAnalysisTimelineNode[]): string {
  if (nodes.length === 0) {
    return "";
  }
  const phaseOrder: string[] = [];
  const phaseGroups = new Map<string, BookAnalysisTimelineNode[]>();
  for (const node of nodes) {
    const phase = node.phase?.trim() || "未分阶段";
    if (!phaseGroups.has(phase)) {
      phaseGroups.set(phase, []);
      phaseOrder.push(phase);
    }
    phaseGroups.get(phase)?.push(node);
  }
  return phaseOrder
    .map((phase) => {
      const group = phaseGroups.get(phase) ?? [];
      return `### ${phase}\n${group.map((node) => formatTimelineNode(node)).join("\n")}`;
    })
    .join("\n");
}

function formatTimelineStructuredData(data: Record<string, unknown>): string {
  const normalized = normalizeBookAnalysisStructuredData("timeline", data);
  const lines: string[] = [];
  const timeNodes = Array.isArray(normalized.timeNodes)
    ? normalized.timeNodes as BookAnalysisTimelineNode[]
    : [];
  const eventOrder = Array.isArray(normalized.eventOrder)
    ? normalized.eventOrder as BookAnalysisTimelineNode[]
    : [];
  if (timeNodes.length > 0) {
    lines.push("## 关键时间节点", formatTimelineNodes(timeNodes));
  }
  if (eventOrder.length > 0) {
    lines.push("## 事件先后关系", formatTimelineNodes(eventOrder));
  }
  for (const key of ["phaseDivisions", "stateChangeNodes", "tempoRisks"]) {
    const values = Array.isArray(normalized[key])
      ? (normalized[key] as unknown[]).map((item) => String(item).trim()).filter(Boolean)
      : [];
    if (values.length > 0) {
      lines.push(`## ${key}`, values.map((item) => `- ${item}`).join("\n"));
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
    sectionKey: string;
    title: string;
    structuredDataJson: string | null;
    aiContent: string | null;
    editedContent: string | null;
  },
): string {
  const data = parseStructuredData(section.structuredDataJson);
  if (data && Object.keys(data).length > 0) {
    const structuredText = section.sectionKey === "timeline"
      ? formatTimelineStructuredData(data)
      : formatStructuredData(data);
    if (structuredText.trim()) {
      return `## ${section.title}\n${structuredText}`;
    }
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

const MAX_RAG_QUERY_CHARS = 600;

export interface ChapterRagQueryInput {
  chapterOrder: number;
  novelTitle: string;
  chapterTitle?: string | null;
  objective?: string | null;
  expectation?: string | null;
  mustAdvance?: string[];
  targetConflicts?: string[];
  participantNames?: string[];
  structuredOutline?: string | null;
}

/**
 * Build a semantically richer retrieval query for chapter drafting.
 *
 * The legacy {@link getRagQueryForChapter} only used the chapter title/summary
 * from the structured outline, which made writer-stage retrieval weak. This
 * variant folds in the current chapter mission, the beats that must advance,
 * the active conflicts and the participating characters so the knowledge-base
 * recall is aligned with what the chapter is actually trying to do. It falls
 * back to the outline-based query when no runtime mission signal is available.
 */
export function buildChapterRagQuery(input: ChapterRagQueryInput): string {
  const seen = new Set<string>();
  const terms: string[] = [];
  const push = (value: string | null | undefined): void => {
    const normalized = value?.replace(/\s+/g, " ").trim();
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    terms.push(normalized);
  };

  push(input.novelTitle);
  push(input.chapterTitle);
  push(input.objective);
  push(input.expectation);
  for (const item of input.mustAdvance ?? []) {
    push(item);
  }
  for (const item of input.targetConflicts ?? []) {
    push(item);
  }
  for (const name of (input.participantNames ?? []).slice(0, 6)) {
    push(name);
  }

  // If nothing beyond the novel title was collected, the runtime mission is
  // empty; fall back to the outline-based query to avoid an information-free
  // retrieval that only matches the book title.
  if (terms.length <= 1) {
    return getRagQueryForChapter(input.chapterOrder, input.novelTitle, input.structuredOutline ?? null);
  }

  const query = terms.join(" ").trim();
  return query.length > MAX_RAG_QUERY_CHARS ? query.slice(0, MAX_RAG_QUERY_CHARS).trim() : query;
}
