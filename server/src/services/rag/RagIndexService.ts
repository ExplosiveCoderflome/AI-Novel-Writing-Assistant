import type { RagIndexJob } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ragConfig } from "../../config/rag";
import { getRagEmbeddingSettings } from "../settings/RagSettingsService";
import { EmbeddingService } from "./EmbeddingService";
import { VectorStoreService } from "./VectorStoreService";
import { resolveEmbeddingChunkTokenBudget } from "./embeddingModelLimits";
import type { RagChunkCandidate, RagJobStatus, RagJobType, RagOwnerType, RagSourceDocument } from "./types";
import { buildChunkId, computeChunkHash, estimateTokenCount, normalizeRagText, splitRagChunks } from "./utils";
import {
  encodeFacetKeys,
  extractChapterAnchorFromChunk,
  extractCharacterRolesFromChunk,
  normalizeRagFacets,
  type RagChunkAnchor,
  type RagChunkFacets,
  type RagPreChunk,
} from "./chunkFacets";
import { runWithConcurrency } from "./utils";

type ReindexScope = "novel" | "world" | "all";

export class RagJobCancelledError extends Error {
  constructor() {
    super("RAG job cancelled.");
    this.name = "RagJobCancelledError";
  }
}

function isCjk(text: string): boolean {
  return /[\u4E00-\u9FFF]/.test(text);
}

