import { prisma } from "../../../../db/prisma";
import { chapterArtifactDeltaOutputSchema } from "../../../../prompting/prompts/novel/chapterArtifactDelta.prompts";
import type { ArtifactSyncMode } from "../../novelCoreShared";
import {
  buildContentHash,
  CHAPTER_ARTIFACT_CONSUMERS,
  ChapterArtifactDeltaService,
  type ChapterArtifactConsumerResult,
  type ChapterArtifactDeltaSyncInput,
  type ChapterArtifactDeltaSyncResult,
  type ChapterArtifactExtractionResult,
} from "../ChapterArtifactDeltaService";
import {
  ChapterArtifactCheckpointStore,
  type ChapterArtifactCheckpointIdentity,
} from "./ChapterArtifactCheckpointStore";
import { ChapterArtifactContentVersionError } from "./ChapterArtifactSyncResult";

const EXTRACTION_SCHEMA_VERSION = 1;
const EXTRACTION_ARTIFACT_TYPE = "artifact_delta_extraction:v1";
const APPLY_ARTIFACT_PREFIX = "artifact_delta_apply:v1:";

interface RecoveryServiceDeps {
  deltaService: Pick<
    ChapterArtifactDeltaService,
    "extractChapterArtifacts" | "applyChapterArtifactConsumer" | "toSyncResult"
  >;
  checkpoints: Pick<ChapterArtifactCheckpointStore, "read" | "claim" | "succeed" | "fail">;
  readCurrentContent: (novelId: string, chapterId: string) => Promise<string | null>;
}

export class ChapterArtifactRecoveryPendingError extends Error {
  constructor(readonly artifactType: string) {
    super(`章节资产步骤仍在运行：${artifactType}`);
    this.name = "ChapterArtifactRecoveryPendingError";
  }
}

export class ChapterArtifactRecoveryService {
  private readonly deps: RecoveryServiceDeps;
  private readonly extractionInFlight = new Map<string, Promise<ChapterArtifactExtractionResult>>();

  constructor(deps: Partial<RecoveryServiceDeps> = {}) {
    this.deps = {
      deltaService: deps.deltaService ?? new ChapterArtifactDeltaService(),
      checkpoints: deps.checkpoints ?? new ChapterArtifactCheckpointStore(),
      readCurrentContent: deps.readCurrentContent ?? (async (novelId, chapterId) => {
        const chapter = await prisma.chapter.findFirst({
          where: { id: chapterId, novelId },
          select: { content: true },
        });
        return chapter?.content ?? null;
      }),
    };
  }

  async syncChapterArtifacts(
    input: ChapterArtifactDeltaSyncInput & { artifactSyncMode: ArtifactSyncMode },
  ): Promise<ChapterArtifactDeltaSyncResult> {
    const contentHash = buildContentHash(input.content);
    await this.assertCurrentContent(input.novelId, input.chapterId, contentHash);
    const extraction = await this.loadOrExtract(input, contentHash);
    const aggregate: ChapterArtifactConsumerResult = {};

    for (const consumer of CHAPTER_ARTIFACT_CONSUMERS) {
      const identity = this.identity(input, contentHash, `${APPLY_ARTIFACT_PREFIX}${consumer}`);
      const existing = await this.deps.checkpoints.read(identity);
      if (existing?.status === "succeeded") {
        Object.assign(aggregate, this.readConsumerResult(existing.metadataJson));
        continue;
      }
      const claim = await this.deps.checkpoints.claim(identity, {
        schemaVersion: EXTRACTION_SCHEMA_VERSION,
        consumer,
      });
      if (claim === "already_done") {
        const completed = await this.deps.checkpoints.read(identity);
        Object.assign(aggregate, this.readConsumerResult(completed?.metadataJson ?? null));
        continue;
      }
      if (claim === "running") {
        throw new ChapterArtifactRecoveryPendingError(identity.artifactType);
      }
      try {
        await this.assertCurrentContent(input.novelId, input.chapterId, contentHash);
        const result = await this.deps.deltaService.applyChapterArtifactConsumer({
          ...input,
          contentHash,
          output: extraction.output,
          consumer,
          stateSnapshotId: aggregate.stateSnapshotId ?? null,
        });
        await this.assertCurrentContent(input.novelId, input.chapterId, contentHash);
        await this.deps.checkpoints.succeed(identity, {
          schemaVersion: EXTRACTION_SCHEMA_VERSION,
          consumer,
          result,
        });
        Object.assign(aggregate, result);
      } catch (error) {
        await this.deps.checkpoints.fail(identity, error);
        throw error;
      }
    }

    return this.deps.deltaService.toSyncResult(extraction, aggregate);
  }

