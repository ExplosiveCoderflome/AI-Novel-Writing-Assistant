import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { BookAnalysisSectionKey } from "@ai-novel/shared/types/bookAnalysis";
import { BOOK_ANALYSIS_STRUCTURED_FIELD_LABELS } from "@ai-novel/shared/types/bookAnalysis";
import { prisma } from "../../db/prisma";
import { runTextPrompt } from "../../prompting/core/promptRunner";
import { novelContinuationRewritePrompt } from "../../prompting/prompts/novel/continuation.prompts";

const CONTINUATION_SIMILARITY_THRESHOLD = 0.3;
const CONTINUATION_NGRAM_SIZE = 5;
const CONTINUATION_ANALYSIS_SECTION_KEYS: BookAnalysisSectionKey[] = [
  "overview",
  "plot_structure",
  "timeline",
  "character_system",
  "worldbuilding",
  "themes",
  "style_technique",
  "market_highlights",
];
const CONTINUATION_ANALYSIS_SECTION_KEY_SET = new Set<BookAnalysisSectionKey>(CONTINUATION_ANALYSIS_SECTION_KEYS);

type ContinuationAnalysisSection = {
  sectionKey: string;
  title: string;
  structuredDataJson: string | null;
  aiContent: string | null;
  editedContent: string | null;
};

type ContinuationAnalysisPack = {
  id: string;
  title: string;
  documentTitle: string;
  documentVersionNumber: number;
  sections: ContinuationAnalysisSection[];
};

function normalizeForSimilarity(text: string): string {
  return text
    .replace(/\s+/g, "")
    .replace(/[，。！？；：、“”‘’（）《》【】\[\]\(\)!?,.:;'"`~\-_/\\|@#$%^&*+=<>]/g, "")
    .trim();
}

function buildNGramSet(source: string, n = CONTINUATION_NGRAM_SIZE): Set<string> {
  const normalized = normalizeForSimilarity(source);
  if (!normalized) {
    return new Set<string>();
  }
  if (normalized.length <= n) {
    return new Set<string>([normalized]);
  }
  const grams = new Set<string>();
  for (let i = 0; i <= normalized.length - n; i += 1) {
    grams.add(normalized.slice(i, i + n));
  }
  return grams;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) {
      intersection += 1;
    }
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function dedupeNonEmpty(items: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const normalized = item.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function toWritingMode(value?: string | null): "original" | "continuation" {
  return value === "continuation" ? "continuation" : "original";
}

function pickKnowledgeSegments(content: string, maxSegments = 18): string[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }
  const byLines = normalized
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 20);
  const fromLines = byLines.slice(0, maxSegments).map((line) => line.slice(0, 220));
  if (fromLines.length >= maxSegments) {
    return fromLines;
  }
  const bySentences = normalized
    .split(/[。！？]/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 20)
    .map((line) => line.slice(0, 220));
  return dedupeNonEmpty([...fromLines, ...bySentences]).slice(0, maxSegments);
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
      .filter((item): item is BookAnalysisSectionKey =>
        CONTINUATION_ANALYSIS_SECTION_KEY_SET.has(item as BookAnalysisSectionKey));
    return keys.length > 0 ? new Set(keys) : null;
  } catch {
    return null;
  }
}

function parseStructuredRecord(raw: string | null): Record<string, unknown> | null {
  if (!raw?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function compactStructuredValue(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => compactStructuredValue(item));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const nodeLabel = typeof record.label === "string" ? record.label.trim() : "";
    if (nodeLabel) {
      const meta = [
        typeof record.phase === "string" && record.phase.trim() ? `阶段=${record.phase.trim()}` : "",
        typeof record.timeHint === "string" && record.timeHint.trim() ? `时间=${record.timeHint.trim()}` : "",
      ].filter(Boolean).join("；");
      return [meta ? `${nodeLabel}（${meta}）` : nodeLabel];
    }
    return [];
  }
  const text = String(value).replace(/\s+/g, " ").trim();
  return text ? [text] : [];
}

