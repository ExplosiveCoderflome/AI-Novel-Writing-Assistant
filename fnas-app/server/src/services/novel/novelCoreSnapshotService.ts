import { prisma } from "../../db/prisma";
import { normalizeNovelOutput } from "./novelCoreShared";

export class NovelCoreSnapshotService {
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

    return prisma.novelSnapshot.create({
      data: { novelId, label: label ?? null, snapshotData, triggerType },
    });
  }

  async listNovelSnapshots(novelId: string) {
    return prisma.novelSnapshot.findMany({
      where: { novelId },
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
