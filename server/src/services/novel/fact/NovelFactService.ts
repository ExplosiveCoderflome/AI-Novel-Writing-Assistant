import { prisma } from "../../../db/prisma";

export type NovelFactCategory = "completed" | "revealed" | "state_changed";
export type NovelFactSource = "auto" | "manual";

export interface NovelFactWriteItem {
  text: string;
  category: NovelFactCategory;
  source?: NovelFactSource;
}

export interface NovelFactEntry {
  id: string;
  novelId: string;
  chapterOrder: number;
  text: string;
  category: NovelFactCategory;
  source: NovelFactSource;
  createdAt: Date;
}

/**
 * 事实账本服务
 *
 * 记录小说中已发生的不可逆事实（过程性目标完成、信息揭示、状态变化），
 * 供写章上下文消费，防止 LLM 重复写出已发生的事件。
 *
 * 写入方：ChapterContentFinalizationService（章节接收后自动写入）
 * 读取方：GenerationContextAssembler（填充 completedMilestones 字段）
 */
export class NovelFactService {
  /**
   * 批量写入事实条目。幂等设计：同一 novelId+chapterOrder+text 组合不重复插入。
   */
  async writeFacts(
    novelId: string,
    chapterOrder: number,
    items: NovelFactWriteItem[],
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }
    // 查出已存在的 text，避免重复
    const existing = await prisma.novelFactEntry.findMany({
      where: { novelId, chapterOrder },
      select: { text: true },
    });
    const existingTexts = new Set(existing.map((row) => row.text.trim()));
    const toCreate = items.filter((item) => !existingTexts.has(item.text.trim()));
    if (toCreate.length === 0) {
      return;
    }
    await prisma.novelFactEntry.createMany({
      data: toCreate.map((item) => ({
        novelId,
        chapterOrder,
        text: item.text.trim(),
        category: item.category,
        source: item.source ?? "auto",
      })),
    });
  }

  /**
   * 读取当前章节之前的所有事实，用于填充写章上下文。
   *
   * - completed/revealed：全量返回（里程碑性事实，不限距离）
   * - state_changed：只返回最近 recentChaptersWindow 章内的条目
   */
  async listForChapter(input: {
    novelId: string;
    beforeChapterOrder: number;
    recentChaptersWindow?: number;
  }): Promise<NovelFactEntry[]> {
    const { novelId, beforeChapterOrder, recentChaptersWindow = 15 } = input;
    const milestoneRows = await prisma.novelFactEntry.findMany({
      where: {
        novelId,
        chapterOrder: { lt: beforeChapterOrder },
        category: { in: ["completed", "revealed"] },
      },
      orderBy: { chapterOrder: "asc" },
    });
    const recentStateRows = await prisma.novelFactEntry.findMany({
      where: {
        novelId,
        chapterOrder: {
          lt: beforeChapterOrder,
          gte: beforeChapterOrder - recentChaptersWindow,
        },
        category: "state_changed",
      },
      orderBy: { chapterOrder: "asc" },
    });
    return [...milestoneRows, ...recentStateRows].map(mapRow);
  }

  /**
   * 手动写入单条事实（供 Agent 工具调用）
   */
  async addManualFact(input: {
    novelId: string;
    chapterOrder: number;
    text: string;
    category: NovelFactCategory;
  }): Promise<NovelFactEntry> {
    const row = await prisma.novelFactEntry.create({
      data: {
        novelId: input.novelId,
        chapterOrder: input.chapterOrder,
        text: input.text.trim(),
        category: input.category,
        source: "manual",
      },
    });
    return mapRow(row);
  }
}

function mapRow(row: {
  id: string;
  novelId: string;
  chapterOrder: number;
  text: string;
  category: string;
  source: string;
  createdAt: Date;
}): NovelFactEntry {
  return {
    id: row.id,
    novelId: row.novelId,
    chapterOrder: row.chapterOrder,
    text: row.text,
    category: row.category as NovelFactCategory,
    source: row.source as NovelFactSource,
    createdAt: row.createdAt,
  };
}

export const novelFactService = new NovelFactService();
