import { createHash } from "node:crypto";
import { prisma } from "../../../db/prisma";
import { RagJobLease, RagLeaseLostError, parseIndexPayload } from "./RagJobLease";
import type { RagChunkCandidate } from "../types";
import type { VectorStoreService } from "../VectorStoreService";

export interface IndexReplacementManifest {
  generation: string;
  versionId: string;
  targetHash: string;
  state: "staging" | "committed";
  chunks: number;
  oldIds: string[];
  retired?: boolean;
  cleanupPending?: boolean;
  rollbackFailed?: boolean;
  rollbackComplete?: boolean;
}

export function hasPendingIndexReplacement(raw: string | null): boolean {
  const manifest = parseIndexPayload(raw).replacement as IndexReplacementManifest | undefined;
  return Boolean(manifest && (manifest.rollbackFailed || manifest.cleanupPending
    || (manifest.state === "staging" && !manifest.rollbackComplete)));
}

export class RagIndexRollbackError extends Error {
  constructor(original: unknown, rollback: unknown) {
    super(`Index staging rollback failed; automatic retry stopped. Original: ${String(original)}; rollback: ${String(rollback)}`);
    this.name = "RagIndexRollbackError";
  }
}

export function publishedGeneration(metadata: string | null | undefined): string | null {
  const generation = parseIndexPayload(metadata ?? null).indexGeneration;
  return typeof generation === "string" ? generation : null;
}

export class KnowledgeIndexReplacement {
  private readonly vectors: VectorStoreService;
  constructor(private readonly lease: RagJobLease, vectors: VectorStoreService) {
    this.vectors = typeof vectors.forTarget === "function" ? vectors.forTarget(lease.target) : vectors;
  }

