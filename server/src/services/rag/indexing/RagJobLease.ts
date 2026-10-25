import type { Prisma, RagIndexJob } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { ragConfig } from "../../../config/rag";
import { createHash } from "node:crypto";
import type { RagJobStatus } from "../types";

const LEASE_MS = 90_000;
export const RAG_LEASE_HEARTBEAT_MS = 15_000;
type Database = Prisma.TransactionClient | typeof prisma;

export class RagLeaseLostError extends Error {
  constructor() { super("RAG task was cancelled, superseded or its lease expired."); this.name = "RagLeaseLostError"; }
}

export function parseIndexPayload(raw: string | null): Record<string, any> {
  if (!raw) return {};
  try { const value = JSON.parse(raw); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  catch { return {}; }
}

export class RagJobLease {
  readonly target = { url: ragConfig.qdrantUrl, collection: ragConfig.qdrantCollection, apiKey: ragConfig.qdrantApiKey };
  readonly targetHash = createHash("sha256").update(JSON.stringify([this.target.url, this.target.collection])).digest("hex");
  constructor(readonly job: RagIndexJob) {}

  private where() {
    return { id: this.job.id, status: "running" as const, attempts: this.job.attempts, runAfter: { gt: new Date() } };
  }

  async assertActive(db: Database = prisma): Promise<void> {
    const current = await db.ragIndexJob.findFirst({ where: this.where(), select: { id: true } });
    if (!current || ragConfig.qdrantUrl !== this.target.url || ragConfig.qdrantCollection !== this.target.collection) {
      throw new RagLeaseLostError();
    }
  }

  async lock(db: Database): Promise<void> {
    if (ragConfig.qdrantUrl !== this.target.url || ragConfig.qdrantCollection !== this.target.collection) throw new RagLeaseLostError();
    const result = await db.ragIndexJob.updateMany({ where: this.where(), data: { updatedAt: new Date() } });
    if (result.count !== 1) throw new RagLeaseLostError();
  }

  async assertVersion(versionId?: string): Promise<void> {
    await this.assertActive();
    if (versionId && !await prisma.knowledgeDocument.count({ where: { id: this.job.ownerId,
      activeVersionId: versionId, status: { not: "archived" } } })) throw new RagLeaseLostError();
  }

  async renew(): Promise<boolean> {
    const result = await prisma.ragIndexJob.updateMany({ where: this.where(), data: { runAfter: new Date(Date.now() + LEASE_MS) } });
    return result.count === 1;
  }

  async progress(progress: Record<string, unknown>): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await this.assertActive();
      const row = await prisma.ragIndexJob.findUniqueOrThrow({ where: { id: this.job.id }, select: { payloadJson: true } });
      const payload = parseIndexPayload(row.payloadJson);
      payload.progress = { ...progress, updatedAt: new Date().toISOString() };
      const result = await prisma.ragIndexJob.updateMany({
        where: { ...this.where(), payloadJson: row.payloadJson }, data: { payloadJson: JSON.stringify(payload) },
      });
      if (result.count === 1) return;
    }
    throw new RagLeaseLostError();
  }

  async finish(change: { status: RagJobStatus; attempts?: number; runAfter?: Date; lastError?: string | null }): Promise<RagIndexJob> {
    return prisma.$transaction(async (tx) => {
      await this.lock(tx);
      const row = await tx.ragIndexJob.findUniqueOrThrow({ where: { id: this.job.id } });
      const payload = parseIndexPayload(row.payloadJson);
      const published = payload.replacement?.state === "committed";
      const progress = payload.progress ?? {};
      payload.progress = { ...progress, stage: change.status === "succeeded" ? "completed" : change.status,
        label: change.status === "succeeded" ? "索引完成" : change.status === "queued" ? "等待重试" : "索引失败",
        detail: change.lastError ?? progress.detail, percent: change.status === "succeeded" ? 1 : progress.percent ?? 0,
        updatedAt: new Date().toISOString() };
      const result = await tx.ragIndexJob.update({ where: { id: row.id }, data: { ...change, payloadJson: JSON.stringify(payload) } });
      if (row.ownerType === "knowledge_document") {
        const sourceVersion = payload.replacement?.versionId ?? payload.sourceVersionId;
        await tx.knowledgeDocument.updateMany({ where: { id: row.ownerId, status: { not: "archived" },
          ...(typeof sourceVersion === "string" ? { activeVersionId: sourceVersion } : {}) }, data: {
          latestIndexStatus: published ? "succeeded" : change.status === "cancelled" ? "idle" : change.status,
          ...(change.status === "succeeded" && row.jobType !== "delete" ? { lastIndexedAt: new Date() } : {}),
        } });
      }
      return result;
    });
  }

  static async claim(job: RagIndexJob): Promise<RagIndexJob | null> {
    return prisma.$transaction(async (tx) => {
      if (job.attempts >= job.maxAttempts) return null;
      // Lock order is job -> document in claim, publication, recovery and finish.
      const candidate = await tx.ragIndexJob.updateMany({ where: { id: job.id, status: "queued", attempts: job.attempts,
        runAfter: { lte: new Date() } }, data: { updatedAt: new Date() } });
      if (candidate.count !== 1) return null;
      // The document row serializes competing jobs for the same document on SQLite and PostgreSQL.
      if (job.ownerType === "knowledge_document") {
        const lock = await tx.knowledgeDocument.updateMany({ where: { id: job.ownerId }, data: { latestIndexStatus: "running" } });
        if (lock.count !== 1) {
          await tx.ragIndexJob.updateMany({ where: { id: job.id, status: "queued" }, data: { status: "failed", lastError: "Knowledge document no longer exists." } });
          return null;
        }
        const busy = await tx.ragIndexJob.count({ where: { tenantId: job.tenantId, ownerType: job.ownerType,
          ownerId: job.ownerId, status: "running", runAfter: { gt: new Date() } } });
        if (busy) return null;
      }
      const claimed = await tx.ragIndexJob.updateMany({ where: { id: job.id, status: "queued", attempts: job.attempts,
        runAfter: { lte: new Date() } }, data: { status: "running", attempts: job.attempts + 1, lastError: null,
        runAfter: new Date(Date.now() + LEASE_MS) } });
      return claimed.count === 1 ? tx.ragIndexJob.findUnique({ where: { id: job.id } }) : null;
    });
  }

  static async recover(job: RagIndexJob): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const status = job.attempts >= job.maxAttempts ? "failed" : "queued";
      const recovered = await tx.ragIndexJob.updateMany({ where: { id: job.id, status: "running", attempts: job.attempts,
        runAfter: { lte: new Date() } }, data: { status, runAfter: new Date(),
        lastError: job.lastError ?? "Interrupted RAG lease expired; saved embedding results remain available." } });
      if (recovered.count !== 1) return false;
      const current = await tx.ragIndexJob.findUniqueOrThrow({ where: { id: job.id } });
      if (job.ownerType === "knowledge_document") await tx.knowledgeDocument.updateMany({
        where: { id: job.ownerId, status: { not: "archived" } },
        data: { latestIndexStatus: parseIndexPayload(current.payloadJson).replacement?.state === "committed" ? "succeeded" : status },
      });
      return true;
    });
  }
}
