import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { canonicalProductionJson, ProductionVersionConflictError, type ProductionJson } from "../../common";
import { hashProductionContent, InvalidProductionRequestError } from "../../application";
import type { ArtifactCheckpointPort, ArtifactClaim, ArtifactClaimResult, ArtifactStepIdentity } from "./types";

interface CheckpointMetadata { schemaVersion: 1; token: string; executionToken: string; attempt: number; value?: ProductionJson }
const unique = (identity: ArtifactStepIdentity) => ({ novelId: identity.novelId, chapterId: identity.chapterId,
  contentHash: identity.contentHash, artifactType: `production_kernel@1:${identity.step}`,
  syncMode: hashProductionContent(canonicalProductionJson({ runId: identity.runId, ownerKey: identity.ownerKey,
    unitRequestKey: identity.unitRequestKey, stepKey: identity.stepKey, kind: identity.kind })) });
const metadataFor = (claim: ArtifactClaim) => canonicalProductionJson({ schemaVersion: 1, token: claim.token,
  executionToken: claim.identity.executionToken, attempt: claim.attempt });

/** Reuses the existing checkpoint table, with claim-token fencing and caller-supplied durable ownership. */
export class PrismaProductionCheckpointStore implements ArtifactCheckpointPort {
  constructor(private readonly db: PrismaClient,
    private readonly assertOwnership: (tx: Prisma.TransactionClient, identity: ArtifactStepIdentity) => Promise<void>,
    private readonly sourceStage: "prepare" | "reconcile") {}

  private async guard(tx: Prisma.TransactionClient, identity: ArtifactStepIdentity): Promise<void> {
    await this.assertOwnership(tx, identity);
  }

  async claim(identity: ArtifactStepIdentity, options: { existingOnly?: boolean } = {}): Promise<ArtifactClaimResult> {
    if (!identity.stepKey || !identity.executionToken) throw new InvalidProductionRequestError("Checkpoint requires request and execution identity");
    return this.db.$transaction(async tx => {
      await this.guard(tx, identity);
      const key = unique(identity);
      const where = { novelId_chapterId_contentHash_artifactType_syncMode: key };
      const row = options.existingOnly ? await tx.chapterArtifactSyncCheckpoint.findUnique({ where }) : await tx.chapterArtifactSyncCheckpoint.upsert({
        where: { novelId_chapterId_contentHash_artifactType_syncMode: key },
        create: { ...key, status: "ready", sourceType: "production_kernel", sourceStage: this.sourceStage }, update: {},
      });
      if (options.existingOnly && (!row || row.status === "ready")) return { status: "not_started" };
      if (!row || (options.existingOnly && row.status !== "succeeded")) return { status: "unknown" };
      const metadata: CheckpointMetadata | null = row.metadataJson ? JSON.parse(row.metadataJson) : null;
      if (row.status === "succeeded") {
        if (metadata?.schemaVersion !== 1 || metadata.value === undefined) throw new InvalidProductionRequestError("Invalid checkpoint result payload");
        return { status: "cached", value: metadata.value };
      }
      if (row.status === "running") {
        // Even a replacement worker cannot safely repeat an unknown remote model request.
        if (identity.kind === "model") return { status: "unknown" };
        if (metadata?.executionToken === identity.executionToken) return { status: "busy" };
      }
      if (identity.kind === "consumer" && (metadata?.attempt ?? 0) >= 2) return { status: "exhausted" };
      const claim = { identity, token: randomUUID(), attempt: (metadata?.attempt ?? 0) + 1 };
      const changed = await tx.chapterArtifactSyncCheckpoint.updateMany({
        where: { id: row.id, status: row.status, metadataJson: row.metadataJson },
        data: { status: "running", metadataJson: metadataFor(claim) },
      });
      return changed.count === 1 ? { status: "claimed", claim } : { status: "busy" };
    });
  }

  async succeed(claim: ArtifactClaim, value: ProductionJson): Promise<void> {
    const result = canonicalProductionJson({ schemaVersion: 1, token: claim.token, executionToken: claim.identity.executionToken, attempt: claim.attempt, value });
    await this.db.$transaction(async tx => {
      await this.guard(tx, claim.identity);
      const current = await tx.chapterArtifactSyncCheckpoint.findUnique({ where: { novelId_chapterId_contentHash_artifactType_syncMode: unique(claim.identity) } });
      if (current?.status === "succeeded" && current.metadataJson === result) return;
      const saved = await tx.chapterArtifactSyncCheckpoint.updateMany({
        where: { ...unique(claim.identity), status: "running", metadataJson: metadataFor(claim) },
        data: { status: "succeeded", metadataJson: result },
      });
      if (saved.count !== 1) throw new ProductionVersionConflictError();
    });
  }

  /** Business writes and their result receipt share one guarded transaction; never invokes a model. */
  async applyConsumer(claim: ArtifactClaim, write: (tx: Prisma.TransactionClient) => Promise<ProductionJson>): Promise<ProductionJson> {
    if (claim.identity.kind !== "consumer") throw new InvalidProductionRequestError("Only consumers may write business data");
    return this.db.$transaction(async tx => {
      await this.guard(tx, claim.identity);
      const key = unique(claim.identity);
      const current = await tx.chapterArtifactSyncCheckpoint.findUnique({ where: { novelId_chapterId_contentHash_artifactType_syncMode: key } });
      const metadata: CheckpointMetadata | null = current?.metadataJson ? JSON.parse(current.metadataJson) : null;
      if (current?.status === "succeeded" && metadata?.schemaVersion === 1 && metadata.token === claim.token
        && metadata.executionToken === claim.identity.executionToken && metadata.value !== undefined) return metadata.value;
      const locked = await tx.chapterArtifactSyncCheckpoint.updateMany({ where: { ...key, status: "running", metadataJson: metadataFor(claim) },
        data: { updatedAt: current?.updatedAt } });
      if (locked.count !== 1) throw new ProductionVersionConflictError();
      const value = await write(tx);
      await this.guard(tx, claim.identity);
      const result = canonicalProductionJson({ schemaVersion: 1, token: claim.token, executionToken: claim.identity.executionToken, attempt: claim.attempt, value });
      const saved = await tx.chapterArtifactSyncCheckpoint.updateMany({ where: { ...key, status: "running", metadataJson: metadataFor(claim) },
        data: { status: "succeeded", metadataJson: result } });
      if (saved.count !== 1) throw new ProductionVersionConflictError();
      return value;
    });
  }

  async fail(claim: ArtifactClaim): Promise<void> {
    // Model failures are unknown outcomes and deliberately remain claimed.
    if (claim.identity.kind === "model") return;
    await this.db.$transaction(async tx => {
      await this.guard(tx, claim.identity);
      const saved = await tx.chapterArtifactSyncCheckpoint.updateMany({
        where: { ...unique(claim.identity), status: "running", metadataJson: metadataFor(claim) },
        data: { status: "failed" },
      });
      if (saved.count !== 1) throw new ProductionVersionConflictError();
    });
  }

  async release(claim: ArtifactClaim): Promise<void> {
    await this.db.$transaction(async tx => {
      await this.guard(tx, claim.identity);
      const saved = await tx.chapterArtifactSyncCheckpoint.updateMany({
        where: { ...unique(claim.identity), status: "running", metadataJson: metadataFor(claim) }, data: { status: "ready" },
      });
      if (saved.count !== 1) throw new ProductionVersionConflictError();
    });
  }
}