  private async save(manifest: IndexReplacementManifest): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await this.lease.lock(tx);
      const job = await tx.ragIndexJob.findUniqueOrThrow({ where: { id: this.lease.job.id } });
      const payload = parseIndexPayload(job.payloadJson);
      payload.replacement = manifest;
      await tx.ragIndexJob.update({ where: { id: job.id }, data: { payloadJson: JSON.stringify(payload) } });
    });
  }

  private async rollbackFailed(manifest: IndexReplacementManifest, original: unknown, rollback: unknown): Promise<never> {
    try { await this.save({ ...manifest, rollbackFailed: true }); }
    catch (persist) { throw new RagIndexRollbackError(original, new AggregateError([rollback, persist], "Rollback failure could not be recorded.")); }
    throw new RagIndexRollbackError(original, rollback);
  }

  private async assertUnreferenced(ids: string[]): Promise<void> {
    if (ids.length && await prisma.knowledgeChunk.count({ where: { id: { in: ids } } })) {
      throw new Error("Index cleanup refused: one or more points are still referenced by committed metadata.");
    }
  }

  private async discard(manifest: IndexReplacementManifest): Promise<void> {
    await this.lease.assertActive();
    if (manifest.chunks === 0 || manifest.rollbackComplete) return;
    if (manifest.targetHash !== this.lease.targetHash) throw new Error("Staging target changed; restore its target before cleanup.");
    const rows = await prisma.knowledgeChunk.findMany({ where: { tenantId: this.lease.job.tenantId,
      ownerType: "knowledge_document", ownerId: this.lease.job.ownerId }, select: { metadataJson: true } });
    if (rows.some((row) => publishedGeneration(row.metadataJson) === manifest.generation)) {
      throw new Error("Staging rollback refused: this generation is already published.");
    }
    await this.lease.assertActive();
    await this.vectors.deleteGeneration(this.lease.job.tenantId, this.lease.job.ownerId, manifest.generation);
  }

  private async cleanup(manifest: IndexReplacementManifest): Promise<{ chunks: number }> {
    await this.lease.assertActive();
    if (manifest.targetHash !== this.lease.targetHash) throw new Error("Committed cleanup target changed; restore its target before cleanup.");
    await this.assertUnreferenced(manifest.oldIds);
    await this.lease.assertActive();
    await this.vectors.deletePoints(manifest.oldIds);
    await this.save({ ...manifest, oldIds: [], cleanupPending: false });
    return { chunks: manifest.chunks };
  }

  async resume(): Promise<{ chunks: number } | null> {
    const job = await prisma.ragIndexJob.findUniqueOrThrow({ where: { id: this.lease.job.id } });
    const manifest = parseIndexPayload(job.payloadJson).replacement as IndexReplacementManifest | undefined;
    if (!manifest) {
      await this.cleanupPreviousAttempts();
      return null;
    }
    if (manifest.rollbackFailed) throw new RagIndexRollbackError("Previous staging failure", "Manual inspection is required.");
    if (manifest.state === "committed") return this.cleanup(manifest);
    try { await this.discard(manifest); await this.save({ ...manifest, rollbackComplete: true }); }
    catch (error) {
      if (error instanceof RagLeaseLostError) throw error;
      return this.rollbackFailed(manifest, "Interrupted staging", error);
    }
    return null;
  }

  private async cleanupPreviousAttempts(): Promise<void> {
    const previous = await prisma.ragIndexJob.findMany({ where: { tenantId: this.lease.job.tenantId,
      ownerType: "knowledge_document", ownerId: this.lease.job.ownerId, id: { not: this.lease.job.id },
      status: { in: ["failed", "cancelled", "succeeded"] }, OR: [
        { payloadJson: { contains: '"cleanupPending":true' } }, { payloadJson: { contains: '"state":"staging"' } },
        { payloadJson: { contains: '"rollbackFailed":true' } },
      ] }, orderBy: { createdAt: "asc" }, take: 100 });
    for (const row of previous) {
      const payload = parseIndexPayload(row.payloadJson);
      const manifest = payload.replacement as IndexReplacementManifest | undefined;
      if (!manifest) continue;
      if (manifest.rollbackFailed) throw new RagIndexRollbackError("Previous staging failure", "Manual inspection is required.");
      await this.lease.assertActive();
      if (manifest.targetHash !== this.lease.targetHash) throw new Error("Previous cleanup belongs to a different vector target; cleanup paused.");
      try {
        if (manifest.state === "staging") await this.discard(manifest);
        else { await this.assertUnreferenced(manifest.oldIds); await this.vectors.deletePoints(manifest.oldIds); }
      } catch (error) {
        if (error instanceof RagLeaseLostError || manifest.state === "committed") throw error;
        payload.replacement = { ...manifest, rollbackFailed: true };
        try {
          await prisma.ragIndexJob.updateMany({ where: { id: row.id, status: row.status, attempts: row.attempts, payloadJson: row.payloadJson },
            data: { payloadJson: JSON.stringify(payload) } });
        } catch (persist) { throw new RagIndexRollbackError("Previous staging", new AggregateError([error, persist])); }
        throw new RagIndexRollbackError("Previous staging", error);
      }
      await this.lease.assertActive();
      payload.replacement = manifest.state === "staging" ? undefined : { ...manifest, cleanupPending: false, oldIds: [] };
      await prisma.ragIndexJob.updateMany({ where: { id: row.id, status: row.status, attempts: row.attempts, payloadJson: row.payloadJson },
        data: { payloadJson: JSON.stringify(payload) } });
    }
  }

  async replace(input: {
    candidates: RagChunkCandidate[]; vectors: number[][]; versionId: string;
    retired?: boolean;
    publish: (manifest: IndexReplacementManifest, candidates: RagChunkCandidate[]) => Promise<void>;
  }): Promise<{ chunks: number }> {
    await this.lease.assertActive();
    const { candidates, vectors, versionId } = input;
    const generation = createHash("sha256").update(JSON.stringify([this.lease.job.id, this.lease.job.attempts, versionId,
      this.lease.targetHash, candidates.map((row) => [row.chunkHash, row.searchText, row.embedProvider, row.embedModel, row.embedVersion])])).digest("hex");
    for (const candidate of candidates) {
      const id = createHash("sha256").update(`${generation}:${candidate.chunkOrder}:${candidate.chunkHash}`).digest("hex");
      candidate.id = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`;
      candidate.metadataJson = JSON.stringify({ ...parseIndexPayload(candidate.metadataJson ?? null), indexGeneration: generation });
    }
    const oldRows = await prisma.knowledgeChunk.findMany({ where: { tenantId: this.lease.job.tenantId,
      ownerType: "knowledge_document", ownerId: this.lease.job.ownerId }, select: { id: true } });
    const manifest: IndexReplacementManifest = { generation, versionId, targetHash: this.lease.targetHash,
      state: "staging", chunks: candidates.length, oldIds: [], retired: input.retired };
    if (candidates.length) await this.vectors.ensureCollection(vectors[0].length);
    await this.lease.assertActive();
    await this.save(manifest);
    try {
      if (candidates.length) {
        await this.vectors.upsertPoints(candidates.map((row, index) => ({ id: row.id, vector: vectors[index], payload: {
          ...row, indexGeneration: generation, ...(row.facets ?? {}),
        } })), () => this.lease.assertActive());
      }
      await this.lease.assertActive();
      const committed = { ...manifest, state: "committed" as const, oldIds: oldRows.map((row) => row.id), cleanupPending: oldRows.length > 0 };
      await input.publish(committed, candidates);
      return await this.cleanup(committed);
    } catch (error) {
      if (error instanceof RagLeaseLostError) throw error;
      // A publication may have committed before its acknowledgement was lost.
      // Never roll that generation back; the next attempt only resumes cleanup.
      const current = await prisma.ragIndexJob.findUnique({ where: { id: this.lease.job.id }, select: { payloadJson: true } });
      if (parseIndexPayload(current?.payloadJson ?? null).replacement?.state === "committed") throw error;
      try { await this.discard(manifest); await this.save({ ...manifest, rollbackComplete: true }); }
      catch (rollback) {
        if (rollback instanceof RagLeaseLostError) throw rollback;
        return this.rollbackFailed(manifest, error, rollback);
      }
      throw error;
    }
  }
}
