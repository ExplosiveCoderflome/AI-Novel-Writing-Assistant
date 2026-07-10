import type { CharacterResourceRiskSignal } from "@ai-novel/shared/types/characterResource";
import { prisma } from "../../../db/prisma";
import {
  parseJsonArray,
  stringifyJson,
} from "./characterResourceShared";

const DEFAULT_STALE_AFTER_CHAPTERS = 10;

function hasStaleSignal(signals: CharacterResourceRiskSignal[]): boolean {
  return signals.some((signal) => signal.code === "resource_stale");
}

export class CharacterResourceStaleScanService {
  async scanAfterChapter(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    staleAfterChapters?: number;
  }): Promise<number> {
    const staleAfterChapters = input.staleAfterChapters ?? DEFAULT_STALE_AFTER_CHAPTERS;
    const rows = await prisma.characterResourceLedgerItem.findMany({
      where: {
        novelId: input.novelId,
        status: { in: ["available", "hidden", "borrowed"] },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      take: 80,
    });

    const staleRows = rows.filter((row) => {
      const overdueWindow = row.expectedUseEndChapterOrder != null
        && row.expectedUseEndChapterOrder < input.chapterOrder;
      const longUntouched = row.lastTouchedChapterOrder != null
        && row.lastTouchedChapterOrder <= input.chapterOrder - staleAfterChapters;
      return overdueWindow || longUntouched;
    });
    if (staleRows.length === 0) {
      return 0;
    }

    let markedCount = 0;
    await prisma.$transaction(async (tx) => {
      for (const row of staleRows) {
        const existingSignals = parseJsonArray<CharacterResourceRiskSignal>(row.riskSignalsJson);
        const staleSignal: CharacterResourceRiskSignal = {
          code: "resource_stale",
          severity: row.expectedUseEndChapterOrder != null && row.expectedUseEndChapterOrder < input.chapterOrder
            ? "high"
            : "medium",
          summary: row.expectedUseEndChapterOrder != null && row.expectedUseEndChapterOrder < input.chapterOrder
            ? `资源已超过预计使用窗口（第${row.expectedUseEndChapterOrder}章）。`
            : `资源已超过 ${staleAfterChapters} 章未被触碰。`,
          stale: true,
        };
        const riskSignals = hasStaleSignal(existingSignals)
          ? existingSignals
          : existingSignals.concat(staleSignal);
        await tx.characterResourceLedgerItem.update({
          where: { id: row.id },
          data: {
            status: "stale",
            riskSignalsJson: stringifyJson(riskSignals),
            updatedAt: new Date(),
          },
        });
        await tx.characterResourceEvent.create({
          data: {
            novelId: input.novelId,
            resourceId: row.id,
            chapterId: input.chapterId,
            chapterOrder: input.chapterOrder,
            eventType: "stale_marked",
            actorCharacterId: row.holderCharacterId,
            fromHolderCharacterId: row.holderCharacterId,
            toHolderCharacterId: row.holderCharacterId,
            summary: staleSignal.summary,
            evidenceJson: stringifyJson([staleSignal.summary]),
          },
        });
        markedCount += 1;
      }
    });

    return markedCount;
  }
}

export const characterResourceStaleScanService = new CharacterResourceStaleScanService();
