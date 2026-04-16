import type { StateChangeProposal } from "@ai-novel/shared/types/canonicalState";
import { prisma } from "../../../db/prisma";

function compactText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => compactText(String(item ?? ""))).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function takeUnique(items: Array<string | null | undefined>, limit = items.length): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of items) {
    const normalized = compactText(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    next.push(normalized);
    if (next.length >= limit) {
      break;
    }
  }
  return next;
}

export interface ChapterFactExtractorInput {
  novelId: string;
  chapterId: string;
  chapterOrder?: number;
  sourceType?: string;
  sourceStage?: string | null;
}

export class ChapterFactExtractor {
  async extract(input: ChapterFactExtractorInput): Promise<StateChangeProposal[]> {
    const chapter = await prisma.chapter.findFirst({
      where: { id: input.chapterId, novelId: input.novelId },
      select: {
        id: true,
        order: true,
        title: true,
      },
    });
    if (!chapter) {
      return [];
    }

    const [snapshot, timelineRows, factRows, payoffItems, openConflicts] = await Promise.all([
      prisma.storyStateSnapshot.findFirst({
        where: {
          novelId: input.novelId,
          sourceChapterId: chapter.id,
        },
        include: {
          characterStates: {
            include: {
              character: {
                select: {
                  id: true,
                  name: true,
                  role: true,
                  currentState: true,
                  currentGoal: true,
                },
              },
            },
          },
          relationStates: {
            include: {
              sourceCharacter: {
                select: { id: true, name: true },
              },
              targetCharacter: {
                select: { id: true, name: true },
              },
            },
          },
          informationStates: true,
        },
      }),
      prisma.characterTimeline.findMany({
        where: {
          novelId: input.novelId,
          chapterId: chapter.id,
          source: "chapter_extract",
        },
        include: {
          character: {
            select: { id: true, name: true },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.consistencyFact.findMany({
        where: {
          novelId: input.novelId,
          chapterId: chapter.id,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.payoffLedgerItem.findMany({
        where: {
          novelId: input.novelId,
          OR: [
            { lastTouchedChapterId: chapter.id },
            { payoffChapterId: chapter.id },
            { setupChapterId: chapter.id },
          ],
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.openConflict.findMany({
        where: {
          novelId: input.novelId,
          chapterId: chapter.id,
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    if (!snapshot) {
      return [];
    }

    const sourceType = input.sourceType ?? "chapter_runtime";
    const sourceStage = input.sourceStage ?? "chapter_execution";
    const sourceSnapshotId = snapshot.id;
    const proposals: StateChangeProposal[] = [];

    for (const state of snapshot.characterStates) {
      const evidence = takeUnique([
        state.summary,
        state.currentGoal ? `goal=${state.currentGoal}` : "",
        state.emotion ? `emotion=${state.emotion}` : "",
        ...timelineRows
          .filter((timeline) => timeline.characterId === state.characterId)
          .map((timeline) => timeline.content),
      ], 4);
      if (evidence.length === 0) {
        continue;
      }
      const nextState = compactText(state.summary) || compactText(state.character.currentState);
      const nextGoal = compactText(state.currentGoal) || compactText(state.character.currentGoal);
      if (!nextState && !nextGoal) {
        continue;
      }
      proposals.push({
        novelId: input.novelId,
        chapterId: chapter.id,
        sourceSnapshotId,
        sourceType,
        sourceStage,
        proposalType: "character_state_update",
        riskLevel: "low",
        status: "validated",
        summary: `${state.character.name} runtime state advanced in chapter ${chapter.order}`,
        payload: {
          characterId: state.character.id,
          characterName: state.character.name,
          chapterId: chapter.id,
          chapterOrder: chapter.order,
          currentState: nextState || null,
          currentGoal: nextGoal || null,
          emotion: compactText(state.emotion) || null,
          pressure: typeof state.stressLevel === "number" ? state.stressLevel : null,
        },
        evidence,
        validationNotes: [],
      });
    }

    for (const relation of snapshot.relationStates) {
      const relationSummary = compactText(relation.summary);
      if (!relationSummary) {
        continue;
      }
      proposals.push({
        novelId: input.novelId,
        chapterId: chapter.id,
        sourceSnapshotId,
        sourceType,
        sourceStage,
        proposalType: "relation_state_update",
        riskLevel: "medium",
        status: "validated",
        summary: `${relation.sourceCharacter.name} -> ${relation.targetCharacter.name} relation shifted in chapter ${chapter.order}`,
        payload: {
          sourceCharacterId: relation.sourceCharacterId,
          targetCharacterId: relation.targetCharacterId,
          chapterId: chapter.id,
          chapterOrder: chapter.order,
          summary: relationSummary,
          trustScore: relation.trustScore,
          intimacyScore: relation.intimacyScore,
          conflictScore: relation.conflictScore,
          dependencyScore: relation.dependencyScore,
        },
        evidence: [relationSummary],
        validationNotes: [],
      });
    }

    for (const info of snapshot.informationStates) {
      const fact = compactText(info.fact);
      if (!fact) {
        continue;
      }
      proposals.push({
        novelId: input.novelId,
        chapterId: chapter.id,
        sourceSnapshotId,
        sourceType,
        sourceStage,
        proposalType: "information_disclosure",
        riskLevel: info.holderType === "reader" ? "medium" : "high",
        status: "validated",
        summary: `Information state changed around "${fact}" in chapter ${chapter.order}`,
        payload: {
          holderType: info.holderType,
          holderRefId: info.holderRefId,
          chapterId: chapter.id,
          chapterOrder: chapter.order,
          fact,
          status: compactText(info.status) || "known",
        },
        evidence: takeUnique([info.summary, fact], 2),
        validationNotes: [],
      });
    }

    for (const item of payoffItems) {
      proposals.push({
        novelId: input.novelId,
        chapterId: chapter.id,
        sourceSnapshotId,
        sourceType,
        sourceStage,
        proposalType: "payoff_progression",
        riskLevel: "low",
        status: "validated",
        summary: `Payoff "${item.title}" progressed in chapter ${chapter.order}`,
        payload: {
          ledgerKey: item.ledgerKey,
          payoffId: item.id,
          chapterId: chapter.id,
          chapterOrder: chapter.order,
          currentStatus: item.currentStatus,
          lastTouchedChapterId: item.lastTouchedChapterId,
          lastTouchedChapterOrder: item.lastTouchedChapterOrder,
          targetEndChapterOrder: item.targetEndChapterOrder,
        },
        evidence: takeUnique([
          item.summary,
          item.statusReason,
          ...parseStringArray(item.evidenceJson),
        ], 3),
        validationNotes: [],
      });
    }

    for (const conflict of openConflicts) {
      proposals.push({
        novelId: input.novelId,
        chapterId: chapter.id,
        sourceSnapshotId,
        sourceType,
        sourceStage,
        proposalType: "conflict_update",
        riskLevel: conflict.status === "resolved" ? "medium" : "low",
        status: "validated",
        summary: `Conflict "${conflict.title}" was touched in chapter ${chapter.order}`,
        payload: {
          conflictId: conflict.id,
          conflictKey: conflict.conflictKey,
          chapterId: chapter.id,
          chapterOrder: chapter.order,
          status: conflict.status,
          severity: conflict.severity,
          summary: conflict.summary,
        },
        evidence: takeUnique([
          conflict.summary,
          conflict.resolutionHint,
          ...parseStringArray(conflict.evidenceJson),
        ], 3),
        validationNotes: [],
      });
    }

    const eventSummary = takeUnique([
      ...factRows.map((fact) => fact.content),
      ...timelineRows.map((timeline) => timeline.content),
    ], 5);
    if (eventSummary.length > 0) {
      proposals.push({
        novelId: input.novelId,
        chapterId: chapter.id,
        sourceSnapshotId,
        sourceType,
        sourceStage,
        proposalType: "event_record",
        riskLevel: "low",
        status: "validated",
        summary: `Chapter ${chapter.order} event record`,
        payload: {
          chapterId: chapter.id,
          chapterOrder: chapter.order,
          chapterTitle: chapter.title,
          keyEvents: eventSummary,
        },
        evidence: eventSummary,
        validationNotes: [],
      });
    }

    return proposals;
  }
}

export const chapterFactExtractor = new ChapterFactExtractor();
