import { prisma } from "../../db/prisma";

export interface CreativeDecisionInput {
  chapterId?: string | null;
  category: string;
  content: string;
  importance?: string;
  expiresAt?: number | null;
  sourceType?: string | null;
  sourceRefId?: string | null;
}

export class NovelDecisionService {
  async list(novelId: string) {
    return prisma.creativeDecision.findMany({
      where: { novelId },
      orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
  }

  async create(novelId: string, input: CreativeDecisionInput) {
    return prisma.creativeDecision.create({
      data: {
        novelId,
        chapterId: input.chapterId ?? null,
        category: input.category,
        content: input.content,
        importance: input.importance ?? "normal",
        expiresAt: input.expiresAt ?? null,
        sourceType: input.sourceType ?? null,
        sourceRefId: input.sourceRefId ?? null,
      },
    });
  }

  async update(novelId: string, decisionId: string, input: Partial<CreativeDecisionInput>) {
    const existing = await prisma.creativeDecision.findFirst({
      where: { id: decisionId, novelId },
      select: { id: true },
    });
    if (!existing) {
      throw new Error("Creative decision not found.");
    }
    return prisma.creativeDecision.update({
      where: { id: decisionId },
      data: {
        ...(input.chapterId !== undefined ? { chapterId: input.chapterId } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.importance !== undefined ? { importance: input.importance } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
        ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
        ...(input.sourceRefId !== undefined ? { sourceRefId: input.sourceRefId } : {}),
      },
    });
  }

  async remove(novelId: string, decisionId: string) {
    const row = await prisma.creativeDecision.findFirst({
      where: { id: decisionId, novelId },
      select: { id: true },
    });
    if (!row) {
      throw new Error("Creative decision not found.");
    }
    await prisma.creativeDecision.delete({
      where: { id: decisionId },
    });
  }

  async batchInvalidate(novelId: string, decisionIds: string[]) {
    const now = Math.floor(Date.now() / 1000);
    const result = await prisma.creativeDecision.updateMany({
      where: {
        novelId,
        id: { in: decisionIds },
      },
      data: {
        expiresAt: now,
      },
    });
    return {
      count: result.count,
      expiresAt: now,
    };
  }
}

export const novelDecisionService = new NovelDecisionService();
