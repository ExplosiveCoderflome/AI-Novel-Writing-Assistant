import { prisma } from "../../db/prisma";
import { normalizeNovelOutput } from "./novelCoreShared";

const DEFAULT_NOVEL_SNAPSHOT_RETENTION_COUNT = 10;
const AUTOMATIC_SNAPSHOT_TRIGGERS = ["auto_milestone", "before_pipeline"] as const;

type AutomaticSnapshotTrigger = typeof AUTOMATIC_SNAPSHOT_TRIGGERS[number];

interface SnapshotRetentionCandidate {
  id: string;
  createdAt: Date | string;
  triggerType: string;
}

function isAutomaticSnapshotTrigger(triggerType: string): triggerType is AutomaticSnapshotTrigger {
  return (AUTOMATIC_SNAPSHOT_TRIGGERS as readonly string[]).includes(triggerType);
}

function snapshotCreatedAtMs(value: Date | string): number {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function resolveNovelSnapshotRetentionCount(
  env: { NOVEL_SNAPSHOT_RETENTION_COUNT?: string } = process.env,
): number {
  const rawValue = env.NOVEL_SNAPSHOT_RETENTION_COUNT?.trim();
  if (!rawValue) {
    return DEFAULT_NOVEL_SNAPSHOT_RETENTION_COUNT;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_NOVEL_SNAPSHOT_RETENTION_COUNT;
  }

  return parsed;
}

export function selectPrunableAutoSnapshotIds(
  snapshots: SnapshotRetentionCandidate[],
  retentionCount: number,
): string[] {
  if (!Number.isInteger(retentionCount) || retentionCount < 1) {
    retentionCount = DEFAULT_NOVEL_SNAPSHOT_RETENTION_COUNT;
  }

  return snapshots
    .filter((snapshot) => isAutomaticSnapshotTrigger(snapshot.triggerType))
    .sort((left, right) => {
      const timeDelta = snapshotCreatedAtMs(right.createdAt) - snapshotCreatedAtMs(left.createdAt);
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return right.id.localeCompare(left.id);
    })
    .slice(retentionCount)
    .map((snapshot) => snapshot.id);
}

export class NovelCoreSnapshotService {
  private async pruneAutomaticSnapshots(novelId: string): Promise<void> {
    const retentionCount = resolveNovelSnapshotRetentionCount();
    const automaticSnapshots = await prisma.novelSnapshot.findMany({
      where: {
        novelId,
        triggerType: { in: [...AUTOMATIC_SNAPSHOT_TRIGGERS] },
      },
      select: {
        id: true,
        createdAt: true,
        triggerType: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const prunableIds = selectPrunableAutoSnapshotIds(automaticSnapshots, retentionCount);
    if (prunableIds.length === 0) {
      return;
    }

    await prisma.novelSnapshot.deleteMany({
      where: {
        novelId,
        id: { in: prunableIds },
      },
    });
  }

  async createNovelSnapshot(
    novelId: string,
    triggerType: "manual" | "auto_milestone" | "before_pipeline",
    label?: string,
  ) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: {
        chapters: { orderBy: { order: "asc" }, select: { id: true, title: true, order: true, content: true } },
      },
    });
    if (!novel) {
      throw new Error("Novel not found.");
    }

    const snapshotData = JSON.stringify({
      outline: novel.outline,
      structuredOutline: novel.structuredOutline,
      chapters: novel.chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        order: chapter.order,
        content: chapter.content,
      })),
    });

    const snapshot = await prisma.novelSnapshot.create({
      data: { novelId, label: label ?? null, snapshotData, triggerType },
    });

    if (isAutomaticSnapshotTrigger(triggerType)) {
      try {
        await this.pruneAutomaticSnapshots(novelId);
      } catch (error) {
        console.warn("[novel.snapshot] automatic snapshot retention skipped.", {
          novelId,
          snapshotId: snapshot.id,
          error,
        });
      }
    }

    return snapshot;
  }

  async listNovelSnapshots(novelId: string) {
    return prisma.novelSnapshot.findMany({
      where: { novelId },
      select: {
        id: true,
        novelId: true,
        label: true,
        triggerType: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async restoreFromSnapshot(novelId: string, snapshotId: string) {
    const snapshot = await prisma.novelSnapshot.findFirst({
      where: { id: snapshotId, novelId },
    });
    if (!snapshot) {
      throw new Error("Snapshot not found.");
    }

    const data = JSON.parse(snapshot.snapshotData) as {
      outline?: string | null;
      structuredOutline?: string | null;
      chapters?: Array<{ id: string; title?: string; order?: number; content?: string | null }>;
    };

    await this.createNovelSnapshot(novelId, "manual", `before-restore-${snapshotId.slice(0, 8)}`);
    await prisma.novel.update({
      where: { id: novelId },
      data: {
        outline: data.outline ?? undefined,
        structuredOutline: data.structuredOutline ?? undefined,
      },
    });

    if (Array.isArray(data.chapters) && data.chapters.length > 0) {
      for (const chapter of data.chapters) {
        if (chapter.id) {
          await prisma.chapter.updateMany({
            where: { id: chapter.id, novelId },
            data: {
              ...(chapter.title != null && { title: chapter.title }),
              ...(chapter.order != null && { order: chapter.order }),
              ...(chapter.content != null && { content: chapter.content }),
            },
          });
        }
      }
    }

    const restored = await prisma.novel.findUnique({ where: { id: novelId } });
    return restored ? normalizeNovelOutput(restored) : null;
  }
}