function extractAnalysisSectionLines(section: ContinuationAnalysisSection, limit = 6): string[] {
  const structured = parseStructuredRecord(section.structuredDataJson);
  const lines: string[] = [];
  if (structured) {
    for (const [key, value] of Object.entries(structured)) {
      const values = compactStructuredValue(value);
      if (values.length === 0) {
        continue;
      }
      const label = BOOK_ANALYSIS_STRUCTURED_FIELD_LABELS[key] ?? key;
      lines.push(`${section.title}/${label}: ${values.slice(0, 4).join("；")}`);
      if (lines.length >= limit) {
        break;
      }
    }
  }
  if (lines.length > 0) {
    return lines;
  }

  const fallback = section.editedContent?.trim() || section.aiContent?.trim() || "";
  return pickKnowledgeSegments(fallback, limit).map((item) => `${section.title}: ${item}`);
}

function selectAnalysisLines(
  sections: ContinuationAnalysisSection[],
  sectionKeys: BookAnalysisSectionKey[],
  limit: number,
): string[] {
  const wantedKeys = new Set<BookAnalysisSectionKey>(sectionKeys);
  return dedupeNonEmpty(
    sections
      .filter((section) => wantedKeys.has(section.sectionKey as BookAnalysisSectionKey))
      .flatMap((section) => extractAnalysisSectionLines(section, limit)),
  ).slice(0, limit);
}

function buildAnalysisHumanBlock(input: {
  sourceType: "novel" | "knowledge_document";
  sourceTitle: string;
  analysis: ContinuationAnalysisPack;
  selectedSectionKeys: Set<BookAnalysisSectionKey> | null;
}): string {
  const selectedSections = input.selectedSectionKeys
    ? input.analysis.sections.filter((section) => input.selectedSectionKeys!.has(section.sectionKey as BookAnalysisSectionKey))
    : input.analysis.sections;
  const sections = selectedSections.length > 0 ? selectedSections : input.analysis.sections;
  const characterLines = selectAnalysisLines(sections, ["character_system"], 5);
  const endingLines = selectAnalysisLines(sections, ["timeline"], 5);
  const factLines = selectAnalysisLines(sections, ["overview", "worldbuilding", "themes"], 6);
  const unresolvedLines = selectAnalysisLines(sections, ["plot_structure", "timeline", "market_highlights"], 6);

  return `续写模式已开启，请承接前作并避免复刻。
续写来源：${input.sourceType === "novel" ? "站内小说" : "知识库小说"}
前作标题：${input.sourceTitle || input.analysis.documentTitle}
拆书分析：${input.analysis.title}
前作核心角色状态：
${characterLines.map((item) => `- ${item}`).join("\n") || "暂无"}

前作终局章节摘要：
${endingLines.map((item) => `- ${item}`).join("\n") || "暂无"}

前作关键事实（用于承接因果）：
${factLines.map((item) => `- ${item}`).join("\n") || "暂无"}

前作未完线索（可推进，不可照抄桥段）：
${unresolvedLines.map((item) => `- ${item}`).join("\n") || "暂无"}`;
}

interface ContinuationContextPack {
  enabled: boolean;
  sourceType: "novel" | "knowledge_document" | null;
  sourceId: string | null;
  sourceTitle: string;
  systemRule: string;
  humanBlock: string;
  antiCopyCorpus: string[];
}

interface RewriteOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

function disabledPack(): ContinuationContextPack {
  return {
    enabled: false,
    sourceType: null,
    sourceId: null,
    sourceTitle: "",
    systemRule: "",
    humanBlock: "",
    antiCopyCorpus: [],
  };
}

