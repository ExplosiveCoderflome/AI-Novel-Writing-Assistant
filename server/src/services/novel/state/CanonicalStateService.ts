import type {
  CanonicalStateSnapshot,
  CanonicalTimelineEventState,
} from "@ai-novel/shared/types/canonicalState";
import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import { prisma } from "../../../db/prisma";

function compactText(value: string | null | undefined, fallback = ""): string {
  return String(value ?? "").replace(/\s+/g, " ").trim() || fallback;
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item ?? "").trim()).filter(Boolean)
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

function buildNarrativePhase(input: {
  overdueCount: number;
  urgentCount: number;
  conflictCount: number;
  chapterGoal: string;
}): string {
  if (input.overdueCount > 0) {
    return "payoff_pressure";
  }
  if (input.urgentCount > 0) {
    return "payoff_due";
  }
  if (input.conflictCount > 0) {
    return "conflict_active";
  }
  if (input.chapterGoal.trim()) {
    return "chapter_progression";
  }
  return "steady_progression";
}

export interface CanonicalStateScope {
  chapterId?: string;
  chapterOrder?: number;
  includeCurrentChapterState?: boolean;
  timelineWindow?: number;
}

interface CanonicalStateServiceDeps {
  now?: () => Date;
}

export class CanonicalStateService {
  private readonly now: () => Date;

  constructor(deps: CanonicalStateServiceDeps = {}) {
    this.now = deps.now ?? (() => new Date());
  }

