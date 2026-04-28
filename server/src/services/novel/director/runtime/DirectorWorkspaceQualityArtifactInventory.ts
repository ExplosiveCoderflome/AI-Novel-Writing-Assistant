import {
  buildDirectorArtifactId,
  compactDirectorArtifactDependencies,
  stableDirectorContentHash,
  type DirectorArtifactTarget,
} from "./DirectorArtifactLedger";
import type {
  DirectorWorkspaceArtifactInventoryInput,
  DirectorWorkspaceCoreArtifactIds,
} from "./DirectorWorkspaceArtifactInventory";

export function buildRetentionArtifactIdsByChapter(
  input: DirectorWorkspaceArtifactInventoryInput,
): Map<string, string[]> {
  const chapterIdByOrder = new Map(input.chapters.map((chapter) => [chapter.order, chapter.id]));
  const result = new Map<string, string[]>();
  const append = (chapterId: string, artifactId: string) => {
    result.set(chapterId, [...(result.get(chapterId) ?? []), artifactId]);
  };
  for (const plan of input.volumeChapterPlans) {
    const chapterId = chapterIdByOrder.get(plan.chapterOrder);
    if (!chapterId || !hasRetentionSignal(plan)) {
      continue;
    }
    append(chapterId, buildDirectorArtifactId({
      type: "chapter_retention_contract",
      targetType: "chapter",
      targetId: chapterId,
      table: "VolumeChapterPlan",
      id: plan.id,
    }));
  }
  for (const chapter of input.chapters) {
    if (!hasRetentionSignal(chapter)) {
      continue;
    }
    append(chapter.id, buildDirectorArtifactId({
      type: "chapter_retention_contract",
      targetType: "chapter",
      targetId: chapter.id,
      table: "Chapter",
      id: chapter.id,
    }));
  }
  return result;
}

export function buildContinuityArtifactIdsByChapter(input: DirectorWorkspaceArtifactInventoryInput): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const snapshot of input.storyStateSnapshots) {
    if (!snapshot.sourceChapterId) {
      continue;
    }
    result.set(snapshot.sourceChapterId, [
      ...(result.get(snapshot.sourceChapterId) ?? []),
      buildDirectorArtifactId({
        type: "continuity_state",
        targetType: "chapter",
        targetId: snapshot.sourceChapterId,
        table: "StoryStateSnapshot",
        id: snapshot.id,
      }),
    ]);
  }
  return result;
}

export function pushQualityFoundationArtifacts(
  artifactTargets: DirectorArtifactTarget[],
  input: DirectorWorkspaceArtifactInventoryInput,
  ids: DirectorWorkspaceCoreArtifactIds,
): void {
  if (input.bookContract) {
    artifactTargets.push({
      artifactType: "reader_promise",
      targetType: "novel",
      targetId: input.novelId,
      contentRef: { table: "BookContract", id: input.bookContract.id },
      updatedAt: input.bookContract.updatedAt,
      contentHash: stableDirectorContentHash(compactHashParts([
        input.bookContract.readingPromise,
        input.bookContract.protagonistFantasy,
        input.bookContract.coreSellingPoint,
        input.bookContract.chapter3Payoff,
        input.bookContract.chapter10Payoff,
        input.bookContract.chapter30Payoff,
        input.bookContract.escalationLadder,
        input.bookContract.relationshipMainline,
      ])),
      dependsOn: compactDirectorArtifactDependencies([ids.bookContractArtifactId]),
    });
  }
  for (const volume of input.volumePlans) {
    if (!compactHashParts([volume.mainPromise, volume.openPayoffsJson, volume.escalationMode, volume.nextVolumeHook])) {
      continue;
    }
    artifactTargets.push({
      artifactType: "reader_promise",
      targetType: "volume",
      targetId: volume.id,
      contentRef: { table: "VolumePlan", id: volume.id },
      updatedAt: volume.updatedAt,
      contentHash: stableDirectorContentHash(compactHashParts([
        volume.mainPromise,
        volume.openPayoffsJson,
        volume.escalationMode,
        volume.protagonistChange,
        volume.nextVolumeHook,
      ])),
      dependsOn: compactDirectorArtifactDependencies([ids.bookContractArtifactId, ids.storyMacroArtifactId]),
    });
  }
  for (const item of input.payoffLedgerItems) {
    const target = resolvePayoffTarget(input.novelId, item);
    artifactTargets.push({
      artifactType: "reader_promise",
      targetType: target.targetType,
      targetId: target.targetId,
      contentRef: { table: "PayoffLedgerItem", id: item.id },
      updatedAt: item.updatedAt,
      status: item.currentStatus === "failed" ? "stale" : "active",
      contentHash: stableDirectorContentHash(compactHashParts([
        item.currentStatus,
        item.lastTouchedChapterId,
        item.setupChapterId,
        item.payoffChapterId,
        item.sourceRefsJson,
        item.evidenceJson,
        item.riskSignalsJson,
      ])),
      dependsOn: compactDirectorArtifactDependencies([
        ids.bookContractArtifactId,
        ids.storyMacroArtifactId,
        item.lastTouchedChapterId ? buildDraftDependency(item.lastTouchedChapterId) : null,
        item.setupChapterId ? buildDraftDependency(item.setupChapterId) : null,
        item.payoffChapterId ? buildDraftDependency(item.payoffChapterId) : null,
      ]),
    });
  }
  if (ids.characterGovernanceArtifactId) {
    const latestResource = input.characterResourceItems
      .slice()
      .sort((left, right) => timestampOf(right.updatedAt) - timestampOf(left.updatedAt))[0];
    artifactTargets.push({
      artifactType: "character_governance_state",
      targetType: "novel",
      targetId: input.novelId,
      contentRef: { table: latestResource ? "CharacterResourceLedgerItem" : "Character", id: latestResource?.id ?? `novel:${input.novelId}` },
      updatedAt: latestResource?.updatedAt ?? input.latestCharacter?.updatedAt,
      contentHash: stableDirectorContentHash(compactHashParts([
        String(input.characterCount),
        latestResource?.status,
        latestResource?.riskSignalsJson,
        latestResource?.ownerCharacterId,
        latestResource?.holderCharacterId,
        latestResource?.lastTouchedChapterId,
      ])),
      dependsOn: compactDirectorArtifactDependencies([
        ids.characterCastArtifactId,
        ids.storyMacroArtifactId,
      ]),
    });
  }
}

