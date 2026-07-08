import { prisma } from "../../../../db/prisma";
import type { PendingCharacterHardFactReviewMap } from "../../characters/characterHardFacts";

export function buildBlockingPendingReviewProposalWhere(novelId: string, chapterId: string) {
  return {
    novelId,
    status: "pending_review" as const,
    OR: [
      { chapterId },
      { chapterId: null },
    ],
  };
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value?.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function compactOptionalText(value: unknown): string | null {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() || null : null;
}

export async function loadPendingCharacterHardFactReviews(
  novelId: string,
  chapterId: string,
): Promise<PendingCharacterHardFactReviewMap> {
  const rows = await prisma.stateChangeProposal.findMany({
    where: {
      ...buildBlockingPendingReviewProposalWhere(novelId, chapterId),
      proposalType: "character_state_update",
    },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    select: {
      payloadJson: true,
    },
  });

  const byCharacterId: PendingCharacterHardFactReviewMap = new Map();
  for (const row of rows) {
    const payload = parseJsonRecord(row.payloadJson);
    const characterId = compactOptionalText(payload.characterId);
    if (!characterId) {
      continue;
    }
    const currentState = compactOptionalText(payload.currentState);
    const currentGoal = compactOptionalText(payload.currentGoal);
    if (!currentState && !currentGoal) {
      continue;
    }
    const existing = byCharacterId.get(characterId) ?? {
      currentState: null,
      currentGoal: null,
      pendingReviewFields: [],
    };
    const fields = new Set(existing.pendingReviewFields);
    if (currentState && !fields.has("currentState")) {
      existing.currentState = currentState;
      fields.add("currentState");
    }
    if (currentGoal && !fields.has("currentGoal")) {
      existing.currentGoal = currentGoal;
      fields.add("currentGoal");
    }
    byCharacterId.set(characterId, {
      ...existing,
      pendingReviewFields: Array.from(fields),
    });
  }
  return byCharacterId;
}