export class NovelContinuationService {
  async validateWritingModeConfig(input: {
    novelId?: string;
    writingMode: "original" | "continuation";
    sourceNovelId?: string | null;
    sourceKnowledgeDocumentId?: string | null;
    continuationBookAnalysisId?: string | null;
  }): Promise<void> {
    const { novelId, writingMode, sourceNovelId, sourceKnowledgeDocumentId, continuationBookAnalysisId } = input;

    if (writingMode === "original") {
      if (sourceNovelId || sourceKnowledgeDocumentId || continuationBookAnalysisId) {
        throw new Error("Original mode cannot set continuation sources.");
      }
      return;
    }

    const hasNovelSource = Boolean(sourceNovelId);
    const hasKnowledgeSource = Boolean(sourceKnowledgeDocumentId);
    if (!hasNovelSource && !hasKnowledgeSource) {
      throw new Error("Continuation mode requires one source (novel or knowledge document).");
    }
    if (hasNovelSource && hasKnowledgeSource) {
      throw new Error("Continuation mode supports only one source at a time.");
    }

    if (hasNovelSource && sourceNovelId) {
      if (novelId && sourceNovelId === novelId) {
        throw new Error("Source novel cannot be the same as current novel.");
      }
      const sourceNovel = await prisma.novel.findUnique({
        where: { id: sourceNovelId },
        select: { id: true },
      });
      if (!sourceNovel) {
        throw new Error("Source novel not found.");
      }
    }

    if (sourceKnowledgeDocumentId) {
      const sourceKnowledge = await prisma.knowledgeDocument.findUnique({
        where: { id: sourceKnowledgeDocumentId },
        select: { id: true, status: true, activeVersionId: true },
      });
      if (!sourceKnowledge || sourceKnowledge.status === "archived") {
        throw new Error("Source knowledge document not found or archived.");
      }
      if (!sourceKnowledge.activeVersionId) {
        throw new Error("Source knowledge document has no active version.");
      }
    }

    if (continuationBookAnalysisId) {
      await this.assertContinuationAnalysisMatchesSource({
        sourceNovelId: sourceNovelId ?? null,
        sourceKnowledgeDocumentId: sourceKnowledgeDocumentId ?? null,
        continuationBookAnalysisId,
      });
    }
  }

  private async assertContinuationAnalysisMatchesSource(input: {
    sourceNovelId: string | null;
    sourceKnowledgeDocumentId: string | null;
    continuationBookAnalysisId: string;
  }): Promise<void> {
    const { sourceNovelId, sourceKnowledgeDocumentId, continuationBookAnalysisId } = input;

    if (sourceKnowledgeDocumentId) {
      const analysis = await prisma.bookAnalysis.findFirst({
        where: {
          id: continuationBookAnalysisId,
          status: "succeeded",
          documentId: sourceKnowledgeDocumentId,
        },
        select: { id: true },
      });
      if (!analysis) {
        throw new Error("Selected continuation analysis is not available for the source knowledge document.");
      }
      return;
    }

    if (!sourceNovelId) {
      throw new Error("Select continuation source before binding continuation analysis.");
    }

    const bindings = await prisma.knowledgeBinding.findMany({
      where: {
        targetType: "novel",
        targetId: sourceNovelId,
      },
      select: { documentId: true },
    });
    const documentIds = [...new Set(bindings.map((item) => item.documentId))];
    if (documentIds.length === 0) {
      throw new Error("Source novel has no bound knowledge documents.");
    }
    const analysis = await prisma.bookAnalysis.findFirst({
      where: {
        id: continuationBookAnalysisId,
        status: "succeeded",
        documentId: { in: documentIds },
      },
      select: { id: true },
    });
    if (!analysis) {
      throw new Error("Selected continuation analysis is not available for the source novel.");
    }
  }

  private async resolveContinuationAnalysisPack(
    analysisId: string,
  ): Promise<ContinuationAnalysisPack | null> {
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
    if (!analysis) {
      return null;
    }
    return {
      id: analysis.id,
      title: analysis.title,
      documentTitle: analysis.document.title,
      documentVersionNumber: analysis.documentVersion.versionNumber,
      sections: analysis.sections,
    };
  }

  private buildAnalysisSourcePack(input: {
    sourceType: "novel" | "knowledge_document";
    sourceId: string;
    sourceTitle: string;
    analysis: ContinuationAnalysisPack;
    selectedSectionKeys: Set<BookAnalysisSectionKey> | null;
  }): ContinuationContextPack {
    const humanBlock = buildAnalysisHumanBlock(input);
    const antiCopyCorpus = dedupeNonEmpty([
      input.analysis.title,
      input.analysis.documentTitle,
      ...input.analysis.sections.flatMap((section) => extractAnalysisSectionLines(section, 8)),
      humanBlock,
    ]);
    return {
      enabled: true,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceTitle: input.sourceTitle || input.analysis.documentTitle,
      systemRule: "若为续写模式：必须承接前作因果与角色弧线，但禁止复刻前作关键桥段顺序、标志性台词和句式。",
      humanBlock,
      antiCopyCorpus,
    };
  }