export function pushChapterRetentionArtifacts(
  artifactTargets: DirectorArtifactTarget[],
  input: DirectorWorkspaceArtifactInventoryInput,
  ids: DirectorWorkspaceCoreArtifactIds,
  retentionArtifactIdsByChapter: Map<string, string[]>,
): void {
  const chapterIdByOrder = new Map(input.chapters.map((chapter) => [chapter.order, chapter.id]));
  for (const plan of input.volumeChapterPlans) {
    const chapterId = chapterIdByOrder.get(plan.chapterOrder);
    if (!chapterId || !hasRetentionSignal(plan)) {
      continue;
    }
    const chapterVolumeStrategyArtifactId = ids.volumeStrategyArtifactIds.get(plan.volumeId) ?? null;
    artifactTargets.push({
      artifactType: "chapter_retention_contract",
      targetType: "chapter",
      targetId: chapterId,
      contentRef: { table: "VolumeChapterPlan", id: plan.id },
      updatedAt: plan.updatedAt,
      contentHash: stableDirectorContentHash(compactHashParts([
        plan.purpose,
        plan.conflictLevel,
        plan.revealLevel,
        plan.mustAvoid,
        plan.taskSheet,
        plan.sceneCards,
        plan.payoffRefsJson,
      ])),
      dependsOn: compactDirectorArtifactDependencies([
        chapterVolumeStrategyArtifactId,
        ids.characterGovernanceArtifactId,
        ...ids.readerPromiseArtifactIds,
        ids.worldArtifactId,
      ]),
    });
  }
  for (const chapter of input.chapters) {
    if (!hasRetentionSignal(chapter)) {
      continue;
    }
    const taskSheetArtifactId = buildDirectorArtifactId({
      type: "chapter_task_sheet",
      targetType: "chapter",
      targetId: chapter.id,
      table: "Chapter",
      id: chapter.id,
    });
    artifactTargets.push({
      artifactType: "chapter_retention_contract",
      targetType: "chapter",
      targetId: chapter.id,
      contentRef: { table: "Chapter", id: chapter.id },
      updatedAt: chapter.updatedAt,
      contentHash: stableDirectorContentHash(compactHashParts([
        chapter.taskSheet,
        chapter.hook,
        chapter.expectation,
        chapter.riskFlags,
      ])),
      dependsOn: compactDirectorArtifactDependencies([
        chapter.taskSheet?.trim() ? taskSheetArtifactId : null,
        ids.characterGovernanceArtifactId,
        ...ids.readerPromiseArtifactIds,
      ]),
    });
  }

  for (const [chapterId, retentionIds] of retentionArtifactIdsByChapter) {
    retentionArtifactIdsByChapter.set(chapterId, [...new Set(retentionIds)]);
  }
}

