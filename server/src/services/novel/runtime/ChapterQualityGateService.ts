import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import { prisma } from "../../../db/prisma";
import {
  ChapterAcceptanceAssessmentService,
  type ChapterAcceptanceAssessmentResult,
} from "./ChapterAcceptanceAssessmentService";
import type { ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";
import {
  hashContent,
  rememberCacheValue,
} from "./chapterRuntimePackageBuilders";

export interface ChapterQualityGateServiceDeps {
  acceptanceAssessmentService?: Pick<ChapterAcceptanceAssessmentService, "assess">;
}

export interface RunChapterQualityGatesInput {
  novelId: string;
  chapterId: string;
  contextPackage: GenerationContextPackage;
  content: string;
  request: ChapterRuntimeRequestInput;
}

type QualityGateCacheKind = "acceptance";

interface PersistedQualityGateCachePayload<T> {
  schemaVersion: 1;
  gate: QualityGateCacheKind;
  contentHash: string;
  requestKey: string;
  result: T;
}

export class ChapterQualityGateService {
  private readonly acceptanceAssessmentService: Pick<ChapterAcceptanceAssessmentService, "assess">;
  private readonly acceptanceGateCache = new Map<string, Promise<ChapterAcceptanceAssessmentResult> | ChapterAcceptanceAssessmentResult>();

  constructor(deps: ChapterQualityGateServiceDeps) {
    this.acceptanceAssessmentService = deps.acceptanceAssessmentService ?? new ChapterAcceptanceAssessmentService();
  }

  private buildGateCacheKey(input: {
    gate: QualityGateCacheKind;
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    content: string;
    request: ChapterRuntimeRequestInput;
  }): string {
    return [
      input.gate,
      input.novelId,
      input.chapterId,
      input.chapterOrder,
      hashContent(input.content),
      input.request.provider ?? "default-provider",
      input.request.model ?? "default-model",
      input.request.temperature ?? "default-temperature",
    ].join(":");
  }

  async runAcceptanceGate(input: RunChapterQualityGatesInput): Promise<ChapterAcceptanceAssessmentResult> {
    const contentHash = hashContent(input.content);
    return this.traceChapterGate({
      novelId: input.novelId,
      chapterId: input.chapterId,
      chapterOrder: input.contextPackage.chapter.order,
      stage: "acceptance",
      blocking: true,
      contentHash,
      promptAssetKey: "novel.chapter.acceptance_assessment",
      run: () => this.loadAcceptanceAssessment(input),
    });
  }

  private buildGateRequestKey(input: {
    gate: QualityGateCacheKind;
    request: ChapterRuntimeRequestInput;
  }): string {
    return hashContent(JSON.stringify({
      gate: input.gate,
      provider: input.request.provider ?? null,
      model: input.request.model ?? null,
      temperature: input.request.temperature ?? null,
    }));
  }

  private buildPersistentGateIdentity(input: {
    gate: QualityGateCacheKind;
    novelId: string;
    chapterId: string;
    content: string;
    request: ChapterRuntimeRequestInput;
  }): {
    artifactType: string;
    contentHash: string;
    requestKey: string;
    syncMode: string;
  } {
    const requestKey = this.buildGateRequestKey({
      gate: input.gate,
      request: input.request,
    });
    return {
      artifactType: `quality_gate_${input.gate}`,
      contentHash: hashContent(input.content),
      requestKey,
      syncMode: `request_${requestKey.slice(0, 24)}`,
    };
  }

  private async readPersistentGateCache<T>(input: {
    gate: QualityGateCacheKind;
    novelId: string;
    chapterId: string;
    content: string;
    request: ChapterRuntimeRequestInput;
  }): Promise<T | null> {
    const identity = this.buildPersistentGateIdentity(input);
    try {
      const row = await prisma.chapterArtifactSyncCheckpoint.findUnique({
        where: {
          novelId_chapterId_contentHash_artifactType_syncMode: {
            novelId: input.novelId,
            chapterId: input.chapterId,
            contentHash: identity.contentHash,
            artifactType: identity.artifactType,
            syncMode: identity.syncMode,
          },
        },
        select: {
          status: true,
          metadataJson: true,
        },
      });
      if (row?.status !== "succeeded" || !row.metadataJson) {
        return null;
      }
      const payload = JSON.parse(row.metadataJson) as PersistedQualityGateCachePayload<T>;
      if (
        payload.schemaVersion !== 1
        || payload.gate !== input.gate
        || payload.contentHash !== identity.contentHash
        || payload.requestKey !== identity.requestKey
      ) {
        return null;
      }
      return payload.result;
    } catch (error) {
      console.warn("[chapter-runtime] quality gate cache read skipped", {
        novelId: input.novelId,
        chapterId: input.chapterId,
        gate: input.gate,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async writePersistentGateCache<T>(input: {
    gate: QualityGateCacheKind;
    novelId: string;
    chapterId: string;
    content: string;
    request: ChapterRuntimeRequestInput;
    result: T;
  }): Promise<void> {
    const identity = this.buildPersistentGateIdentity(input);
    const payload: PersistedQualityGateCachePayload<T> = {
      schemaVersion: 1,
      gate: input.gate,
      contentHash: identity.contentHash,
      requestKey: identity.requestKey,
      result: input.result,
    };
    try {
      await prisma.chapterArtifactSyncCheckpoint.upsert({
        where: {
          novelId_chapterId_contentHash_artifactType_syncMode: {
            novelId: input.novelId,
            chapterId: input.chapterId,
            contentHash: identity.contentHash,
            artifactType: identity.artifactType,
            syncMode: identity.syncMode,
          },
        },
        create: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentHash: identity.contentHash,
          artifactType: identity.artifactType,
          syncMode: identity.syncMode,
          status: "succeeded",
          sourceType: "chapter_quality_gate",
          sourceStage: input.gate,
          metadataJson: JSON.stringify(payload),
        },
        update: {
          status: "succeeded",
          sourceType: "chapter_quality_gate",
          sourceStage: input.gate,
          metadataJson: JSON.stringify(payload),
        },
      });
    } catch (error) {
      console.warn("[chapter-runtime] quality gate cache write skipped", {
        novelId: input.novelId,
        chapterId: input.chapterId,
        gate: input.gate,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private isCacheableAcceptanceResult(result: ChapterAcceptanceAssessmentResult): boolean {
    return !result.assessment.riskTags.includes("acceptance_gate_unavailable")
      && !result.assessment.blockingIssues.some((issue) => issue.code === "acceptance_gate_unavailable");
  }

  private async loadAcceptanceAssessment(input: RunChapterQualityGatesInput): Promise<ChapterAcceptanceAssessmentResult> {
    const key = this.buildGateCacheKey({
      gate: "acceptance",
      novelId: input.novelId,
      chapterId: input.chapterId,
      chapterOrder: input.contextPackage.chapter.order,
      content: input.content,
      request: input.request,
    });
    const cached = this.acceptanceGateCache.get(key);
    if (cached) {
      return cached;
    }
    const persisted = await this.readPersistentGateCache<ChapterAcceptanceAssessmentResult>({
      gate: "acceptance",
      novelId: input.novelId,
      chapterId: input.chapterId,
      content: input.content,
      request: input.request,
    });
    if (persisted) {
      rememberCacheValue(this.acceptanceGateCache, key, persisted);
      return persisted;
    }
    const assessmentPromise = this.acceptanceAssessmentService.assess({
      novelId: input.novelId,
      chapterId: input.chapterId,
      novelTitle: input.contextPackage.bookContract?.title ?? input.contextPackage.chapter.title,
      chapterTitle: input.contextPackage.chapter.title,
      chapterOrder: input.contextPackage.chapter.order,
      targetWordCount: input.contextPackage.chapter.targetWordCount ?? null,
      content: input.content,
      contextPackage: input.contextPackage,
      provider: input.request.provider,
      model: input.request.model,
      temperature: input.request.temperature,
    });
    rememberCacheValue(this.acceptanceGateCache, key, assessmentPromise);
    try {
      const assessment = await assessmentPromise;
      if (this.isCacheableAcceptanceResult(assessment)) {
        await this.writePersistentGateCache({
          gate: "acceptance",
          novelId: input.novelId,
          chapterId: input.chapterId,
          content: input.content,
          request: input.request,
          result: assessment,
        });
      }
      rememberCacheValue(this.acceptanceGateCache, key, assessment);
      return assessment;
    } catch (error) {
      this.acceptanceGateCache.delete(key);
      throw error;
    }
  }

  private async traceChapterGate<T>(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    stage: string;
    blocking: boolean;
    contentHash: string;
    promptAssetKey: string;
    retryReason?: string;
    run: () => Promise<T>;
  }): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await input.run();
      console.info("[chapter-runtime-trace]", {
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterOrder: input.chapterOrder,
        attemptNo: 1,
        stage: input.stage,
        blocking: input.blocking,
        contentHash: input.contentHash,
        durationMs: Date.now() - startedAt,
        promptAssetKey: input.promptAssetKey,
        retryReason: input.retryReason ?? null,
        status: "succeeded",
      });
      return result;
    } catch (error) {
      console.warn("[chapter-runtime-trace]", {
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterOrder: input.chapterOrder,
        attemptNo: 1,
        stage: input.stage,
        blocking: input.blocking,
        contentHash: input.contentHash,
        durationMs: Date.now() - startedAt,
        promptAssetKey: input.promptAssetKey,
        retryReason: input.retryReason ?? null,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