  private async buildNovelSourcePack(sourceNovelId: string): Promise<ContinuationContextPack> {
    const sourceNovel = await prisma.novel.findUnique({
      where: { id: sourceNovelId },
      include: {
        characters: { orderBy: { createdAt: "asc" }, take: 12 },
        chapterSummaries: {
          orderBy: { createdAt: "desc" },
          include: { chapter: { select: { order: true, title: true } } },
          take: 8,
        },
        facts: {
          where: { chapterId: { not: null } },
          orderBy: { createdAt: "desc" },
          take: 12,
        },
        plotBeats: {
          where: { status: { in: ["planned", "skipped"] } },
          orderBy: [{ chapterOrder: "asc" }, { createdAt: "asc" }],
          take: 8,
        },
      },
    });
    if (!sourceNovel) {
      return disabledPack();
    }

    const characterText = sourceNovel.characters.length > 0
      ? sourceNovel.characters
        .map((item) => {
          const state = item.currentState?.trim() ? ` | 当前状态: ${item.currentState.slice(0, 80)}` : "";
          return `- ${item.name} (${item.role})${state}`;
        })
        .join("\n")
      : "暂无";

    const endingSummaryText = sourceNovel.chapterSummaries.length > 0
      ? sourceNovel.chapterSummaries
        .sort((a, b) => b.chapter.order - a.chapter.order)
        .slice(0, 4)
        .map((item) => `- 第${item.chapter.order}章《${item.chapter.title}》: ${item.summary.slice(0, 140)}`)
        .join("\n")
      : "暂无";

    const factText = sourceNovel.facts.length > 0
      ? sourceNovel.facts.map((item) => `- [${item.category}] ${item.content.slice(0, 120)}`).join("\n")
      : "暂无";

    const unresolvedBeatText = sourceNovel.plotBeats.length > 0
      ? sourceNovel.plotBeats
        .map((item) => `- ${item.title}: ${item.content.slice(0, 100)}`)
        .join("\n")
      : "暂无";

    const humanBlock = `续写模式已开启，请承接前作并避免复刻。
续写来源：站内小说
前作标题：${sourceNovel.title}
前作核心角色状态：
${characterText}

前作终局章节摘要：
${endingSummaryText}

前作关键事实（用于承接因果）：
${factText}

前作未完线索（可推进，不可照抄桥段）：
${unresolvedBeatText}`;

    const antiCopyCorpus = dedupeNonEmpty([
      sourceNovel.outline?.slice(0, 1000) ?? "",
      ...sourceNovel.chapterSummaries.map((item) => item.summary.slice(0, 220)),
      ...sourceNovel.chapterSummaries.map((item) => item.keyEvents?.slice(0, 220) ?? ""),
      ...sourceNovel.facts.map((item) => item.content.slice(0, 180)),
      ...sourceNovel.plotBeats.map((item) => `${item.title} ${item.content}`.slice(0, 220)),
    ]);

    return {
      enabled: true,
      sourceType: "novel",
      sourceId: sourceNovel.id,
      sourceTitle: sourceNovel.title,
      systemRule: "若为续写模式：必须承接前作因果与角色弧线，但禁止复刻前作关键桥段顺序、标志性台词和句式。",
      humanBlock,
      antiCopyCorpus,
    };
  }

  private async buildKnowledgeSourcePack(sourceKnowledgeDocumentId: string): Promise<ContinuationContextPack> {
    const knowledgeDoc = await prisma.knowledgeDocument.findUnique({
      where: { id: sourceKnowledgeDocumentId },
      include: { activeVersion: true },
    });
    if (!knowledgeDoc || knowledgeDoc.status === "archived" || !knowledgeDoc.activeVersion?.content) {
      return disabledPack();
    }

    const knowledgeContent = knowledgeDoc.activeVersion.content;
    const segments = pickKnowledgeSegments(knowledgeContent, 18);
    const summaryBlock = segments.slice(0, 10).map((item) => `- ${item}`).join("\n");
    const antiCopyCorpus = dedupeNonEmpty([
      knowledgeDoc.title,
      ...segments,
      knowledgeContent.slice(0, 1000),
    ]);

    const humanBlock = `续写模式已开启，请承接前作并避免复刻。
续写来源：知识库小说
知识库文档标题：${knowledgeDoc.title}
可承接信息摘要：
${summaryBlock || "暂无"}`;

    return {
      enabled: true,
      sourceType: "knowledge_document",
      sourceId: knowledgeDoc.id,
      sourceTitle: knowledgeDoc.title,
      systemRule: "若为续写模式：必须承接前作因果与角色弧线，但禁止复刻前作关键桥段顺序、标志性台词和句式。",
      humanBlock,
      antiCopyCorpus,
    };
  }