  async getSnapshot(novelId: string, scope: CanonicalStateScope = {}): Promise<CanonicalStateSnapshot> {
    const chapterOrder = scope.chapterOrder ?? await this.resolveChapterOrder(novelId, scope.chapterId);
    const includeCurrent = scope.includeCurrentChapterState === true;
    const snapshotWhere = typeof chapterOrder === "number"
      ? {
          novelId,
          sourceChapter: {
            is: {
              order: includeCurrent ? { lte: chapterOrder } : { lt: chapterOrder },
            },
          },
        }
      : { novelId };

    const [
      novel,
      latestSnapshot,
      relationStages,
      openConflicts,
      payoffItems,
      timelineRows,
      currentChapter,
    ] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: novelId },
        include: {
          genre: { select: { name: true } },
          world: true,
          bookContract: true,
          characters: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              name: true,
              role: true,
              currentGoal: true,
              currentState: true,
              secret: true,
            },
          },
          volumePlans: {
            orderBy: { sortOrder: "asc" },
            include: {
              chapters: {
                orderBy: { chapterOrder: "asc" },
                select: { chapterOrder: true },
              },
            },
          },
        },
      }),
      prisma.storyStateSnapshot.findFirst({
        where: snapshotWhere,
        orderBy: { createdAt: "desc" },
        include: {
          characterStates: true,
          informationStates: true,
          relationStates: true,
          foreshadowStates: true,
          sourceChapter: {
            select: { id: true, order: true, title: true },
          },
        },
      }),
      prisma.characterRelationStage.findMany({
        where: { novelId, isCurrent: true },
        include: {
          sourceCharacter: { select: { name: true } },
          targetCharacter: { select: { name: true } },
        },
        orderBy: [{ updatedAt: "desc" }],
      }),
      prisma.openConflict.findMany({
        where: {
          novelId,
          status: "open",
          ...(typeof chapterOrder === "number"
            ? {
                OR: [
                  { chapter: { is: null } },
                  {
                    chapter: {
                      is: {
                        order: includeCurrent ? { lte: chapterOrder } : { lt: chapterOrder },
                      },
                    },
                  },
                ],
              }
            : {}),
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 12,
      }),
      prisma.payoffLedgerItem.findMany({
        where: { novelId },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.chapter.findMany({
        where: {
          novelId,
          ...(typeof chapterOrder === "number"
            ? { order: includeCurrent ? { lte: chapterOrder } : { lt: chapterOrder } }
            : {}),
        },
        orderBy: { order: "desc" },
        take: Math.max(1, Math.min(scope.timelineWindow ?? 6, 12)),
        include: {
          chapterSummary: true,
          facts: {
            orderBy: { createdAt: "asc" },
            take: 6,
          },
        },
      }),
      scope.chapterId
        ? prisma.chapter.findFirst({
            where: { id: scope.chapterId, novelId },
            select: { id: true, order: true, title: true, expectation: true },
          })
        : Promise.resolve(null),
    ]);

    if (!novel) {
      throw new Error("小说不存在。");
    }

    const activeVolume = typeof chapterOrder === "number"
      ? novel.volumePlans.find((volume) => volume.chapters.some((chapter) => chapter.chapterOrder === chapterOrder))
      : null;
    const snapshotCharacterStates = new Map(
      (latestSnapshot?.characterStates ?? []).map((item) => [item.characterId, item]),
    );
    const latestTimelineByCharacter = new Map<string, string>();
    for (const chapter of timelineRows) {
      for (const fact of chapter.facts) {
        const content = compactText(fact.content);
        if (!content) {
          continue;
        }
        for (const character of novel.characters) {
          if (!latestTimelineByCharacter.has(character.id) && content.includes(character.name)) {
            latestTimelineByCharacter.set(character.id, content);
          }
        }
      }
    }

    const characters = novel.characters.map((character) => {
      const state = snapshotCharacterStates.get(character.id);
      const relatedStages = relationStages.filter((item) => (
        item.sourceCharacterId === character.id || item.targetCharacterId === character.id
      ));
      return {
        characterId: character.id,
        name: character.name,
        role: character.role,
        currentGoal: compactText(state?.currentGoal) || compactText(character.currentGoal) || null,
        currentState: compactText(state?.summary) || compactText(character.currentState) || null,
        currentPressure: state?.stressLevel != null ? `stress=${state.stressLevel}` : null,
        currentSecret: compactText(character.secret) || compactText(state?.secretExposure) || null,
        emotion: compactText(state?.emotion) || null,
        knownFacts: parseStringArray(state?.knownFactsJson),
        relationStageLabels: takeUnique(relatedStages.map((item) => item.stageLabel), 4),
        summary: compactText(state?.summary) || null,
        lastEventSummary: latestTimelineByCharacter.get(character.id) ?? null,
      };
    });

    const pendingPayoffs = payoffItems
      .filter((item) => item.currentStatus === "setup" || item.currentStatus === "hinted" || item.currentStatus === "pending_payoff")
      .map((item) => ({
        id: item.id,
        ledgerKey: item.ledgerKey,
        title: item.title,
        summary: item.summary,
        scopeType: item.scopeType,
        currentStatus: item.currentStatus,
        targetStartChapterOrder: item.targetStartChapterOrder,
        targetEndChapterOrder: item.targetEndChapterOrder,
        firstSeenChapterOrder: item.firstSeenChapterOrder,
        lastTouchedChapterOrder: item.lastTouchedChapterOrder,
        lastTouchedChapterId: item.lastTouchedChapterId,
        setupChapterId: item.setupChapterId,
        payoffChapterId: item.payoffChapterId,
        statusReason: item.statusReason,
        confidence: item.confidence,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }));
    const urgentPayoffs = pendingPayoffs.filter((item) => typeof item.targetEndChapterOrder === "number"
      && typeof chapterOrder === "number"
      && item.targetEndChapterOrder <= chapterOrder + 1);
    const overduePayoffs = payoffItems
      .filter((item) => item.currentStatus === "overdue")
      .map((item) => ({
        id: item.id,
        ledgerKey: item.ledgerKey,
        title: item.title,
        summary: item.summary,
        scopeType: item.scopeType,
        currentStatus: item.currentStatus,
        targetStartChapterOrder: item.targetStartChapterOrder,
        targetEndChapterOrder: item.targetEndChapterOrder,
        firstSeenChapterOrder: item.firstSeenChapterOrder,
        lastTouchedChapterOrder: item.lastTouchedChapterOrder,
        lastTouchedChapterId: item.lastTouchedChapterId,
        setupChapterId: item.setupChapterId,
        payoffChapterId: item.payoffChapterId,
        statusReason: item.statusReason,
        confidence: item.confidence,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }));

    const publicKnowledge = takeUnique(
      latestSnapshot?.informationStates
        ?.filter((item) => item.holderType === "reader")
        .map((item) => item.fact) ?? [],
      6,
    );
    const hiddenKnowledge = takeUnique(
      latestSnapshot?.informationStates
        ?.filter((item) => item.holderType === "character")
        .map((item) => item.fact) ?? [],
      6,
    );
    const suspenseThreads = takeUnique([
      ...latestSnapshot?.foreshadowStates.map((item) => `${item.title}(${item.status})`) ?? [],
      ...overduePayoffs.map((item) => item.title),
      ...urgentPayoffs.map((item) => item.title),
    ], 8);

    const timeline = timelineRows
      .slice()
      .reverse()
      .map((chapter): CanonicalTimelineEventState => ({
        chapterId: chapter.id,
        chapterOrder: chapter.order,
        title: chapter.title,
        summary: compactText(chapter.chapterSummary?.summary, compactText(chapter.expectation, "无摘要")),
        participants: takeUnique(
          novel.characters
            .filter((character) => (chapter.chapterSummary?.characterStates ?? "").includes(character.name))
            .map((character) => character.name),
          5,
        ),
        consequences: takeUnique(chapter.facts.map((fact) => fact.content), 4),
      }));

    const chapterGoal = compactText(currentChapter?.expectation) || compactText(latestSnapshot?.summary);

    return {
      novelId,
      sourceSnapshotId: latestSnapshot?.id ?? null,
      scopeLabel: typeof chapterOrder === "number" ? `chapter:${chapterOrder}` : "novel",
      bookContract: {
        title: novel.title,
        genre: novel.genre?.name ?? null,
        targetAudience: novel.targetAudience ?? null,
        sellingPoint: novel.bookSellingPoint ?? null,
        first30ChapterPromise: novel.first30ChapterPromise ?? null,
        readingPromise: novel.bookContract?.readingPromise ?? null,
        protagonistFantasy: novel.bookContract?.protagonistFantasy ?? null,
        coreSellingPoint: novel.bookContract?.coreSellingPoint ?? null,
        chapter3Payoff: novel.bookContract?.chapter3Payoff ?? null,
        chapter10Payoff: novel.bookContract?.chapter10Payoff ?? null,
        chapter30Payoff: novel.bookContract?.chapter30Payoff ?? null,
        escalationLadder: novel.bookContract?.escalationLadder ?? null,
        relationshipMainline: novel.bookContract?.relationshipMainline ?? null,
        toneGuardrails: takeUnique([novel.styleTone], 1),
        hardConstraints: takeUnique(parseStringArray(novel.bookContract?.absoluteRedLinesJson), 8),
      },
      worldState: novel.world ? {
        worldId: novel.world.id,
        name: novel.world.name,
        summary: compactText(novel.world.description)
          || compactText(novel.world.background)
          || compactText(novel.world.conflicts)
          || null,
        rules: takeUnique([
          novel.world.axioms,
          novel.world.magicSystem,
          novel.world.technology,
          novel.world.politics,
          novel.world.religions,
        ], 6),
        forces: takeUnique([
          novel.world.factions,
          novel.world.politics,
          novel.world.races,
        ], 6),
        locations: takeUnique([
          novel.world.geography,
          novel.world.history,
        ], 6),
        tabooRules: takeUnique([
          novel.world.axioms,
          novel.world.conflicts,
        ], 4),
        currentSituation: compactText(novel.world.conflicts) || null,
      } : null,
      characters,
      narrative: {
        currentVolumeId: activeVolume?.id ?? null,
        currentVolumeTitle: activeVolume?.title ?? null,
        currentChapterId: currentChapter?.id ?? null,
        currentChapterOrder: currentChapter?.order ?? chapterOrder ?? null,
        currentChapterGoal: chapterGoal || null,
        currentPhase: buildNarrativePhase({
          overdueCount: overduePayoffs.length,
          urgentCount: urgentPayoffs.length,
          conflictCount: openConflicts.length,
          chapterGoal,
        }),
        openConflicts: openConflicts.map((item) => ({
          id: item.id,
          title: item.title,
          summary: item.summary,
          conflictType: item.conflictType,
          severity: item.severity,
          status: item.status,
          resolutionHint: item.resolutionHint,
          lastSeenChapterOrder: item.lastSeenChapterOrder,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        })),
        pendingPayoffs,
        urgentPayoffs,
        overduePayoffs,
        publicKnowledge,
        hiddenKnowledge,
        suspenseThreads,
      },
      timeline,
      createdAt: this.now().toISOString(),
    };
  }

  private async resolveChapterOrder(novelId: string, chapterId?: string): Promise<number | undefined> {
    if (!chapterId) {
      return undefined;
    }
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: { order: true },
    });
    return chapter?.order;
  }
}

