import type { Prisma, PrismaClient, ProductionUnitRun } from "@prisma/client";
import { canonicalProductionJson, cloneProductionData } from "../common";
import { STAGES, type StageId } from "../domain";
import { assertRunMatches, InvalidProductionRequestError, snapshotsFor, validateUnitRequest,
  type ChapterWrite, type UnitProgressStore, type UnitRequest, type UnitRun, type UnitRunUpdate } from "../application";

export interface ProgressStoreIdentity { ownerKey: string; unit: UnitRequest["unit"]; runId?: string }
export interface ProgressStoreOptions {
  /** Caller verifies its own durable lease/control row inside this transaction. No in-memory default. */
  assertOwnership: (tx: Prisma.TransactionClient, identity: ProgressStoreIdentity) => Promise<void>;
  /** Final chapter lifecycle writer; shares the transaction with the progress CAS. */
  writeChapter?: (tx: Prisma.TransactionClient, run: UnitRun, write: ChapterWrite) => Promise<void>;
  /** Selected reports and terminal lifecycle state share the successful reconcile CAS transaction. */
  finalizeChapter?: (tx: Prisma.TransactionClient, run: UnitRun, next: UnitRunUpdate) => Promise<void>;
}
export function parseProductionUnitRun(row: ProductionUnitRun): UnitRun {
  try {
    const policy = JSON.parse(row.policySnapshotJson);
    const progress = JSON.parse(row.progressJson);
    const run: UnitRun = { id: row.id, ownerKey: row.ownerKey, version: row.version,
      snapshots: { profile: JSON.parse(row.profileSnapshotJson), model: JSON.parse(row.modelSnapshotJson), ...policy },
      progress, artifacts: JSON.parse(row.stageArtifactsJson), activeStage: row.activeStage as StageId | null,
      activeRequestKey: row.activeRequestKey };
    if (row.novelId !== progress.unit.novelId || row.chapterId !== progress.unit.chapterId
      || (row.activeStage !== null && !STAGES.includes(row.activeStage as StageId))
      || !Array.isArray(progress.completed) || progress.completed.some((stage: StageId) => !STAGES.includes(stage))
      || new Set(progress.completed).size !== progress.completed.length
      || !run.artifacts.receipts || typeof run.artifacts.receipts !== "object") {
      throw new InvalidProductionRequestError("Corrupt production progress");
    }
    const request = validateUnitRequest({ ownerKey: row.ownerKey, unit: progress.unit, ...run.snapshots });
    assertRunMatches(request, run);
    return run;
  } catch (error) {
    if (error instanceof InvalidProductionRequestError) throw error;
    throw new InvalidProductionRequestError("Invalid persisted production data");
  }
}
function updateData(next: UnitRunUpdate) {
  return { progressJson: canonicalProductionJson(next.progress), stageArtifactsJson: canonicalProductionJson(next.artifacts),
    activeStage: next.activeStage, activeRequestKey: next.activeRequestKey, version: { increment: 1 } };
}

/** No global connection: callers supply the client and the durable ownership contract. */
export class PrismaUnitProgressStore implements UnitProgressStore {
  constructor(private readonly db: PrismaClient, private readonly options: ProgressStoreOptions) {}

  async loadOrCreate(input: UnitRequest): Promise<UnitRun> {
    const request = validateUnitRequest(input);
    const result = await this.db.$transaction(async (tx) => {
      const identity = { ownerKey: request.ownerKey, unit: request.unit };
      await this.options.assertOwnership(tx, identity);
      const chapter = await tx.chapter.findFirst({
        where: { id: request.unit.chapterId, novelId: request.unit.novelId, order: request.unit.order }, select: { id: true },
      });
      if (!chapter) throw new InvalidProductionRequestError("Chapter does not belong to this production unit");
      const snapshots = snapshotsFor(request);
      const row = await tx.productionUnitRun.upsert({
        where: { ownerKey_chapterId: { ownerKey: request.ownerKey, chapterId: request.unit.chapterId } },
        create: { ownerKey: request.ownerKey, novelId: request.unit.novelId, chapterId: request.unit.chapterId,
          profileSnapshotJson: canonicalProductionJson(snapshots.profile),
          policySnapshotJson: canonicalProductionJson({ policy: snapshots.policy,
            ...(snapshots.policySource === undefined ? {} : { policySource: snapshots.policySource }) }),
          modelSnapshotJson: canonicalProductionJson(snapshots.model),
          progressJson: canonicalProductionJson({ unit: request.unit, completed: [], repairAttemptsUsed: 0 }),
          stageArtifactsJson: canonicalProductionJson({ receipts: {} }),
        }, update: {},
      });
      const run = parseProductionUnitRun(row);
      assertRunMatches(request, run);
      return run;
    });
    return cloneProductionData(result);
  }

  async compareAndSwap(expected: UnitRun, next: UnitRunUpdate, chapterWrite?: ChapterWrite): Promise<UnitRun | null> {
    const request = { ownerKey: expected.ownerKey, unit: expected.progress.unit, ...expected.snapshots };
    assertRunMatches(request, { ...expected, progress: next.progress });
    if (Boolean(next.activeStage) !== Boolean(next.activeRequestKey)) throw new InvalidProductionRequestError("Incomplete stage claim");
    if (chapterWrite && !this.options.writeChapter) throw new InvalidProductionRequestError("Atomic chapter lifecycle writer is not installed");
    const data = updateData(next);
    const closes = expected.activeStage === "reconcile" && next.activeStage === null
      && next.progress.completed.includes("reconcile") && ["completed","degraded"].includes(next.progress.reconcileStatus ?? "");
    if (closes && this.options.writeChapter && !this.options.finalizeChapter) throw new InvalidProductionRequestError("Atomic chapter finalizer is not installed");
    return this.db.$transaction(async (tx) => {
      await this.options.assertOwnership(tx, { ownerKey: expected.ownerKey, unit: expected.progress.unit, runId: expected.id });
      const updated = await tx.productionUnitRun.updateMany({
        where: { id: expected.id, ownerKey: expected.ownerKey, novelId: expected.progress.unit.novelId,
          chapterId: expected.progress.unit.chapterId, version: expected.version,
          activeStage: expected.activeStage, activeRequestKey: expected.activeRequestKey }, data,
      });
      if (updated.count !== 1) return null;
      if (chapterWrite) await this.options.writeChapter!(tx, expected, chapterWrite);
      if (closes) await this.options.finalizeChapter?.(tx, expected, next);
      await this.options.assertOwnership(tx, { ownerKey: expected.ownerKey, unit: expected.progress.unit, runId: expected.id });
      const row = await tx.productionUnitRun.findUniqueOrThrow({ where: { id: expected.id } });
      return parseProductionUnitRun(row);
    });
  }
}
