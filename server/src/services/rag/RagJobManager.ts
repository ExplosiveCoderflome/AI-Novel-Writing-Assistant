import type { RagIndexJob } from "@prisma/client";
import { prisma } from "../../db/prisma";
import type { RagJobStatus, RagJobType, RagOwnerType } from "./types";
import type { RagChunkAnchor, RagPreChunk } from "./chunkFacets";
import { normalizeRagFacets } from "./chunkFacets";
import { normalizeRagText } from "./utils";

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

export interface RagJobPayloadRecord extends Record<string, unknown> {
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

export class RagJobCancelledError extends Error {
  constructor() {
    super("RAG job cancelled.");
    this.name = "RagJobCancelledError";
  }
}

export class RagJobManager {
  parseJobPayload(payloadJson: string | null): RagJobPayloadRecord {
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

  createProgressSnapshot(input: Omit<RagJobProgressSnapshot, "updatedAt">): RagJobProgressSnapshot {
    return {
      ...input,
      percent: Math.min(1, Math.max(0, Number.isFinite(input.percent) ? input.percent : 0)),
      updatedAt: new Date().toISOString(),
    };
  }

  async assertJobNotCancelled(jobId: string): Promise<void> {
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

  async updateJobProgress(jobId: string, progress: Omit<RagJobProgressSnapshot, "updatedAt">): Promise<void> {
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

  serializeJob(job: RagIndexJob): RagJobSummaryRecord {
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

  normalizePreChunks(raw: unknown): RagPreChunk[] {
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
}

export const ragJobManager = new RagJobManager();
