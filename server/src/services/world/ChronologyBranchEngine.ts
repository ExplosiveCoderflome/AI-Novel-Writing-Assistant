import { prisma } from "../../db/prisma";

export class ChronologyBranchEngine {
  /**
   * Zero-copy inheritance lookup: Climbs the branch fork hierarchy to retrieve
   * the sandbox snapshot for a given branchId and target tickIndex.
   */
  public async getSnapshot(branchId: string, tickIndex: number): Promise<any | null> {
    let currentBranchId = branchId;
    let targetTick = tickIndex;

    while (currentBranchId) {
      // Look for a snapshot at the target tick within the current branch
      const snapshot = await prisma.sandboxSnapshot.findUnique({
        where: {
          branchId_tickIndex: {
            branchId: currentBranchId,
            tickIndex: targetTick
          }
        }
      });

      if (snapshot) {
        return snapshot;
      }

      // If no snapshot in current branch, check parent branch
      const branchInfo = await prisma.sandboxBranch.findUnique({
        where: { id: currentBranchId }
      });

      if (!branchInfo || !branchInfo.parentBranchId || branchInfo.parentForkTick === null) {
        break;
      }

      // If the target tick is greater than parent fork tick, we shouldn't climb to the parent
      // because parent history is only inherited up to the fork tick!
      if (targetTick > branchInfo.parentForkTick) {
        break;
      }

      // Climb to parent branch
      currentBranchId = branchInfo.parentBranchId;
    }

    return null;
  }

  /**
   * Forks a branch. Creating a new SandboxBranch model entry.
   * This is a zero-copy operation; we don't duplicate snapshots.
   */
  public async forkBranch(
    novelId: string,
    name: string,
    parentBranchId: string,
    parentForkTick: number
  ): Promise<any> {
    return await prisma.sandboxBranch.create({
      data: {
        novelId,
        name,
        parentBranchId,
        parentForkTick
      }
    });
  }

  /**
   * Future Pruning: When history is modified at `fromTickIndex`, all snapshots
   * and chronologies in the branch at or after `fromTickIndex` must be deleted.
   * Associated chapters are flagged to needs_repair.
   */
  public async pruneBranchFuture(
    branchId: string,
    fromTickIndex: number
  ): Promise<{ snapshotsDeleted: number; chronologiesDeleted: number }> {
    // Delete snapshots
    const snapshotDelete = await prisma.sandboxSnapshot.deleteMany({
      where: {
        branchId,
        tickIndex: {
          gte: fromTickIndex
        }
      }
    });

    // Delete chronologies
    const chronologyDelete = await prisma.sandboxChronology.deleteMany({
      where: {
        branchId,
        tickIndex: {
          gte: fromTickIndex
        }
      }
    });

    // Mark any associated chapters that are written beyond this tick as needs_repair
    const branch = await prisma.sandboxBranch.findUnique({
      where: { id: branchId }
    });

    if (branch) {
      await prisma.chapter.updateMany({
        where: {
          novelId: branch.novelId,
          chapterStatus: { not: "completed" }
        },
        data: {
          chapterStatus: "needs_repair"
        }
      });
    }

    return {
      snapshotsDeleted: snapshotDelete.count,
      chronologiesDeleted: chronologyDelete.count
    };
  }
}
