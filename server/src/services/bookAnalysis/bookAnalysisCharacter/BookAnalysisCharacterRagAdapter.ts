import type {
  BookAnalysisCharacterDimension,
  BookAnalysisCharacterEvidenceItem,
} from "@ai-novel/shared/types/bookAnalysisCharacter";
import { BOOK_ANALYSIS_CHARACTER_DIMENSION_LABELS } from "@ai-novel/shared/types/bookAnalysisCharacter";
import { ragServices } from "../../rag";
import { compactSnippet } from "../../rag/utils";
import type { RetrievedChunk } from "../../rag/types";

export interface CharacterDimensionRetrievalInput {
  documentId: string;
  characterName: string;
  dimensions: BookAnalysisCharacterDimension[];
  occurringChapters?: string[];
}

export interface CharacterDimensionRetrievalResult {
  promptBlock: string;
  evidence: BookAnalysisCharacterEvidenceItem[];
  chunkIds: string[];
}

function readChapterIndex(chunk: RetrievedChunk): number | undefined {
  if (!chunk.metadataJson) {
    return undefined;
  }
  try {
    const metadata = JSON.parse(chunk.metadataJson) as Record<string, unknown>;
    return typeof metadata.chapterIndex === "number"
      ? metadata.chapterIndex
      : typeof metadata.chapterOrder === "number"
        ? metadata.chapterOrder - 1
        : undefined;
  } catch {
    return undefined;
  }
}

export function buildBookAnalysisCharacterDimensionQuery(
  input: CharacterDimensionRetrievalInput,
  dimension: BookAnalysisCharacterDimension,
): string {
  const label = BOOK_ANALYSIS_CHARACTER_DIMENSION_LABELS[dimension] ?? dimension;
  const chapterHint = input.occurringChapters?.length
    ? ` 出场章节 ${input.occurringChapters.slice(0, 8).join(" ")}`
    : "";
  if (dimension === "appearance") {
    return [
      input.characterName,
      label,
      "外貌 容貌 身形 发色 瞳色 衣着 服装 配饰 伤痕 表情 气质 姿态 本章形象",
      chapterHint,
    ].filter(Boolean).join(" ");
  }
  return `${input.characterName} ${label} 原文 细节 台词 行动 心理${chapterHint}`;
}

export class BookAnalysisCharacterRagAdapter {
  async retrieveDimensionEvidence(input: CharacterDimensionRetrievalInput): Promise<CharacterDimensionRetrievalResult> {
    const dimensions = Array.from(new Set(input.dimensions));
    const chunksById = new Map<string, RetrievedChunk & { dimension: BookAnalysisCharacterDimension }>();

    await Promise.all(dimensions.map(async (dimension) => {
      const rows = await ragServices.hybridRetrievalService.retrieveByFacet({
        query: buildBookAnalysisCharacterDimensionQuery(input, dimension),
        ownerTypes: ["knowledge_document"],
        knowledgeDocumentIds: [input.documentId],
        finalTopK: 5,
        facets: {
          characterRole: [input.characterName],
        },
      });
      for (const row of rows) {
        if (!chunksById.has(row.id)) {
          chunksById.set(row.id, { ...row, dimension });
        }
      }
    }));

    const chunks = [...chunksById.values()];
    const evidence = chunks.map((chunk, index): BookAnalysisCharacterEvidenceItem => ({
      label: `${BOOK_ANALYSIS_CHARACTER_DIMENSION_LABELS[chunk.dimension] ?? chunk.dimension} 原文 ${index + 1}`,
      excerpt: compactSnippet(chunk.chunkText, 220),
      quote: compactSnippet(chunk.chunkText, 220),
      sourceLabel: chunk.title ?? "原文 chunk",
      sourceType: "chapter_chunk",
      chunkId: chunk.id,
      chapterIndex: readChapterIndex(chunk),
      dimension: chunk.dimension,
    }));
    const promptBlock = chunks
      .map((chunk, index) => [
        `[CHUNK-${index + 1}] dimension=${chunk.dimension} chunkId=${chunk.id}`,
        chunk.title ? `title=${chunk.title}` : "",
        `chapterIndex=${readChapterIndex(chunk) ?? "unknown"}`,
        compactSnippet(chunk.chunkText, 900),
      ].filter(Boolean).join("\n"))
      .join("\n\n");

    return {
      promptBlock,
      evidence,
      chunkIds: chunks.map((chunk) => chunk.id),
    };
  }
}

export const bookAnalysisCharacterRagAdapter = new BookAnalysisCharacterRagAdapter();