function buildJoinedText(...parts: Array<string | null | undefined>): string {
  return parts
    .map((item) => (item ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

interface PendingOwner {
  ownerType: RagOwnerType;
  ownerId: string;
}

interface SourcePiece {
  chunkText: string;
  facets?: import("./chunkFacets").RagChunkFacets;
  anchor?: RagChunkAnchor;
  metadata?: Record<string, unknown>;
}

export interface RagJobProgressSnapshot {
  stage:
    | "queued"
    | "loading_source"
    | "chunking"
    | "embedding"
    | "ensuring_collection"
    | "deleting_existing"
    | "upserting_vectors"
    | "writing_metadata"
    | "completed"
    | "cancelled"
    | "failed";
  label: string;
  detail?: string;
  current?: number;
  total?: number;
  percent: number;
  documents?: number;
  chunks?: number;
  updatedAt: string;
}

interface RagJobPayloadRecord extends Record<string, unknown> {
  progress?: RagJobProgressSnapshot;
  preChunks?: RagPreChunk[];
}

export interface RagJobSummaryRecord {
  id: string;
  tenantId: string;
  jobType: RagJobType;
  ownerType: RagOwnerType;
  ownerId: string;
  status: RagJobStatus;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  progress?: RagJobProgressSnapshot;
}

export class RagIndexService {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStoreService: VectorStoreService,
  ) {}

  private parseJobPayload(payloadJson: string | null): RagJobPayloadRecord {
    if (!payloadJson) {
      return {};
    }
    try {
      const parsed = JSON.parse(payloadJson) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      return parsed as RagJobPayloadRecord;
    } catch {
      return {};
    }
  }

  private createProgressSnapshot(input: Omit<RagJobProgressSnapshot, "updatedAt">): RagJobProgressSnapshot {
    return {
      ...input,
      percent: Math.min(1, Math.max(0, Number.isFinite(input.percent) ? input.percent : 0)),
      updatedAt: new Date().toISOString(),
    };
  }

  private async assertJobNotCancelled(jobId: string): Promise<void> {
    const job = await prisma.ragIndexJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    });
    if (!job) {
      throw new Error("RAG job not found.");
    }
    if (job.status === "cancelled") {
      throw new RagJobCancelledError();
    }
  }

  private async updateJobProgress(jobId: string, progress: Omit<RagJobProgressSnapshot, "updatedAt">): Promise<void> {
    const record = await prisma.ragIndexJob.findUnique({
      where: { id: jobId },
      select: { payloadJson: true },
    });
    if (!record) {
      return;
    }
    const payload = this.parseJobPayload(record.payloadJson);
    payload.progress = this.createProgressSnapshot(progress);
    await prisma.ragIndexJob.update({
      where: { id: jobId },
      data: {
        payloadJson: JSON.stringify(payload),
      },
    });
  }

  private serializeJob(job: RagIndexJob): RagJobSummaryRecord {
    const payload = this.parseJobPayload(job.payloadJson);
    return {
      id: job.id,
      tenantId: job.tenantId,
      jobType: job.jobType as RagJobType,
      ownerType: job.ownerType as RagOwnerType,
      ownerId: job.ownerId,
      status: job.status as RagJobStatus,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      runAfter: job.runAfter,
      lastError: job.lastError,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      progress: payload.progress,
    };
  }

  private async embedTextsInBatches(
    texts: string[],
    onProgress?: (payload: { processed: number; total: number }) => Promise<void>,
  ): Promise<{ vectors: number[][]; provider: string; model: string }> {
    if (texts.length === 0) {
      return { vectors: [], provider: ragConfig.embeddingProvider, model: ragConfig.embeddingModel };
    }
    const batchSize = ragConfig.embeddingBatchSize;
    const concurrency = ragConfig.embeddingConcurrency;
    const vectors: number[][] = new Array(texts.length);
    let provider = ragConfig.embeddingProvider;
    let model = ragConfig.embeddingModel;
    let processed = 0;
    let lastReportPercent = 0;

    const batches: { start: number; texts: string[] }[] = [];
    for (let cursor = 0; cursor < texts.length; cursor += batchSize) {
      batches.push({ start: cursor, texts: texts.slice(cursor, cursor + batchSize) });
    }

    await runWithConcurrency(batches, concurrency, async (batch) => {
      const result = await this.embeddingService.embedTexts(batch.texts);
      provider = result.provider;
      model = result.model;
      for (let i = 0; i < result.vectors.length; i += 1) {
        vectors[batch.start + i] = result.vectors[i];
      }
      processed += batch.texts.length;

      if (onProgress) {
        const percent = texts.length > 0 ? processed / texts.length : 1;
        if (percent - lastReportPercent >= 0.03 || processed >= texts.length) {
          lastReportPercent = percent;
          await onProgress({ processed: Math.min(processed, texts.length), total: texts.length });
        }
      }
    });

    return { vectors, provider, model };
  }

  private normalizePreChunks(raw: unknown): RagPreChunk[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return [];
      }
      const record = item as Record<string, unknown>;
      const chunkText = typeof record.chunkText === "string" ? normalizeRagText(record.chunkText) : "";
      if (!chunkText) {
        return [];
      }
      const anchor = record.anchor && typeof record.anchor === "object" && !Array.isArray(record.anchor)
        ? record.anchor as RagChunkAnchor
        : undefined;
      const metadata = record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
        ? record.metadata as Record<string, unknown>
        : undefined;
      return [{
        chunkText,
        facets: normalizeRagFacets(record.facets),
        anchor,
        metadata,
      }];
    }).slice(0, 200);
  }

  private async loadSourceDocuments(
    ownerType: RagOwnerType,
    ownerId: string,
    tenantId: string,
    payload?: RagJobPayloadRecord,
  ): Promise<RagSourceDocument[]> {
    switch (ownerType) {
      case "novel": {
        const novel = await prisma.novel.findUnique({
          where: { id: ownerId },
          include: { world: true },
        });
        if (!novel) {
          return [];
        }
        const content = buildJoinedText(
          novel.title,
          novel.description ?? undefined,
          novel.outline ?? undefined,
          novel.structuredOutline ?? undefined,
          novel.world?.description ?? undefined,
        );
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            novelId: novel.id,
            worldId: novel.worldId ?? undefined,
            title: novel.title,
            content,
            metadata: {
              status: novel.status,
              updatedAt: novel.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "chapter": {
        const chapter = await prisma.chapter.findUnique({ where: { id: ownerId } });
        if (!chapter) {
          return [];
        }
        const content = buildJoinedText(chapter.title, chapter.content ?? undefined);
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            novelId: chapter.novelId,
            title: chapter.title,
            content,
            metadata: {
              order: chapter.order,
              chapterOrder: chapter.order,
              state: chapter.generationState,
              updatedAt: chapter.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "world": {
        const world = await prisma.world.findUnique({ where: { id: ownerId } });
        if (!world) {
          return [];
        }
        const content = buildJoinedText(
          world.name,
          world.description ?? undefined,
          world.background ?? undefined,
          world.geography ?? undefined,
          world.magicSystem ?? undefined,
          world.politics ?? undefined,
          world.cultures ?? undefined,
          world.races ?? undefined,
          world.religions ?? undefined,
          world.technology ?? undefined,
          world.history ?? undefined,
          world.economy ?? undefined,
          world.factions ?? undefined,
          world.conflicts ?? undefined,
          world.overviewSummary ?? undefined,
        );
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            worldId: world.id,
            title: world.name,
            content,
            metadata: {
              worldType: world.worldType,
              status: world.status,
              version: world.version,
              updatedAt: world.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "character": {
        const character = await prisma.character.findUnique({ where: { id: ownerId } });
        if (!character) {
          return [];
        }
        const content = buildJoinedText(
          character.name,
          character.role,
          character.personality ?? undefined,
          character.background ?? undefined,
          character.development ?? undefined,
          character.currentState ?? undefined,
          character.currentGoal ?? undefined,
        );
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            novelId: character.novelId,
            title: character.name,
            content,
            metadata: {
              role: character.role,
              updatedAt: character.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "bible": {
        const bible = await prisma.novelBible.findUnique({ where: { novelId: ownerId } });
        if (!bible) {
          return [];
        }
        const content = buildJoinedText(
          bible.mainPromise ?? undefined,
          bible.coreSetting ?? undefined,
          bible.forbiddenRules ?? undefined,
          bible.characterArcs ?? undefined,
          bible.worldRules ?? undefined,
          bible.rawContent ?? undefined,
        );
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            novelId: bible.novelId,
            title: `bible-${bible.novelId}`,
            content,
            metadata: {
              updatedAt: bible.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "chapter_summary": {
        const summary = await prisma.chapterSummary.findUnique({ where: { chapterId: ownerId } });
        if (!summary) {
          return [];
        }
        const content = buildJoinedText(
          summary.summary,
          summary.keyEvents ?? undefined,
          summary.characterStates ?? undefined,
          summary.hook ?? undefined,
        );
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            novelId: summary.novelId,
            title: `chapter-summary-${summary.chapterId}`,
            content,
            metadata: {
              chapterId: summary.chapterId,
              updatedAt: summary.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "consistency_fact": {
        const fact = await prisma.consistencyFact.findUnique({ where: { id: ownerId } });
        if (!fact) {
          return [];
        }
        const content = normalizeRagText(fact.content);
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            novelId: fact.novelId,
            title: `fact-${fact.category}`,
            content,
            metadata: {
              category: fact.category,
              source: fact.source,
              chapterId: fact.chapterId,
              updatedAt: fact.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "character_timeline": {
        const timeline = await prisma.characterTimeline.findUnique({ where: { id: ownerId } });
        if (!timeline) {
          return [];
        }
        const content = buildJoinedText(timeline.title, timeline.content);
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            novelId: timeline.novelId,
            title: timeline.title,
            content,
            metadata: {
              source: timeline.source,
              characterId: timeline.characterId,
              chapterId: timeline.chapterId,
              chapterOrder: timeline.chapterOrder,
              updatedAt: timeline.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "world_library_item": {
        const item = await prisma.worldPropertyLibrary.findUnique({ where: { id: ownerId } });
        if (!item) {
          return [];
        }
        const content = buildJoinedText(item.name, item.description ?? undefined);
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            worldId: item.sourceWorldId ?? undefined,
            title: item.name,
            content,
            metadata: {
              category: item.category,
              worldType: item.worldType,
              usageCount: item.usageCount,
              updatedAt: item.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "knowledge_document": {
        const document = await prisma.knowledgeDocument.findUnique({
          where: { id: ownerId },
          include: { activeVersion: true },
        });
        if (!document?.activeVersion || document.status === "archived") {
          return [];
        }
        const content = normalizeRagText(document.activeVersion.content);
        return content
          ? [{
            ownerType,
            ownerId,
            tenantId,
            title: document.title,
            content,
            preChunks: this.normalizePreChunks(payload?.preChunks),
            metadata: {
              fileName: document.fileName,
              kind: document.kind,
              sourceAnalysisId: document.sourceAnalysisId,
              status: document.status,
              activeVersionId: document.activeVersionId,
              activeVersionNumber: document.activeVersionNumber,
              updatedAt: document.updatedAt.toISOString(),
            },
          }]
          : [];
      }
      case "chat_message":
      default:
        return [];
    }
  }

  private buildChunkCandidates(
    documents: RagSourceDocument[],
    embedProvider: string,
    embedModel: string,
    options?: { maxTokens?: number | null; knownCharacterNames?: string[] },
  ): RagChunkCandidate[] {
    const candidateNames = options?.knownCharacterNames ?? [];
    const candidates: RagChunkCandidate[] = [];
    for (const document of documents) {
      const isKnowledgeDoc = document.ownerType === "knowledge_document";
      const sourcePieces: SourcePiece[] = document.preChunks?.length
        ? document.preChunks.flatMap((preChunk) => {
          const pieces = splitRagChunks(preChunk.chunkText, ragConfig.chunkSize, ragConfig.chunkOverlap, {
            maxTokens: options?.maxTokens ?? null,
          });
          return pieces.map((chunkText) => ({
            chunkText,
            facets: preChunk.facets,
            anchor: preChunk.anchor,
            metadata: preChunk.metadata,
          }));
        })
        : splitRagChunks(document.content, ragConfig.chunkSize, ragConfig.chunkOverlap, {
          maxTokens: options?.maxTokens ?? null,
        }).map((chunkText): SourcePiece => {
          if (!isKnowledgeDoc) {
            return { chunkText };
          }
          // 知识库文档：自动从 chunk 正文抽取章节锚点和角色名，填充 facets
          const chapterAnchors = extractChapterAnchorFromChunk(chunkText);
          const characterRoles = candidateNames.length > 0
            ? extractCharacterRolesFromChunk(chunkText, candidateNames)
            : [];
          const facets: RagChunkFacets = {};
          if (chapterAnchors.length > 0) {
            facets.chapterAnchor = chapterAnchors;
          }
          if (characterRoles.length > 0) {
            facets.characterRole = characterRoles;
          }
          return {
            chunkText,
            facets: Object.keys(facets).length > 0 ? facets : undefined,
          };
        });
      for (const piece of sourcePieces) {
        const chunkText = piece.chunkText;
        const chunkOrder = candidates.filter((item) =>
          item.ownerType === document.ownerType && item.ownerId === document.ownerId).length;
        const metadata = {
          ...(document.metadata ?? {}),
          ...(piece.metadata ?? {}),
          ...(piece.facets && Object.keys(piece.facets).length > 0 ? { facets: piece.facets } : {}),
          ...(piece.anchor ? { anchor: piece.anchor } : {}),
        };
        const facetKeys = encodeFacetKeys(piece.facets);
        const chapterAnchor = piece.anchor?.chapterIndex !== undefined
          ? String(piece.anchor.chapterIndex)
          : piece.facets?.chapterAnchor?.[0] ?? null;
        const chunkHash = computeChunkHash(
          `${document.tenantId}|${document.ownerType}|${document.ownerId}|${chunkOrder}|${chunkText}`,
        );
        candidates.push({
          id: buildChunkId(),
          ownerType: document.ownerType,
          ownerId: document.ownerId,
          tenantId: document.tenantId,
          title: document.title,
          chunkText,
          chunkHash,
          chunkOrder,
          tokenEstimate: estimateTokenCount(chunkText),
          language: isCjk(chunkText) ? "zh" : "en",
          metadataJson: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : undefined,
          facets: piece.facets,
          facetKeys,
          chapterAnchor,
          embedProvider,
          embedModel,
          embedVersion: ragConfig.embeddingVersion,
          novelId: document.novelId,
          worldId: document.worldId,
        });
      }
    }
    return candidates;
  }

  private async deleteOwnerChunks(
    ownerType: RagOwnerType,
    ownerId: string,
    tenantId: string,
    jobId?: string,
  ): Promise<{ deleted: number }> {
    if (jobId) {
      await this.assertJobNotCancelled(jobId);
    }
    const existing = await prisma.knowledgeChunk.findMany({
      where: { tenantId, ownerType, ownerId },
      select: { id: true },
    });
    if (existing.length === 0) {
      return { deleted: 0 };
    }
    if (jobId) {
      await this.updateJobProgress(jobId, {
        stage: "deleting_existing",
        label: "清理旧索引",
        detail: `正在删除 ${existing.length} 条旧分块。`,
        current: existing.length,
        total: existing.length,
        documents: 0,
        chunks: existing.length,
        percent: 0.8,
      });
    }
    const ids = existing.map((item) => item.id);
    await this.vectorStoreService.deletePoints(ids);
    await prisma.knowledgeChunk.deleteMany({
      where: { tenantId, ownerType, ownerId },
    });
    return { deleted: existing.length };
  }

  private async upsertOwnerChunks(
    ownerType: RagOwnerType,
    ownerId: string,
    tenantId: string,
    jobId: string,
  ): Promise<{ chunks: number }> {
    await this.assertJobNotCancelled(jobId);
    await this.updateJobProgress(jobId, {
      stage: "loading_source",
      label: "读取文档",
      detail: "正在读取知识库文档内容。",
      documents: 0,
      chunks: 0,
      percent: 0.05,
    });
    const jobPayload = this.parseJobPayload((await prisma.ragIndexJob.findUnique({
      where: { id: jobId },
      select: { payloadJson: true },
    }))?.payloadJson ?? null);
    const docs = await this.loadSourceDocuments(ownerType, ownerId, tenantId, jobPayload);
    await this.assertJobNotCancelled(jobId);
    if (docs.length === 0) {
      await this.updateJobProgress(jobId, {
        stage: "deleting_existing",
        label: "清理旧索引",
        detail: "当前没有可索引内容，正在清理旧索引。",
        documents: 0,
        chunks: 0,
        percent: 0.3,
      });
      await this.deleteOwnerChunks(ownerType, ownerId, tenantId, jobId);
      await this.updateJobProgress(jobId, {
        stage: "completed",
        label: "索引完成",
        detail: "没有可索引内容，旧索引已清理。",
        documents: 0,
        chunks: 0,
        percent: 1,
      });
      return { chunks: 0 };
    }

    const embeddingSettings = await getRagEmbeddingSettings();
    const embeddingTokenBudget = resolveEmbeddingChunkTokenBudget(
      embeddingSettings.embeddingProvider,
      embeddingSettings.embeddingModel,
    );

    // 知识库文档索引时，预加载角色候选名用于 chunk facet 自动提取
    // KnowledgeDocument 没有直接 novelId，取该租户下所有角色名做关键词匹配（数量有限，代价可忽略）
    let knownCharacterNames: string[] = [];
    if (ownerType === "knowledge_document") {
      const chars = await prisma.character.findMany({
        select: { name: true },
        take: 300,
        orderBy: { updatedAt: "desc" },
      });
      knownCharacterNames = chars.map((c) => c.name).filter((n) => n.length >= 2);
    }

    const candidates = this.buildChunkCandidates(docs, embeddingSettings.embeddingProvider, embeddingSettings.embeddingModel, {
      maxTokens: embeddingTokenBudget,
      knownCharacterNames,
    });
    const splitTexts = candidates.map((item) => item.chunkText);
    await this.updateJobProgress(jobId, {
      stage: "chunking",
      label: "切分分块",
      detail: `已读取 ${docs.length} 份文档，生成 ${splitTexts.length} 个分块。`,
      current: splitTexts.length,
      total: splitTexts.length,
      documents: docs.length,
      chunks: splitTexts.length,
      percent: 0.15,
    });
    await this.assertJobNotCancelled(jobId);
    const embedding = await this.embedTextsInBatches(splitTexts, async ({ processed, total }) => {
      await this.updateJobProgress(jobId, {
        stage: "embedding",
        label: "生成向量",
        detail: `已生成 ${processed}/${total} 个向量（${ragConfig.embeddingConcurrency} 并发）。`,
        current: processed,
        total,
        documents: docs.length,
        chunks: total,
        percent: 0.15 + (total > 0 ? (processed / total) * 0.5 : 0),
      });
    });
    await this.assertJobNotCancelled(jobId);
    for (const candidate of candidates) {
      candidate.embedProvider = embedding.provider;
      candidate.embedModel = embedding.model;
    }
    if (candidates.length === 0) {
      await this.updateJobProgress(jobId, {
        stage: "deleting_existing",
        label: "清理旧索引",
        detail: "切分后没有可写入的分块，正在清理旧索引。",
        documents: docs.length,
        chunks: 0,
        percent: 0.3,
      });
      await this.deleteOwnerChunks(ownerType, ownerId, tenantId, jobId);
      await this.updateJobProgress(jobId, {
        stage: "completed",
        label: "索引完成",
        detail: "切分后没有可写入的分块。",
        documents: docs.length,
        chunks: 0,
        percent: 1,
      });
      return { chunks: 0 };
    }
    if (embedding.vectors.length !== candidates.length) {
      throw new Error("RAG embedding 数量与 chunk 数量不一致。");
    }

    const vectorSize = embedding.vectors[0]?.length ?? 0;
    await this.updateJobProgress(jobId, {
      stage: "ensuring_collection",
      label: "校验集合",
      detail: `正在校验向量集合，目标维度 ${vectorSize}。`,
      current: candidates.length,
      total: candidates.length,
      documents: docs.length,
      chunks: candidates.length,
      percent: 0.7,
    });
    await this.assertJobNotCancelled(jobId);
    await this.vectorStoreService.ensureCollection(vectorSize);

    // 读取旧 chunk id，但先不删除 — 保持旧数据可检索直到新数据写入完成
    const oldChunks = await prisma.knowledgeChunk.findMany({
      where: { tenantId, ownerType, ownerId },
      select: { id: true },
    });
    const oldIds = oldChunks.map((item) => item.id);
    await this.assertJobNotCancelled(jobId);

    await this.updateJobProgress(jobId, {
      stage: "upserting_vectors",
      label: "写入向量库",
      detail: `正在向 Qdrant 写入 ${candidates.length} 个分块（${ragConfig.qdrantUpsertConcurrency} 并发）。`,
      current: candidates.length,
      total: candidates.length,
      documents: docs.length,
      chunks: candidates.length,
      percent: 0.8,
    });
    await this.assertJobNotCancelled(jobId);

    // Phase 3.1: 先写新分块到 Qdrant + DB，成功后再删旧分块，消除可见性空窗
    const newPoints = candidates.map((item, index) => ({
      id: item.id,
      vector: embedding.vectors[index],
      payload: {
        tenantId: item.tenantId,
        ownerType: item.ownerType,
        ownerId: item.ownerId,
        novelId: item.novelId,
        worldId: item.worldId,
        title: item.title,
        chunkText: item.chunkText,
        chunkHash: item.chunkHash,
        chunkOrder: item.chunkOrder,
        metadataJson: item.metadataJson,
        facetKeys: item.facetKeys,
        chapterAnchor: item.chapterAnchor,
        ...(item.facets ?? {}),
      },
    }));

    // 1. Qdrant 写入新分块
    try {
      await this.vectorStoreService.upsertPoints(newPoints);
    } catch (error) {
      // 新分块写入失败，旧分块仍在，直接抛出
      throw error;
    }

    // 2. DB 写入新分块元数据
    try {
      await this.updateJobProgress(jobId, {
        stage: "writing_metadata",
        label: "写入索引元数据",
        detail: `正在写入 ${candidates.length} 条本地索引记录。`,
        current: candidates.length,
        total: candidates.length,
        documents: docs.length,
        chunks: candidates.length,
        percent: 0.92,
      });
      await prisma.knowledgeChunk.createMany({
        data: candidates.map((item) => ({
          id: item.id,
          tenantId: item.tenantId,
          ownerType: item.ownerType,
          ownerId: item.ownerId,
          novelId: item.novelId ?? null,
          worldId: item.worldId ?? null,
          title: item.title ?? null,
          chunkText: item.chunkText,
          chunkHash: item.chunkHash,
          chunkOrder: item.chunkOrder,
          tokenEstimate: item.tokenEstimate,
          language: item.language,
          metadataJson: item.metadataJson ?? null,
          facetKeys: item.facetKeys ?? null,
          chapterAnchor: item.chapterAnchor ?? null,
          embedProvider: item.embedProvider,
          embedModel: item.embedModel,
          embedVersion: item.embedVersion,
          indexedAt: new Date(),
        })),
      });
    } catch (error) {
      // DB 写入失败，回滚：删除刚写的新 Qdrant 分块
      await this.vectorStoreService.deletePoints(candidates.map((item) => item.id)).catch(() => {});
      throw error;
    }

    // 3. 新分块全部就位，安全删除旧分块
    if (oldIds.length > 0) {
      await this.updateJobProgress(jobId, {
        stage: "deleting_existing",
        label: "清理旧索引",
        detail: `正在删除 ${oldIds.length} 条旧分块。`,
        current: oldIds.length,
        total: oldIds.length,
        documents: docs.length,
        chunks: candidates.length,
        percent: 0.97,
      });
      await this.vectorStoreService.deletePoints(oldIds).catch(() => {});
      await prisma.knowledgeChunk.deleteMany({ where: { id: { in: oldIds } } }).catch(() => {});
    }

    await this.updateJobProgress(jobId, {
      stage: "completed",
      label: "索引完成",
      detail: `索引已完成，共 ${candidates.length} 个分块。`,
      current: candidates.length,
      total: candidates.length,
      documents: docs.length,
      chunks: candidates.length,
      percent: 1,
    });
    return { chunks: candidates.length };
  }

  async enqueueOwnerJob(
    jobType: RagJobType,
    ownerType: RagOwnerType,
    ownerId: string,
    options?: {
      tenantId?: string;
      payload?: Record<string, unknown>;
      runAfter?: Date;
      maxAttempts?: number;
    },
  ) {
    const tenantId = options?.tenantId ?? ragConfig.defaultTenantId;
    const existing = await prisma.ragIndexJob.findFirst({
      where: {
        tenantId,
        jobType,
        ownerType,
        ownerId,
        status: { in: ["queued", "running"] as RagJobStatus[] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      if (options?.payload && existing.status === "queued") {
        const currentPayload = this.parseJobPayload(existing.payloadJson);
        await prisma.ragIndexJob.update({
          where: { id: existing.id },
          data: {
            payloadJson: JSON.stringify({
              ...currentPayload,
              ...options.payload,
              progress: currentPayload.progress,
            } satisfies RagJobPayloadRecord),
          },
        });
      }
      return existing;
    }
    const created = await prisma.ragIndexJob.create({
      data: {
        tenantId,
        jobType,
        ownerType,
        ownerId,
        status: "queued",
        attempts: 0,
        maxAttempts: options?.maxAttempts ?? ragConfig.workerMaxAttempts,
        runAfter: options?.runAfter ?? new Date(),
        payloadJson: JSON.stringify({
          ...(options?.payload ?? {}),
          progress: this.createProgressSnapshot({
            stage: "queued",
            label: "等待执行",
            detail: "索引任务已进入队列。",
            percent: 0,
          }),
        } satisfies RagJobPayloadRecord),
      },
    });
    return created;
  }

  async enqueueUpsert(ownerType: RagOwnerType, ownerId: string, tenantId?: string) {
    return this.enqueueOwnerJob("upsert", ownerType, ownerId, { tenantId });
  }

  async enqueueDelete(ownerType: RagOwnerType, ownerId: string, tenantId?: string) {
    return this.enqueueOwnerJob("delete", ownerType, ownerId, { tenantId });
  }

  private async collectOwners(scope: ReindexScope, id?: string): Promise<PendingOwner[]> {
    const owners = new Map<string, PendingOwner>();
    const push = (ownerType: RagOwnerType, ownerId: string) => {
      const key = `${ownerType}:${ownerId}`;
      owners.set(key, { ownerType, ownerId });
    };

    if (scope === "novel" || scope === "all") {
      const novelIds = scope === "novel"
        ? (id ? [id] : [])
        : (await prisma.novel.findMany({ select: { id: true } })).map((item) => item.id);
      if (scope === "novel" && !id) {
        const all = await prisma.novel.findMany({ select: { id: true } });
        all.forEach((item) => novelIds.push(item.id));
      }
      for (const novelId of novelIds) {
        push("novel", novelId);
        push("bible", novelId);
      }
      const [chapters, summaries, facts, characters, timelines] = await Promise.all([
        prisma.chapter.findMany({
          where: { novelId: { in: novelIds } },
          select: { id: true },
        }),
        prisma.chapterSummary.findMany({
          where: { novelId: { in: novelIds } },
          select: { chapterId: true },
        }),
        prisma.consistencyFact.findMany({
          where: { novelId: { in: novelIds } },
          select: { id: true },
        }),
        prisma.character.findMany({
          where: { novelId: { in: novelIds } },
          select: { id: true },
        }),
        prisma.characterTimeline.findMany({
          where: { novelId: { in: novelIds } },
          select: { id: true },
        }),
      ]);
      chapters.forEach((item) => push("chapter", item.id));
      summaries.forEach((item) => push("chapter_summary", item.chapterId));
      facts.forEach((item) => push("consistency_fact", item.id));
      characters.forEach((item) => push("character", item.id));
      timelines.forEach((item) => push("character_timeline", item.id));
    }

    if (scope === "world" || scope === "all") {
      const worldIds = scope === "world"
        ? (id ? [id] : [])
        : (await prisma.world.findMany({ select: { id: true } })).map((item) => item.id);
      if (scope === "world" && !id) {
        const all = await prisma.world.findMany({ select: { id: true } });
        all.forEach((item) => worldIds.push(item.id));
      }
      worldIds.forEach((worldId) => push("world", worldId));
      const library = await prisma.worldPropertyLibrary.findMany({
        where: scope === "world" ? { sourceWorldId: id ?? undefined } : {},
        select: { id: true },
      });
      library.forEach((item) => push("world_library_item", item.id));
    }

    return Array.from(owners.values());
  }

  async enqueueReindex(scope: ReindexScope, id?: string, tenantId?: string) {
    const owners = await this.collectOwners(scope, id);
    const jobs = await Promise.all(
      owners.map((owner) =>
        this.enqueueOwnerJob("rebuild", owner.ownerType, owner.ownerId, { tenantId }),
      ),
    );
    return {
      scope,
      id: id ?? null,
      count: jobs.length,
      jobs,
    };
  }

  async getNextRunnableJob(): Promise<RagIndexJob | null> {
    return prisma.ragIndexJob.findFirst({
      where: {
        status: "queued",
        runAfter: { lte: new Date() },
      },
      orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }],
    });
  }

  async updateJobStatus(jobId: string, payload: {
    status: RagJobStatus;
    attempts?: number;
    runAfter?: Date;
    lastError?: string | null;
  }) {
    const current = await prisma.ragIndexJob.findUnique({
      where: { id: jobId },
      select: { status: true, payloadJson: true },
    });
    if (!current) {
      throw new Error("RAG job not found.");
    }
    if (current.status === "cancelled" && payload.status !== "cancelled") {
      return prisma.ragIndexJob.findUnique({
        where: { id: jobId },
      }) as Promise<RagIndexJob>;
    }

    const job = await prisma.ragIndexJob.update({
      where: { id: jobId },
      data: {
        status: payload.status,
        attempts: payload.attempts,
        runAfter: payload.runAfter,
        lastError: payload.lastError,
      },
    });
    if (payload.status === "queued") {
      await this.updateJobProgress(job.id, {
        stage: "queued",
        label: payload.lastError ? "等待重试" : "等待执行",
        detail: payload.lastError ? `任务已重新排队：${payload.lastError}` : "索引任务已进入队列。",
        percent: 0,
      });
    } else if (payload.status === "running") {
      await this.updateJobProgress(job.id, {
        stage: "loading_source",
        label: "开始处理",
        detail: "索引 worker 已开始处理任务。",
        percent: 0.02,
      });
    } else if (payload.status === "succeeded") {
      await this.updateJobProgress(job.id, {
        stage: "completed",
        label: "索引完成",
        detail: "索引任务已完成。",
        percent: 1,
      });
    } else if (payload.status === "cancelled") {
      const progress = this.parseJobPayload(current.payloadJson).progress;
      await this.updateJobProgress(job.id, {
        stage: "cancelled",
        label: "任务已取消",
        detail: payload.lastError ?? "索引任务已取消。",
        current: progress?.current,
        total: progress?.total,
        documents: progress?.documents,
        chunks: progress?.chunks,
        percent: progress?.percent ?? 0,
      });
    } else if (payload.status === "failed") {
      await this.updateJobProgress(job.id, {
        stage: "failed",
        label: "索引失败",
        detail: payload.lastError ?? "索引任务失败。",
        percent: 1,
      });
    }
    await this.syncKnowledgeDocumentIndexStatus(
      job.ownerType as RagOwnerType,
      job.ownerId,
      payload.status,
      job.jobType as RagJobType,
    );
    return job;
  }

  async listJobs(limit = 100, status?: RagJobStatus) {
    return prisma.ragIndexJob.findMany({
      where: status ? { status } : {},
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: Math.min(Math.max(limit, 1), 500),
    });
  }

  async listJobSummaries(limit = 100, status?: RagJobStatus): Promise<RagJobSummaryRecord[]> {
    const jobs = await this.listJobs(limit, status);
    return jobs.map((job) => this.serializeJob(job));
  }

  async processJob(job: RagIndexJob): Promise<{ chunks: number }> {
    await getRagEmbeddingSettings();
    await this.assertJobNotCancelled(job.id);
    const tenantId = job.tenantId || ragConfig.defaultTenantId;
    const ownerType = job.ownerType as RagOwnerType;
    const jobType = job.jobType as RagJobType;
    if (jobType === "delete") {
      await this.updateJobProgress(job.id, {
        stage: "deleting_existing",
        label: "清理旧索引",
        detail: "正在删除现有知识库索引。",
        percent: 0.4,
      });
      const result = await this.deleteOwnerChunks(ownerType, job.ownerId, tenantId, job.id);
      await this.updateJobProgress(job.id, {
        stage: "completed",
        label: "索引完成",
        detail: result.deleted > 0 ? `已删除 ${result.deleted} 条旧分块。` : "没有需要删除的旧分块。",
        current: result.deleted,
        total: result.deleted,
        chunks: result.deleted,
        percent: 1,
      });
      return { chunks: 0 };
    }
    return this.upsertOwnerChunks(ownerType, job.ownerId, tenantId, job.id);
  }

  private async syncKnowledgeDocumentIndexStatus(
    ownerType: RagOwnerType,
    ownerId: string,
    status: RagJobStatus,
    jobType: RagJobType,
  ): Promise<void> {
    if (ownerType !== "knowledge_document") {
      return;
    }

    const nextStatus = jobType === "delete" && (status === "succeeded" || status === "cancelled")
      ? "idle"
      : status === "queued"
        ? "queued"
        : status === "running"
          ? "running"
          : status === "succeeded"
            ? "succeeded"
            : status === "cancelled"
              ? "idle"
              : "failed";

    await prisma.knowledgeDocument.updateMany({
      where: { id: ownerId },
      data: {
        latestIndexStatus: nextStatus,
        ...(status === "succeeded" && jobType !== "delete" ? { lastIndexedAt: new Date() } : {}),
      },
    });
  }
}