export const canonicalStateService = new CanonicalStateService();

export function buildRuntimeStateSnapshotFromCanonical(
  snapshot: CanonicalStateSnapshot,
): GenerationContextPackage["stateSnapshot"] {
  return {
    id: snapshot.sourceSnapshotId ?? `canonical:${snapshot.novelId}:${snapshot.scopeLabel}`,
    novelId: snapshot.novelId,
    sourceChapterId: snapshot.narrative.currentChapterId ?? null,
    summary: [
      snapshot.narrative.currentChapterGoal ? `chapter-goal=${snapshot.narrative.currentChapterGoal}` : "",
      ...snapshot.characters
        .slice(0, 3)
        .map((item) => [item.name, item.currentGoal, item.currentState].filter(Boolean).join(" | ")),
      ...snapshot.narrative.publicKnowledge.slice(0, 2).map((item) => `reader-knows=${item}`),
    ].filter(Boolean).join("\n"),
    rawStateJson: JSON.stringify(snapshot),
    characterStates: snapshot.characters.map((item) => ({
      characterId: item.characterId,
      currentGoal: item.currentGoal ?? null,
      emotion: item.emotion ?? null,
      summary: item.summary ?? item.currentState ?? null,
    })),
    relationStates: [],
    informationStates: [
      ...snapshot.narrative.publicKnowledge.map((fact) => ({
        holderType: "reader",
        holderRefId: null,
        fact,
        status: "known",
        summary: null,
      })),
      ...snapshot.narrative.hiddenKnowledge.map((fact) => ({
        holderType: "character",
        holderRefId: null,
        fact,
        status: "contained",
        summary: null,
      })),
    ],
    foreshadowStates: snapshot.narrative.suspenseThreads.map((item) => ({
      title: item,
      summary: null,
      status: "tracked",
      setupChapterId: null,
      payoffChapterId: null,
    })),
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.createdAt,
  };
}

