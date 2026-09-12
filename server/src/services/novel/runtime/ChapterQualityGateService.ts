import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import { prisma } from "../../../db/prisma";
import {
  ChapterAcceptanceAssessmentService,
  type ChapterAcceptanceAssessmentInput,
  type ChapterAcceptanceAssessmentResult,
} from "./ChapterAcceptanceAssessmentService";
import type { ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";
import { hashContent, rememberCacheValue } from "./chapterRuntimePackageBuilders";

type AssessmentService = Pick<ChapterAcceptanceAssessmentService, "assess">
  & Partial<Pick<ChapterAcceptanceAssessmentService, "getCacheIdentity" | "persistAssessmentResult">>;

export interface ChapterQualityGateServiceDeps {
  acceptanceAssessmentService?: AssessmentService;
}

export interface RunChapterQualityGatesInput {
  novelId: string;
  chapterId: string;
  contextPackage: GenerationContextPackage;
  content: string;
  request: ChapterRuntimeRequestInput;
  persistAssessment?: boolean;
}

interface CacheIdentity {
  contentHash: string;
  requestKey: string;
}

interface PersistedAcceptance {
  schemaVersion: 2;
  gate: "acceptance";
  contentHash: string;
  requestKey: string;
  result: ChapterAcceptanceAssessmentResult;
}

export class ChapterQualityGateService {
  private readonly service: AssessmentService;
  private readonly cache = new Map<string, ChapterAcceptanceAssessmentResult>();
  private readonly inFlight = new Map<string, Promise<ChapterAcceptanceAssessmentResult>>();

  constructor(deps: ChapterQualityGateServiceDeps) {
    this.service = deps.acceptanceAssessmentService ?? new ChapterAcceptanceAssessmentService();
  }

  async runAcceptanceGate(input: RunChapterQualityGatesInput): Promise<ChapterAcceptanceAssessmentResult> {
    const startedAt = Date.now();
    const assessmentInput: ChapterAcceptanceAssessmentInput = {
      novelId: input.novelId, chapterId: input.chapterId,
      novelTitle: input.contextPackage.bookContract?.title ?? input.contextPackage.chapter.title,
      chapterTitle: input.contextPackage.chapter.title, chapterOrder: input.contextPackage.chapter.order,
      targetWordCount: input.contextPackage.chapter.targetWordCount ?? null,
      content: input.content, contextPackage: input.contextPackage,
      provider: input.request.provider, model: input.request.model, temperature: input.request.temperature,
      persist: input.persistAssessment !== false,
    };
    const contentHash = hashContent(input.content);
    try {
      const requestKey = await this.resolveIdentity(assessmentInput);
      const result = requestKey
        ? await this.loadAssessment(assessmentInput, { contentHash, requestKey })
        : await this.service.assess(assessmentInput);
      console.info("[chapter-runtime-trace]", {
        novelId: input.novelId, chapterId: input.chapterId, chapterOrder: assessmentInput.chapterOrder,
        stage: "acceptance", blocking: true, attemptNo: 1, retryReason: null,
        contentHash, durationMs: Date.now() - startedAt,
        promptAssetKey: "novel.chapter.acceptance_assessment", status: "succeeded",
      });
      return result;
    } catch (error) {
      console.warn("[chapter-runtime-trace]", {
        novelId: input.novelId, chapterId: input.chapterId, chapterOrder: assessmentInput.chapterOrder,
        stage: "acceptance", blocking: true, attemptNo: 1, retryReason: null,
        promptAssetKey: "novel.chapter.acceptance_assessment", contentHash,
        durationMs: Date.now() - startedAt, status: "failed",
      });
      throw error;
    }
  }

  async persistAcceptanceResult(
    input: RunChapterQualityGatesInput,
    result: ChapterAcceptanceAssessmentResult,
  ): Promise<ChapterAcceptanceAssessmentResult> {
    if (!this.service.persistAssessmentResult) return result;
    const assessmentInput: ChapterAcceptanceAssessmentInput = {
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
      persist: true,
    };
    return this.service.persistAssessmentResult(assessmentInput, result);
  }

  private async resolveIdentity(input: ChapterAcceptanceAssessmentInput): Promise<string | null> {
    if (!this.service.getCacheIdentity) return null;
    try {
      return await this.service.getCacheIdentity(input);
    } catch {
      // Failure to verify configuration must never authorize an old cached result.
      console.warn("[chapter-runtime] acceptance cache identity unavailable", { chapterId: input.chapterId });
      return null;
    }
  }

  private cacheWhere(input: ChapterAcceptanceAssessmentInput, identity: CacheIdentity) {
    return { novelId_chapterId_contentHash_artifactType_syncMode: {
      novelId: input.novelId, chapterId: input.chapterId, contentHash: identity.contentHash,
      artifactType: "quality_gate_acceptance", syncMode: `request_v2_${identity.requestKey}`,
    } };
  }

  private isCacheable(result: ChapterAcceptanceAssessmentResult): boolean {
    return Boolean(result?.assessment?.riskTags && result.assessment.blockingIssues)
      && !result.assessment.riskTags.includes("acceptance_gate_unavailable")
      && !result.assessment.blockingIssues.some((issue) => issue.code === "acceptance_gate_unavailable");
  }

  private async loadAssessment(input: ChapterAcceptanceAssessmentInput, identity: CacheIdentity) {
    const key = JSON.stringify([input.novelId, input.chapterId, identity.contentHash, identity.requestKey]);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const running = this.inFlight.get(key);
    if (running) return running;
    // Claim before the first persisted-cache await to coalesce concurrent misses.
    const promise = this.readOrAssess(input, identity, key);
    this.inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async readOrAssess(input: ChapterAcceptanceAssessmentInput, identity: CacheIdentity, key: string) {
    const where = this.cacheWhere(input, identity);
    try {
      const row = await prisma.chapterArtifactSyncCheckpoint.findUnique({ where, select: { status: true, metadataJson: true } });
      const exact = row?.status === "succeeded" && row.metadataJson ? JSON.parse(row.metadataJson) as PersistedAcceptance : null;
      if (exact?.schemaVersion === 2 && exact.gate === "acceptance"
        && exact.contentHash === identity.contentHash && exact.requestKey === identity.requestKey
        && this.isCacheable(exact.result)) {
        rememberCacheValue(this.cache, key, exact.result);
        return exact.result;
      }

      // requestKey can change after a task resume while the chapter content is unchanged.
      // Reuse the latest cache for the same content hash instead of paying for a duplicate gate.
      const fallback = await prisma.chapterArtifactSyncCheckpoint.findFirst({
        where: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentHash: identity.contentHash,
          artifactType: "quality_gate_acceptance",
          status: "succeeded",
        },
        orderBy: { updatedAt: "desc" },
        select: { metadataJson: true },
      });
      if (fallback?.metadataJson) {
        const payload = JSON.parse(fallback.metadataJson) as PersistedAcceptance;
        if (payload.schemaVersion === 2 && payload.gate === "acceptance"
          && payload.contentHash === identity.contentHash && this.isCacheable(payload.result)) {
          rememberCacheValue(this.cache, key, payload.result);
          return payload.result;
        }
      }
    } catch {
      console.warn("[chapter-runtime] acceptance cache read skipped", { chapterId: input.chapterId });
    }
    const result = await this.service.assess(input);
    if (!this.isCacheable(result)) return result;
    // Do not publish a result under an old identity if configuration changed during assessment.
    if (await this.resolveIdentity(input) !== identity.requestKey) return result;
    const payload: PersistedAcceptance = { schemaVersion: 2, gate: "acceptance", ...identity, result };
    try {
      await prisma.chapterArtifactSyncCheckpoint.upsert({
        where,
        create: {
          ...where.novelId_chapterId_contentHash_artifactType_syncMode,
          status: "succeeded", sourceType: "chapter_quality_gate", sourceStage: "acceptance",
          metadataJson: JSON.stringify(payload),
        },
        update: { status: "succeeded", metadataJson: JSON.stringify(payload) },
      });
    } catch {
      console.warn("[chapter-runtime] acceptance cache write skipped", { chapterId: input.chapterId });
    }
    rememberCacheValue(this.cache, key, result);
    return result;
  }
}
