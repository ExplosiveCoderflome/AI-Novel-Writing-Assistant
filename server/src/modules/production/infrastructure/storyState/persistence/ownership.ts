import type { Prisma } from "@prisma/client";
import { hashProductionContent, InvalidProductionRequestError } from "../../../application";
import { ProductionVersionConflictError } from "../../../common";
import type { ArtifactStepIdentity, ArtifactConsumerPort, ArtifactClaim } from "../consumerPorts";

export function requireConsumerClaim(step: string, input: Parameters<ArtifactConsumerPort["apply"]>[0]): ArtifactClaim {
  const { context, stepKey, claim } = input; const identity = claim?.identity; const unit = context.run.progress.unit;
  if (!claim || !identity || identity.kind !== "consumer" || identity.step !== step || identity.stepKey !== stepKey
    || identity.runId !== context.run.id || identity.ownerKey !== context.run.ownerKey || identity.novelId !== unit.novelId
    || identity.chapterId !== unit.chapterId || identity.contentHash !== context.contentHash || identity.unitRequestKey !== context.requestKey
    || identity.executionToken !== context.executionToken || hashProductionContent(context.content) !== context.contentHash) throw new InvalidProductionRequestError("Consumer claim identity differs");
  return claim;
}

/** The caller locks its lease/control row here; run and manuscript locks remain held until business/receipt commit. */
export async function assertArtifactOwnership(tx: Prisma.TransactionClient, identity: ArtifactStepIdentity,
  assertCallerOwnership: (tx: Prisma.TransactionClient, identity: ArtifactStepIdentity) => Promise<void>): Promise<void> {
  await assertCallerOwnership(tx, identity);
  const where = { id: identity.runId, ownerKey: identity.ownerKey, novelId: identity.novelId, chapterId: identity.chapterId,
    activeStage: "reconcile", activeRequestKey: identity.unitRequestKey };
  const run = await tx.productionUnitRun.findFirst({ where, select: { progressJson: true, version: true, updatedAt: true } });
  const chapter = await tx.chapter.findFirst({ where: { id: identity.chapterId, novelId: identity.novelId },
    select: { content: true, order: true, updatedAt: true } });
  const progress = run ? JSON.parse(run.progressJson) : null;
  if (!run || !chapter || hashProductionContent(chapter.content ?? "") !== identity.contentHash
    || progress?.committedContentHash !== identity.contentHash || progress?.selectedContentHash !== identity.contentHash
    || progress?.unit?.order !== chapter.order) throw new ProductionVersionConflictError();
  const lockedRun = await tx.productionUnitRun.updateMany({ where: { ...where, version: run.version },
    data: { version: { increment: 0 }, updatedAt: run.updatedAt } });
  const lockedChapter = await tx.chapter.updateMany({ where: { id: identity.chapterId, novelId: identity.novelId,
    content: chapter.content, updatedAt: chapter.updatedAt }, data: { updatedAt: chapter.updatedAt } });
  if (lockedRun.count !== 1 || lockedChapter.count !== 1) throw new ProductionVersionConflictError();
}

/** Exact structured ID/name validation; ambiguity is never resolved by prose matching or fuzzy names. */
export function exactCharacter(characters: readonly { id: string; name: string }[], input: { id?: string | null; name?: string | null }): string | null {
  const id = input.id?.trim(); const name = input.name?.trim();
  const matches = characters.filter(character => id ? character.id === id && (!name || character.name === name) : name && character.name === name);
  if (matches.length > 1) throw new InvalidProductionRequestError("Ambiguous structured character identity");
  return matches[0]?.id ?? null;
}