export function buildRuntimeOpenConflictsFromCanonical(
  snapshot: CanonicalStateSnapshot,
): GenerationContextPackage["openConflicts"] {
  return snapshot.narrative.openConflicts.map((item) => ({
    id: item.id,
    novelId: snapshot.novelId,
    chapterId: snapshot.narrative.currentChapterId ?? null,
    sourceSnapshotId: snapshot.sourceSnapshotId ?? null,
    sourceIssueId: null,
    sourceType: "canonical_state",
    conflictType: item.conflictType,
    conflictKey: item.id,
    title: item.title,
    summary: item.summary,
    severity: item.severity,
    status: item.status,
    evidence: [],
    affectedCharacterIds: [],
    resolutionHint: item.resolutionHint ?? null,
    lastSeenChapterOrder: item.lastSeenChapterOrder ?? null,
    createdAt: item.createdAt ?? snapshot.createdAt,
    updatedAt: item.updatedAt ?? snapshot.createdAt,
  }));
}

export function buildRuntimeLedgerFromCanonical(
  snapshot: CanonicalStateSnapshot,
): Pick<GenerationContextPackage, "ledgerPendingItems" | "ledgerUrgentItems" | "ledgerOverdueItems" | "ledgerSummary"> {
  const toRuntimeItem = (item: CanonicalStateSnapshot["narrative"]["pendingPayoffs"][number]) => ({
    id: item.id,
    novelId: snapshot.novelId,
    ledgerKey: item.ledgerKey,
    title: item.title,
    summary: item.summary,
    scopeType: (item.scopeType as "book" | "volume" | "chapter" | null) ?? "book",
    currentStatus: (item.currentStatus as "setup" | "hinted" | "pending_payoff" | "paid_off" | "failed" | "overdue"),
    targetStartChapterOrder: item.targetStartChapterOrder ?? null,
    targetEndChapterOrder: item.targetEndChapterOrder ?? null,
    firstSeenChapterOrder: item.firstSeenChapterOrder ?? null,
    lastTouchedChapterOrder: item.lastTouchedChapterOrder ?? null,
    lastTouchedChapterId: item.lastTouchedChapterId ?? null,
    setupChapterId: item.setupChapterId ?? null,
    payoffChapterId: item.payoffChapterId ?? null,
    lastSnapshotId: snapshot.sourceSnapshotId ?? null,
    sourceRefs: [],
    evidence: [],
    riskSignals: [],
    statusReason: item.statusReason ?? null,
    confidence: item.confidence ?? null,
    createdAt: item.createdAt ?? snapshot.createdAt,
    updatedAt: item.updatedAt ?? snapshot.createdAt,
  });
  const pendingItems = snapshot.narrative.pendingPayoffs.map((item) => toRuntimeItem(item));
  const urgentItems = snapshot.narrative.urgentPayoffs.map((item) => toRuntimeItem(item));
  const overdueItems = snapshot.narrative.overduePayoffs.map((item) => toRuntimeItem(item));
  return {
    ledgerPendingItems: pendingItems,
    ledgerUrgentItems: urgentItems,
    ledgerOverdueItems: overdueItems,
    ledgerSummary: {
      totalCount: pendingItems.length + overdueItems.length,
      pendingCount: pendingItems.length,
      urgentCount: urgentItems.length,
      overdueCount: overdueItems.length,
      paidOffCount: 0,
      failedCount: 0,
      updatedAt: snapshot.createdAt,
    },
  };
}

export function buildStateContextBlockFromCanonical(snapshot: CanonicalStateSnapshot): string {
  const characterLines = snapshot.characters
    .slice(0, 4)
    .map((item) => takeUnique([
      item.name,
      item.currentGoal ? `goal=${item.currentGoal}` : "",
      item.currentState ? `state=${item.currentState}` : "",
      item.emotion ? `emotion=${item.emotion}` : "",
    ], 4).join(" | "))
    .filter(Boolean);
  const infoLines = snapshot.narrative.publicKnowledge
    .slice(0, 4)
    .map((item) => `reader:${item}`);
  const suspenseLines = snapshot.narrative.suspenseThreads
    .slice(0, 4)
    .map((item) => `${item}(tracked)`);
  return [
    `State snapshot summary: ${compactText(snapshot.narrative.currentChapterGoal, "no explicit chapter goal")}`,
    characterLines.length > 0 ? `Character states:\n- ${characterLines.join("\n- ")}` : "",
    infoLines.length > 0 ? `Knowledge:\n- ${infoLines.join("\n- ")}` : "",
    suspenseLines.length > 0 ? `Suspense:\n- ${suspenseLines.join("\n- ")}` : "",
  ].filter(Boolean).join("\n\n");
}
