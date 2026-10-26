import type { Prisma, PrismaClient } from "@prisma/client";
import { hashProductionContent } from "../../application";
import { ProductionVersionConflictError } from "../../common";
import { PrismaProductionCheckpointStore, type ArtifactStepIdentity } from "../checkpoints";

/** Preparation owns the raw baseline body, before any selected/committed manuscript exists. */
export class PrismaPreparationCheckpointStore extends PrismaProductionCheckpointStore {
  constructor(db: PrismaClient, assertOwnership: (tx: Prisma.TransactionClient, identity: ArtifactStepIdentity) => Promise<void>) {
    super(db, async (tx, identity) => {
      await assertOwnership(tx, identity);
      const where = { id: identity.runId, ownerKey: identity.ownerKey, novelId: identity.novelId, chapterId: identity.chapterId,
        activeStage: "prepare", activeRequestKey: identity.unitRequestKey };
      const run = await tx.productionUnitRun.findFirst({ where, select: { version: true, updatedAt: true, progressJson: true } });
      const chapter = await tx.chapter.findFirst({ where: { id: identity.chapterId, novelId: identity.novelId },
        select: { content: true, order: true, updatedAt: true } });
      const progress = run ? JSON.parse(run.progressJson) : null;
      if (!run || !chapter || progress?.unit?.order !== chapter.order
        || hashProductionContent(chapter.content ?? "") !== identity.contentHash) throw new ProductionVersionConflictError();
      const lockedRun = await tx.productionUnitRun.updateMany({ where: { ...where, version: run.version },
        data: { version: { increment: 0 }, updatedAt: run.updatedAt } });
      const lockedChapter = await tx.chapter.updateMany({ where: { id: identity.chapterId, novelId: identity.novelId,
        content: chapter.content, updatedAt: chapter.updatedAt }, data: { updatedAt: chapter.updatedAt } });
      if (lockedRun.count !== 1 || lockedChapter.count !== 1) throw new ProductionVersionConflictError();
    }, "prepare");
  }
}