  async buildChapterContextPack(novelId: string): Promise<ContinuationContextPack> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        writingMode: true,
        sourceNovelId: true,
        sourceKnowledgeDocumentId: true,
        continuationBookAnalysisId: true,
        continuationBookAnalysisSections: true,
      },
    });
    if (!novel || toWritingMode(novel.writingMode) !== "continuation") {
      return disabledPack();
    }

    const selectedSectionKeys = parseContinuationSectionKeys(novel.continuationBookAnalysisSections);
    if (novel.continuationBookAnalysisId && (novel.sourceNovelId || novel.sourceKnowledgeDocumentId)) {
      try {
        const analysis = await this.resolveContinuationAnalysisPack(novel.continuationBookAnalysisId);
        if (analysis) {
          return this.buildAnalysisSourcePack({
            sourceType: novel.sourceNovelId ? "novel" : "knowledge_document",
            sourceId: novel.sourceNovelId ?? novel.sourceKnowledgeDocumentId!,
            sourceTitle: analysis.documentTitle,
            analysis,
            selectedSectionKeys,
          });
        }
      } catch (error) {
        console.warn("[novel-continuation] structured analysis pack skipped.", {
          novelId,
          analysisId: novel.continuationBookAnalysisId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (novel.sourceNovelId) {
      return this.buildNovelSourcePack(novel.sourceNovelId);
    }
    if (novel.sourceKnowledgeDocumentId) {
      return this.buildKnowledgeSourcePack(novel.sourceKnowledgeDocumentId);
    }
    return disabledPack();
  }

  async rewriteIfTooSimilar(
    input: {
      chapterTitle: string;
      content: string;
      continuationPack: ContinuationContextPack;
    } & RewriteOptions,
  ): Promise<{ content: string; rewritten: boolean; maxSimilarity: number }> {
    const { chapterTitle, content, continuationPack } = input;
    if (!continuationPack.enabled) {
      return { content, rewritten: false, maxSimilarity: 0 };
    }

    const targetText = content.trim();
    if (!targetText) {
      return { content, rewritten: false, maxSimilarity: 0 };
    }

    const targetNgrams = buildNGramSet(targetText);
    let maxSimilarity = 0;
    let mostSimilarSnippet = "";
    for (const snippet of continuationPack.antiCopyCorpus) {
      if (snippet.length < 24) {
        continue;
      }
      const similarity = jaccardSimilarity(targetNgrams, buildNGramSet(snippet));
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        mostSimilarSnippet = snippet;
      }
    }

    if (maxSimilarity < CONTINUATION_SIMILARITY_THRESHOLD) {
      return { content, rewritten: false, maxSimilarity };
    }

    try {
      const rewritten = await runTextPrompt({
        asset: novelContinuationRewritePrompt,
        promptInput: {
          chapterTitle,
          mostSimilarSnippet,
          targetText,
        },
        options: {
          provider: input.provider ?? "deepseek",
          model: input.model,
          temperature: input.temperature ?? 0.7,
        },
      });

      const rewrittenText = rewritten.output.trim();
      if (!rewrittenText) {
        return { content, rewritten: false, maxSimilarity };
      }

      const rewrittenSimilarity = continuationPack.antiCopyCorpus.reduce((max, snippet) => {
        const similarity = jaccardSimilarity(buildNGramSet(rewrittenText), buildNGramSet(snippet));
        return Math.max(max, similarity);
      }, 0);

      if (rewrittenSimilarity >= maxSimilarity) {
        return { content, rewritten: false, maxSimilarity };
      }

      return { content: rewrittenText, rewritten: true, maxSimilarity: rewrittenSimilarity };
    } catch {
      return { content, rewritten: false, maxSimilarity };
    }
  }
}