  private async loadOrExtract(
    input: ChapterArtifactDeltaSyncInput & { artifactSyncMode: ArtifactSyncMode },
    contentHash: string,
  ): Promise<ChapterArtifactExtractionResult> {
    const inFlightKey = `${input.novelId}:${input.chapterId}:${contentHash}:${input.artifactSyncMode}`;
    const running = this.extractionInFlight.get(inFlightKey);
    if (running) return running;
    const promise = this.loadOrExtractOnce(input, contentHash);
    this.extractionInFlight.set(inFlightKey, promise);
    try {
      return await promise;
    } finally {
      this.extractionInFlight.delete(inFlightKey);
    }
  }

  private async loadOrExtractOnce(
    input: ChapterArtifactDeltaSyncInput & { artifactSyncMode: ArtifactSyncMode },
    contentHash: string,
  ): Promise<ChapterArtifactExtractionResult> {
    const identity = this.identity(input, contentHash, EXTRACTION_ARTIFACT_TYPE);
    const existing = await this.deps.checkpoints.read(identity);
    if (existing?.status === "succeeded") {
      return this.readExtraction(existing.metadataJson, contentHash);
    }
    const claim = await this.deps.checkpoints.claim(identity, {
      schemaVersion: EXTRACTION_SCHEMA_VERSION,
      contentProvenance: input.contentProvenance ?? "confirmed",
    });
    if (claim === "already_done") {
      const completed = await this.deps.checkpoints.read(identity);
      return this.readExtraction(completed?.metadataJson ?? null, contentHash);
    }
    if (claim === "running") {
      throw new ChapterArtifactRecoveryPendingError(identity.artifactType);
    }
    try {
      const extraction = await this.deps.deltaService.extractChapterArtifacts(input);
      if (extraction.contentHash !== contentHash) {
        throw new Error("资产抽取结果与当前正文版本不匹配。");
      }
      await this.assertCurrentContent(input.novelId, input.chapterId, contentHash);
      await this.deps.checkpoints.succeed(identity, {
        schemaVersion: EXTRACTION_SCHEMA_VERSION,
        output: extraction.output,
      });
      return extraction;
    } catch (error) {
      await this.deps.checkpoints.fail(identity, error);
      throw error;
    }
  }

  private readExtraction(metadataJson: string | null, contentHash: string): ChapterArtifactExtractionResult {
    const metadata = this.parseMetadata(metadataJson);
    if (metadata.schemaVersion !== EXTRACTION_SCHEMA_VERSION) {
      throw new Error("章节资产抽取检查点版本不受支持。");
    }
    return {
      contentHash,
      output: chapterArtifactDeltaOutputSchema.parse(metadata.output),
    };
  }

  private readConsumerResult(metadataJson: string | null): ChapterArtifactConsumerResult {
    const metadata = this.parseMetadata(metadataJson);
    if (metadata.schemaVersion !== EXTRACTION_SCHEMA_VERSION || !metadata.result || typeof metadata.result !== "object") {
      throw new Error("章节资产消费者检查点缺少可恢复结果。");
    }
    return metadata.result as ChapterArtifactConsumerResult;
  }

  private parseMetadata(metadataJson: string | null): Record<string, unknown> {
    if (!metadataJson) {
      throw new Error("章节资产检查点缺少恢复数据。");
    }
    const parsed: unknown = JSON.parse(metadataJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("章节资产检查点恢复数据格式无效。");
    }
    return parsed as Record<string, unknown>;
  }

  private identity(
    input: ChapterArtifactDeltaSyncInput & { artifactSyncMode: ArtifactSyncMode },
    contentHash: string,
    artifactType: string,
  ): ChapterArtifactCheckpointIdentity {
    return {
      novelId: input.novelId,
      chapterId: input.chapterId,
      contentHash,
      artifactType,
      syncMode: input.artifactSyncMode,
    };
  }

  private async assertCurrentContent(novelId: string, chapterId: string, contentHash: string): Promise<void> {
    const content = await this.deps.readCurrentContent(novelId, chapterId);
    if (content === null || buildContentHash(content) !== contentHash) {
      throw new ChapterArtifactContentVersionError("章节正文版本已变化，已拒绝过期资产恢复。");
    }
  }
}