export function pushContinuityArtifacts(
  artifactTargets: DirectorArtifactTarget[],
  input: DirectorWorkspaceArtifactInventoryInput,
): void {
  for (const snapshot of input.storyStateSnapshots) {
    artifactTargets.push({
      artifactType: "continuity_state",
      targetType: snapshot.sourceChapterId ? "chapter" : "novel",
      targetId: snapshot.sourceChapterId ?? input.novelId,
      contentRef: { table: "StoryStateSnapshot", id: snapshot.id },
      updatedAt: snapshot.updatedAt,
      contentHash: stableDirectorContentHash(compactHashParts([
        snapshot.summary,
        snapshot.rawStateJson,
      ])),
      dependsOn: compactDirectorArtifactDependencies([
        snapshot.sourceChapterId ? buildDraftDependency(snapshot.sourceChapterId) : null,
      ]),
    });
  }
}

export function pushRollingWindowReviewArtifacts(
  artifactTargets: DirectorArtifactTarget[],
  input: DirectorWorkspaceArtifactInventoryInput,
  auditArtifactIdsByChapter: Map<string, string[]>,
  continuityArtifactIdsByChapter: Map<string, string[]>,
): void {
  const reviewedChapterIds = [...new Set([
    ...input.qualityReports.flatMap((report) => report.chapterId ? [report.chapterId] : []),
    ...input.auditReports.map((report) => report.chapterId),
  ])].slice(0, 5);
  const reviewSources = [
    ...input.qualityReports.map((report) => ({ ...report, table: "QualityReport" })),
    ...input.auditReports.map((report) => ({ ...report, table: "AuditReport" })),
  ];
  const latestReport = reviewSources
    .slice()
    .sort((left, right) => timestampOf(right.updatedAt) - timestampOf(left.updatedAt))[0];
  if (!latestReport || reviewedChapterIds.length < 2) {
    return;
  }
  artifactTargets.push({
    artifactType: "rolling_window_review",
    targetType: "novel",
    targetId: input.novelId,
    contentRef: { table: latestReport.table, id: latestReport.id },
    updatedAt: latestReport.updatedAt,
    contentHash: stableDirectorContentHash(compactHashParts([
      ...reviewedChapterIds,
      ...input.qualityReports.map((report) => report.id),
      ...input.auditReports.map((report) => report.id),
    ])),
    dependsOn: compactDirectorArtifactDependencies([
      ...reviewedChapterIds.flatMap((chapterId) => auditArtifactIdsByChapter.get(chapterId) ?? []),
      ...reviewedChapterIds.flatMap((chapterId) => continuityArtifactIdsByChapter.get(chapterId) ?? []),
    ]),
  });
}

export function buildDraftDependency(chapterId: string) {
  return {
    artifactId: buildDirectorArtifactId({
      type: "chapter_draft",
      targetType: "chapter",
      targetId: chapterId,
      table: "Chapter",
      id: chapterId,
    }),
    version: 1,
  };
}

export function resolvePayoffTarget(
  novelId: string,
  item: {
    lastTouchedChapterId?: string | null;
    setupChapterId?: string | null;
    payoffChapterId?: string | null;
  },
): { targetType: "novel" | "chapter"; targetId: string } {
  const chapterId = item.payoffChapterId ?? item.lastTouchedChapterId ?? item.setupChapterId;
  return chapterId
    ? { targetType: "chapter", targetId: chapterId }
    : { targetType: "novel", targetId: novelId };
}

function hasRetentionSignal(input: {
  purpose?: string | null;
  conflictLevel?: number | null;
  revealLevel?: number | null;
  mustAvoid?: string | null;
  taskSheet?: string | null;
  sceneCards?: string | null;
  payoffRefsJson?: string | null;
  hook?: string | null;
  expectation?: string | null;
  riskFlags?: string | null;
}): boolean {
  return Boolean(compactHashParts([
    input.purpose,
    input.conflictLevel,
    input.revealLevel,
    input.mustAvoid,
    input.taskSheet,
    input.sceneCards,
    input.payoffRefsJson,
    input.hook,
    input.expectation,
    input.riskFlags,
  ]));
}

function compactHashParts(parts: Array<string | number | null | undefined>): string {
  return parts
    .filter((part) => part !== null && part !== undefined && String(part).trim().length > 0)
    .map((part) => String(part).trim())
    .join("\n");
}

function timestampOf(value: Date | string): number {
  const normalized = value instanceof Date ? value.toISOString() : value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
