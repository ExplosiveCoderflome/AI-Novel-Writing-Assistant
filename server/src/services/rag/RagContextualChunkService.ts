import { createHash } from "node:crypto";
import { ragConfig } from "../../config/rag";
import type { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { ragContextualChunkPrompt } from "../../prompting/prompts/rag/contextualChunk.prompts";
import type { RagChunkCandidate, RagSourceDocument } from "./types";
import { estimateTokenCount, normalizeRagText, runWithConcurrency } from "./utils";

const CONTEXT_PREFIX_MAX_CHARS = 260;

type ContextualPromptRunner = typeof runStructuredPrompt;

export interface RagContextualChunkDocument {
  ownerType: RagSourceDocument["ownerType"];
  ownerId: string;
  title?: string;
  novelId?: string;
  worldId?: string;
  metadata?: Record<string, unknown>;
}

export interface RagContextualChunkInput {
  document: RagContextualChunkDocument;
  chunkOrder: number;
  chunkText: string;
  metadata?: Record<string, unknown>;
}

function parseMetadataJson(raw: string | undefined): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function stringifyMetadata(metadata: Record<string, unknown>): string | undefined {
  return Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : undefined;
}

function buildContextSourceHash(input: RagContextualChunkInput): string {
  return createHash("sha256")
    .update(JSON.stringify({
      version: ragConfig.contextualRetrievalVersion,
      document: input.document,
      chunkOrder: input.chunkOrder,
      chunkText: input.chunkText,
      metadata: input.metadata,
    }))
    .digest("hex")
    .slice(0, 24);
}

function normalizeContextPrefix(value: string | null | undefined): string {
  return normalizeRagText(value ?? "").slice(0, CONTEXT_PREFIX_MAX_CHARS);
}

export function buildSearchText(chunkText: string, contextPrefix?: string): string {
  const prefix = normalizeContextPrefix(contextPrefix);
  if (!prefix) {
    return chunkText;
  }
  return `${prefix}\n\n${chunkText}`.trim();
}

export class RagContextualChunkService {
  constructor(private readonly promptRunner?: ContextualPromptRunner) {}

  async buildContextPrefix(input: RagContextualChunkInput): Promise<{
    contextPrefix?: string;
    contextVersion: number;
    contextSourceHash: string;
    searchText: string;
  }> {
    const contextVersion = ragConfig.contextualRetrievalVersion;
    const contextSourceHash = buildContextSourceHash(input);
    if (!ragConfig.contextualRetrievalEnabled) {
      return {
        contextVersion,
        contextSourceHash,
        searchText: input.chunkText,
      };
    }

    // These chunks are the final artifact extraction itself, not unstructured source material.
    // Their structured source labels are sufficient; enriching each fact would multiply AI calls.
    const artifactKind = input.metadata?.artifactKind;
    if (input.document.ownerType === "chapter_summary"
      && input.document.metadata?.chapterArtifactVersion === 1
      && (artifactKind === "summary" || artifactKind === "fact")) {
      const chapterOrder = input.document.metadata.chapterOrder;
      const chapterLabel = typeof chapterOrder === "number" ? `第${chapterOrder}章` : "章节";
      const titleLabel = input.document.title ? `《${input.document.title}》` : "";
      const contextPrefix = normalizeContextPrefix(
        `${chapterLabel}${titleLabel}的${artifactKind === "summary" ? "已保存摘要" : "已保存事实"}`,
      );
      return {
        contextPrefix,
        contextVersion,
        contextSourceHash,
        searchText: buildSearchText(input.chunkText, contextPrefix),
      };
    }

    try {
      // The runner owns context providers that consume RAG. Load it only at invocation.
      const runner = this.promptRunner ?? (await import("../../prompting/core/promptRunner")).runStructuredPrompt;
      const result = await runner({
        asset: ragContextualChunkPrompt,
        promptInput: {
          ownerType: input.document.ownerType,
          ownerId: input.document.ownerId,
          title: input.document.title ?? "",
          novelId: input.document.novelId ?? "",
          worldId: input.document.worldId ?? "",
          chunkOrder: input.chunkOrder,
          metadataJson: JSON.stringify({
            ...(input.document.metadata ?? {}),
            ...(input.metadata ?? {}),
          }),
          chunkText: input.chunkText,
        },
        options: {
          timeoutMs: ragConfig.contextualRetrievalTimeoutMs,
          maxTokens: 220,
          temperature: 0.1,
          entrypoint: "rag_contextual_chunk",
          scope: input.document.ownerType,
          triggerReason: "rag_index_context_prefix",
        },
      });
      const contextPrefix = normalizeContextPrefix(result.output.contextPrefix);
      return {
        contextPrefix: contextPrefix || undefined,
        contextVersion,
        contextSourceHash,
        searchText: buildSearchText(input.chunkText, contextPrefix),
      };
    } catch {
      return {
        contextVersion,
        contextSourceHash,
        searchText: input.chunkText,
      };
    }
  }

  async applyToCandidates(input: {
    candidates: RagChunkCandidate[];
    documentsByOwner: Map<string, RagContextualChunkDocument>;
  }): Promise<void> {
    if (input.candidates.length === 0) {
      return;
    }

    await runWithConcurrency(input.candidates, ragConfig.contextualRetrievalConcurrency, async (candidate) => {
      const document = input.documentsByOwner.get(`${candidate.ownerType}:${candidate.ownerId}`) ?? {
        ownerType: candidate.ownerType,
        ownerId: candidate.ownerId,
        title: candidate.title,
        novelId: candidate.novelId,
        worldId: candidate.worldId,
      };
      const metadata = parseMetadataJson(candidate.metadataJson);
      const contextual = await this.buildContextPrefix({
        document,
        chunkOrder: candidate.chunkOrder,
        chunkText: candidate.chunkText,
        metadata,
      });
      const nextMetadata = {
        ...metadata,
        contextPrefix: contextual.contextPrefix,
        contextVersion: contextual.contextVersion,
        contextSourceHash: contextual.contextSourceHash,
        searchText: contextual.searchText,
      };
      candidate.contextPrefix = contextual.contextPrefix;
      candidate.contextVersion = contextual.contextVersion;
      candidate.contextSourceHash = contextual.contextSourceHash;
      candidate.searchText = contextual.searchText;
      candidate.metadataJson = stringifyMetadata(nextMetadata);
      candidate.tokenEstimate = Math.max(candidate.tokenEstimate, estimateTokenCount(contextual.searchText));
    });
  }
}
