import { prisma } from "../../db/prisma";

interface ChapterWriteInput {
  title?: string;
  content?: string;
  order?: number;
}

export class ChapterService {
  async listChapters(novelId: string) {
    return prisma.chapter.findMany({
      where: { novelId },
      orderBy: { order: "asc" },
    });
  }

  async createChapter(novelId: string, input: Required<Pick<ChapterWriteInput, "title" | "order">> & ChapterWriteInput) {
    return prisma.chapter.create({
      data: {
        novelId,
        title: input.title,
        order: input.order,
        content: input.content ?? "",
      },
    });
  }

  async updateChapter(novelId: string, chapterId: string, input: ChapterWriteInput) {
    const exists = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: { id: true },
    });
    if (!exists) {
      throw new Error("章节不存在。");
    }
    return prisma.chapter.update({
      where: { id: chapterId },
      data: input,
    });
  }

  async deleteChapter(novelId: string, chapterId: string) {
    const deleted = await prisma.chapter.deleteMany({
      where: { id: chapterId, novelId },
    });
    if (deleted.count === 0) {
      throw new Error("章节不存在。");
    }
  }
}
