import type { BookContract, BookContractDraft } from "@ai-novel/shared/types/novelWorkflow";
import { prisma } from "../../db/prisma";
import { novelEventBus } from "../../events";
import { hasBookContractPayoffChanges } from "../payoff/sources/bookContractPayoffSources";

function mapRowToBookContract(row: {
  id: string;
  novelId: string;
  readingPromise: string;
  protagonistFantasy: string;
  coreSellingPoint: string;
  chapter3Payoff: string;
  chapter10Payoff: string;
  chapter30Payoff: string;
  escalationLadder: string;
  relationshipMainline: string;
  absoluteRedLinesJson: string;
  createdAt: Date;
  updatedAt: Date;
}): BookContract {
  let absoluteRedLines: string[] = [];
  try {
    const parsed = JSON.parse(row.absoluteRedLinesJson) as unknown;
    if (Array.isArray(parsed)) {
      absoluteRedLines = parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    absoluteRedLines = [];
  }

  return {
    id: row.id,
    novelId: row.novelId,
    readingPromise: row.readingPromise,
    protagonistFantasy: row.protagonistFantasy,
    coreSellingPoint: row.coreSellingPoint,
    chapter3Payoff: row.chapter3Payoff,
    chapter10Payoff: row.chapter10Payoff,
    chapter30Payoff: row.chapter30Payoff,
    escalationLadder: row.escalationLadder,
    relationshipMainline: row.relationshipMainline,
    absoluteRedLines,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class BookContractService {
  async getByNovelId(novelId: string): Promise<BookContract | null> {
    const row = await prisma.bookContract.findUnique({
      where: { novelId },
    });
    return row ? mapRowToBookContract(row) : null;
  }

  async upsert(novelId: string, draft: BookContractDraft): Promise<BookContract> {
    const normalizedDraft = {
      readingPromise: draft.readingPromise.trim(),
      protagonistFantasy: draft.protagonistFantasy.trim(),
      coreSellingPoint: draft.coreSellingPoint.trim(),
      chapter3Payoff: draft.chapter3Payoff.trim(),
      chapter10Payoff: draft.chapter10Payoff.trim(),
      chapter30Payoff: draft.chapter30Payoff.trim(),
      escalationLadder: draft.escalationLadder.trim(),
      relationshipMainline: draft.relationshipMainline.trim(),
      absoluteRedLinesJson: JSON.stringify(draft.absoluteRedLines),
    };
    const previousPayoffs = await prisma.bookContract.findUnique({
      where: { novelId },
      select: {
        chapter3Payoff: true,
        chapter10Payoff: true,
        chapter30Payoff: true,
      },
    });
    const payoffChanged = hasBookContractPayoffChanges(previousPayoffs, normalizedDraft);
    const row = await prisma.bookContract.upsert({
      where: { novelId },
      create: {
        novelId,
        ...normalizedDraft,
      },
      update: normalizedDraft,
    });
    void novelEventBus.emit({
      type: "book-contract:updated",
      payload: {
        novelId,
        payoffChanged,
        contractUpdatedAt: row.updatedAt.toISOString(),
      },
    }).catch(() => {});
    return mapRowToBookContract(row);
  }
}
