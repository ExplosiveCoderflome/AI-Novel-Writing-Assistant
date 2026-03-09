import type { RagIndexJob } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ragConfig } from "../../config/rag";
import { EmbeddingService } from "./EmbeddingService";
import { VectorStoreService } from "./VectorStoreService";
import type { RagChunkCandidate, RagJobStatus, RagJobType, RagOwnerType, RagSourceDocument } from "./types";
import { buildChunkId, computeChunkHash, estimateTokenCount, normalizeRagText, splitRagChunks } from "./utils";

type ReindexScope = "novel" | "world" | "all";

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

export class RagIndexService {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStoreService: VectorStoreService,
  ) {}

  private async embedTextsInBatches(texts: string[]): Promise<{ vectors: number[][]; provider: string; model: string }> {
    const vectors: number[][] = [];
    let provider = ragConfig.embeddingProvider;
    let model = ragConfig.embeddingModel;

    for (let cursor = 0; cursor < texts.length; cursor += ragConfig.embeddingBatchSize) {
      const batch = texts.slice(cursor, cursor + ragConfig.embeddingBatchSize);
      const result = await this.embeddingService.embedTexts(batch);
      provider = result.provider;
      model = result.model;
      vectors.push(...result.vectors);
    }
    return { vectors, provider, model };
  }

  private async loadSourceDocuments(ownerType: RagOwnerType, ownerId: string, tenantId: string): Promise<RagSourceDocument[]> {
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
            metadata: {
              fileName: document.fileName,
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

  private buildChunkCandidates(documents: RagSourceDocument[], embedProvider: string, embedModel: string): RagChunkCandidate[] {
    const candidates: RagChunkCandidate[] = [];
    for (const document of documents) {
      const pieces = splitRagChunks(document.content, ragConfig.chunkSize, ragConfig.chunkOverlap);
      for (let index = 0; index < pieces.length; index += 1) {
        const chunkText = pieces[index];
        const chunkHash = computeChunkHash(
          `${document.tenantId}|${document.ownerType}|${document.ownerId}|${index}|${chunkText}`,
        );
        candidates.push({
          id: buildChunkId(),
          ownerType: document.ownerType,
          ownerId: document.ownerId,
          tenantId: document.tenantId,
          title: document.title,
          chunkText,
          chunkHash,
          chunkOrder: index,
          tokenEstimate: estimateTokenCount(chunkText),
          language: isCjk(chunkText) ? "zh" : "en",
          metadataJson: document.metadata ? JSON.stringify(document.metadata) : undefined,
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

  private async deleteOwnerChunks(ownerType: RagOwnerType, ownerId: string, tenantId: string): Promise<void> {
    const existing = await prisma.knowledgeChunk.findMany({
      where: { tenantId, ownerType, ownerId },
      select: { id: true },
    });
    if (existing.length === 0) {
      return;
    }
    const ids = existing.map((item) => item.id);
    await this.vectorStoreService.deletePoints(ids);
    await prisma.knowledgeChunk.deleteMany({
      where: { tenantId, ownerType, ownerId },
    });
  }

  private async upsertOwnerChunks(ownerType: RagOwnerType, ownerId: string, tenantId: string): Promise<{ chunks: number }> {
    const docs = await this.loadSourceDocuments(ownerType, ownerId, tenantId);
    if (docs.length === 0) {
      await this.deleteOwnerChunks(ownerType, ownerId, tenantId);
      return { chunks: 0 };
    }

    const docTexts = docs.map((item) => item.content);
    const splitTexts = docTexts.flatMap((text) => splitRagChunks(text, ragConfig.chunkSize, ragConfig.chunkOverlap));
    const embedding = await this.embedTextsInBatches(splitTexts);
    const candidates = this.buildChunkCandidates(docs, embedding.provider, embedding.model);
    if (candidates.length === 0) {
      await this.deleteOwnerChunks(ownerType, ownerId, tenantId);
      return { chunks: 0 };
    }
    if (embedding.vectors.length !== candidates.length) {
      throw new Error("RAG embedding 数量与 chunk 数量不一致。");
    }

    const vectorSize = embedding.vectors[0]?.length ?? 0;
    await this.vectorStoreService.ensureCollection(vectorSize);

    const existing = await prisma.knowledgeChunk.findMany({
      where: { tenantId, ownerType, ownerId },
      select: { id: true },
    });
    if (existing.length > 0) {
      await this.vectorStoreService.deletePoints(existing.map((item) => item.id));
    }

    await this.vectorStoreService.upsertPoints(
      candidates.map((item, index) => ({
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
        },
      })),
    );

    try {
      await prisma.$transaction(async (tx) => {
        await tx.knowledgeChunk.deleteMany({
          where: { tenantId, ownerType, ownerId },
        });
        await tx.knowledgeChunk.createMany({
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
            embedProvider: item.embedProvider,
            embedModel: item.embedModel,
            embedVersion: item.embedVersion,
            indexedAt: new Date(),
          })),
        });
      });
    } catch (error) {
      await this.vectorStoreService.deletePoints(candidates.map((item) => item.id));
      throw error;
    }

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
        payloadJson: options?.payload ? JSON.stringify(options.payload) : null,
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
    const job = await prisma.ragIndexJob.update({
      where: { id: jobId },
      data: {
        status: payload.status,
        attempts: payload.attempts,
        runAfter: payload.runAfter,
        lastError: payload.lastError,
      },
    });
    await this.syncKnowledgeDocumentIndexStatus(job.ownerType as RagOwnerType, job.ownerId, payload.status);
    return job;
  }

  async listJobs(limit = 100, status?: RagJobStatus) {
    return prisma.ragIndexJob.findMany({
      where: status ? { status } : {},
      orderBy: [{ runAfter: "asc" }, { createdAt: "desc" }],
      take: Math.min(Math.max(limit, 1), 500),
    });
  }

  async processJob(job: RagIndexJob): Promise<{ chunks: number }> {
    const tenantId = job.tenantId || ragConfig.defaultTenantId;
    const ownerType = job.ownerType as RagOwnerType;
    const jobType = job.jobType as RagJobType;
    if (jobType === "delete") {
      await this.deleteOwnerChunks(ownerType, job.ownerId, tenantId);
      return { chunks: 0 };
    }
    return this.upsertOwnerChunks(ownerType, job.ownerId, tenantId);
  }

  private async syncKnowledgeDocumentIndexStatus(
    ownerType: RagOwnerType,
    ownerId: string,
    status: RagJobStatus,
  ): Promise<void> {
    if (ownerType !== "knowledge_document") {
      return;
    }

    const nextStatus = status === "queued"
      ? "queued"
      : status === "running"
        ? "running"
        : status === "succeeded"
          ? "succeeded"
          : "failed";

    await prisma.knowledgeDocument.updateMany({
      where: { id: ownerId },
      data: {
        latestIndexStatus: nextStatus,
        ...(status === "succeeded" ? { lastIndexedAt: new Date() } : {}),
      },
    });
  }
}
