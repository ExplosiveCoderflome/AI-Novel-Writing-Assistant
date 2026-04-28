import type {
  DirectorArtifactRef,
  DirectorArtifactType,
} from "@ai-novel/shared/types/directorRuntime";
import {
  buildDirectorArtifactId,
  compactDirectorArtifactDependencies,
  normalizeDirectorArtifactTargets,
  stableDirectorContentHash,
  reconcileDirectorArtifactLedger,
  summarizeDirectorArtifactLedger,
  type DirectorArtifactLedgerSummary,
  type DirectorArtifactTarget,
} from "./DirectorArtifactLedger";
import {
  buildContinuityArtifactIdsByChapter,
  buildDraftDependency,
  buildRetentionArtifactIdsByChapter,
  pushChapterRetentionArtifacts,
  pushContinuityArtifacts,
  pushQualityFoundationArtifacts,
  pushRollingWindowReviewArtifacts,
} from "./DirectorWorkspaceQualityArtifactInventory";

interface TimestampedRow {
  id: string;
  updatedAt: Date | string;
}

interface ReaderPromiseSource {
  readingPromise?: string | null;
  protagonistFantasy?: string | null;
  coreSellingPoint?: string | null;
  chapter3Payoff?: string | null;
  chapter10Payoff?: string | null;
  chapter30Payoff?: string | null;
  escalationLadder?: string | null;
  relationshipMainline?: string | null;
}

export interface DirectorWorkspaceArtifactInventoryInput {
  novelId: string;
  hasWorldBinding: boolean;
  hasSourceKnowledge: boolean;
  hasContinuationAnalysis: boolean;
  bookContract: (TimestampedRow & ReaderPromiseSource) | null;
  storyMacro: TimestampedRow | null;
  characterCount: number;
  latestCharacter: TimestampedRow | null;
  volumePlans: Array<TimestampedRow & {
    mainPromise?: string | null;
    openPayoffsJson?: string | null;
    escalationMode?: string | null;
    protagonistChange?: string | null;
    nextVolumeHook?: string | null;
  }>;
  chapterPlanCount: number;
  volumeChapterPlans: Array<{
    id: string;
    volumeId: string;
    chapterOrder: number;
    purpose?: string | null;
    conflictLevel?: number | null;
    revealLevel?: number | null;
    mustAvoid?: string | null;
    taskSheet?: string | null;
    sceneCards?: string | null;
    payoffRefsJson?: string | null;
    updatedAt: Date | string;
  }>;
  world: (TimestampedRow & {
    status: string;
    version: number;
  }) | null;
  sourceKnowledgeDocument: (TimestampedRow & {
    activeVersionId?: string | null;
    activeVersionNumber: number;
  }) | null;
  continuationBookAnalysis: (TimestampedRow & {
    documentVersionId: string;
    status: string;
  }) | null;
  chapters: Array<{
    id: string;
    order: number;
    content?: string | null;
    taskSheet?: string | null;
    hook?: string | null;
    expectation?: string | null;
    riskFlags?: string | null;
    repairHistory?: string | null;
    chapterStatus?: string | null;
    updatedAt: Date | string;
  }>;
  qualityReports: Array<{
    id: string;
    chapterId?: string | null;
    updatedAt: Date | string;
  }>;
  auditReports: Array<{
    id: string;
    chapterId: string;
    updatedAt: Date | string;
  }>;
  storyStateSnapshots: Array<{
    id: string;
    sourceChapterId?: string | null;
    summary?: string | null;
    rawStateJson?: string | null;
    updatedAt: Date | string;
  }>;
  payoffLedgerItems: Array<{
    id: string;
    currentStatus: string;
    lastTouchedChapterId?: string | null;
    setupChapterId?: string | null;
    payoffChapterId?: string | null;
    sourceRefsJson?: string | null;
    evidenceJson?: string | null;
    riskSignalsJson?: string | null;
    updatedAt: Date | string;
  }>;
  characterResourceItems: Array<{
    id: string;
    status: string;
    ownerCharacterId?: string | null;
    holderCharacterId?: string | null;
    introducedChapterId?: string | null;
    lastTouchedChapterId?: string | null;
    riskSignalsJson?: string | null;
    updatedAt: Date | string;
  }>;
  draftedChapterCount: number;
  pendingRepairChapterCount: number;
  persistedArtifacts?: DirectorArtifactRef[] | null;
}

export interface DirectorWorkspaceArtifactInventoryResult {
  artifacts: DirectorArtifactRef[];
  ledgerSummary: DirectorArtifactLedgerSummary;
  hasChapterPlan: boolean;
}

export interface DirectorWorkspaceCoreArtifactIds {
  volumeIdByChapterOrder: Map<number, string>;
  bookContractArtifactId: string | null;
  storyMacroArtifactId: string | null;
  characterCastArtifactId: string | null;
  volumeStrategyArtifactIds: Map<string, string>;
  worldArtifactId: string | null;
  sourceKnowledgeArtifactIds: Array<string | null>;
  readerPromiseArtifactIds: Array<string | null>;
  characterGovernanceArtifactId: string | null;
}

function buildExpectedArtifactTypes(input: {
  hasBookContract: boolean;
  hasStoryMacro: boolean;
  hasCharacters: boolean;
  hasVolumeStrategy: boolean;
  hasChapterPlan: boolean;
  draftedChapterCount: number;
  pendingRepairChapterCount: number;
  hasWorldBinding: boolean;
  hasSourceKnowledge: boolean;
  hasContinuationAnalysis: boolean;
  hasStoryStateSnapshot: boolean;
  hasRollingReviewSource: boolean;
}): DirectorArtifactType[] {
  const expected: DirectorArtifactType[] = [];
  if (!input.hasBookContract) expected.push("book_contract");
  if (!input.hasStoryMacro) expected.push("story_macro");
  if (!input.hasCharacters) expected.push("character_cast");
  if (!input.hasVolumeStrategy) expected.push("volume_strategy");
  if (!input.hasChapterPlan) expected.push("chapter_task_sheet");
  if (input.hasBookContract) expected.push("reader_promise");
  if (input.hasCharacters) expected.push("character_governance_state");
  if (input.hasChapterPlan) expected.push("chapter_retention_contract");
  if (input.hasWorldBinding) expected.push("world_skeleton");
  if (input.hasSourceKnowledge || input.hasContinuationAnalysis) expected.push("source_knowledge_pack");
  if (input.hasChapterPlan && input.draftedChapterCount === 0) expected.push("chapter_draft");
  if (input.draftedChapterCount > 0 || input.hasStoryStateSnapshot) expected.push("continuity_state");
  if (input.draftedChapterCount > 0) expected.push("audit_report");
  if (input.draftedChapterCount >= 5 || input.hasRollingReviewSource) expected.push("rolling_window_review");
  if (input.pendingRepairChapterCount > 0) expected.push("repair_ticket");
  return expected;
}

export function buildDirectorWorkspaceArtifactInventory(
  input: DirectorWorkspaceArtifactInventoryInput,
): DirectorWorkspaceArtifactInventoryResult {
  const hasChapterPlan = input.chapterPlanCount > 0 || input.chapters.some((chapter) => Boolean(chapter.taskSheet?.trim()));
  const artifactTargets: DirectorArtifactTarget[] = [];
  const ids = buildCoreArtifactIds(input);
  const auditArtifactIdsByChapter = buildAuditArtifactIdsByChapter(input);
  const retentionArtifactIdsByChapter = buildRetentionArtifactIdsByChapter(input);
  const continuityArtifactIdsByChapter = buildContinuityArtifactIdsByChapter(input);

  if (input.bookContract) {
    artifactTargets.push({
      artifactType: "book_contract",
      targetType: "novel",
      targetId: input.novelId,
      contentRef: { table: "BookContract", id: input.bookContract.id },
      updatedAt: input.bookContract.updatedAt,
    });
  }
  if (input.storyMacro) {
    artifactTargets.push({
      artifactType: "story_macro",
      targetType: "novel",
      targetId: input.novelId,
      contentRef: { table: "StoryMacroPlan", id: input.storyMacro.id },
      updatedAt: input.storyMacro.updatedAt,
    });
  }
  if (input.characterCount > 0 && input.latestCharacter) {
    artifactTargets.push({
      artifactType: "character_cast",
      targetType: "novel",
      targetId: input.novelId,
      contentRef: { table: "Character", id: `novel:${input.novelId}` },
      updatedAt: input.latestCharacter.updatedAt,
      dependsOn: compactDirectorArtifactDependencies([ids.bookContractArtifactId, ids.storyMacroArtifactId]),
    });
  }
  pushQualityFoundationArtifacts(artifactTargets, input, ids);
  pushWorldAndSourceArtifacts(artifactTargets, input);
  pushVolumeStrategyArtifacts(artifactTargets, input, ids);
  pushChapterRetentionArtifacts(artifactTargets, input, ids, retentionArtifactIdsByChapter);
  pushChapterArtifacts(artifactTargets, input, ids, auditArtifactIdsByChapter, retentionArtifactIdsByChapter);
  pushContinuityArtifacts(artifactTargets, input);
  pushAuditReportArtifacts(artifactTargets, input);
  pushRollingWindowReviewArtifacts(artifactTargets, input, auditArtifactIdsByChapter, continuityArtifactIdsByChapter);

  const backfilledArtifacts = normalizeDirectorArtifactTargets(artifactTargets, input.novelId);
  const artifacts = input.persistedArtifacts?.length
    ? reconcileDirectorArtifactLedger(input.persistedArtifacts, backfilledArtifacts).artifacts
    : backfilledArtifacts;
  const ledgerSummary = summarizeDirectorArtifactLedger(artifacts, buildExpectedArtifactTypes({
    hasBookContract: Boolean(input.bookContract),
    hasStoryMacro: Boolean(input.storyMacro),
    hasCharacters: input.characterCount > 0,
    hasVolumeStrategy: input.volumePlans.length > 0,
    hasChapterPlan,
    draftedChapterCount: input.draftedChapterCount,
    pendingRepairChapterCount: input.pendingRepairChapterCount,
    hasWorldBinding: input.hasWorldBinding,
    hasSourceKnowledge: input.hasSourceKnowledge,
    hasContinuationAnalysis: input.hasContinuationAnalysis,
    hasStoryStateSnapshot: input.storyStateSnapshots.length > 0,
    hasRollingReviewSource: input.qualityReports.length + input.auditReports.length >= 5,
  }));

  return { artifacts, ledgerSummary, hasChapterPlan };
}

function buildCoreArtifactIds(input: DirectorWorkspaceArtifactInventoryInput): DirectorWorkspaceCoreArtifactIds {
  const volumeStrategyArtifactIds = new Map(input.volumePlans.map((volume) => [
    volume.id,
    buildDirectorArtifactId({
      type: "volume_strategy",
      targetType: "volume",
      targetId: volume.id,
      table: "VolumePlan",
      id: volume.id,
    }),
  ]));
  return {
    volumeIdByChapterOrder: new Map(input.volumeChapterPlans.map((plan) => [plan.chapterOrder, plan.volumeId])),
    bookContractArtifactId: input.bookContract ? buildDirectorArtifactId({
      type: "book_contract",
      targetType: "novel",
      targetId: input.novelId,
      table: "BookContract",
      id: input.bookContract.id,
    }) : null,
    storyMacroArtifactId: input.storyMacro ? buildDirectorArtifactId({
      type: "story_macro",
      targetType: "novel",
      targetId: input.novelId,
      table: "StoryMacroPlan",
      id: input.storyMacro.id,
    }) : null,
    characterCastArtifactId: input.characterCount > 0 && input.latestCharacter ? buildDirectorArtifactId({
      type: "character_cast",
      targetType: "novel",
      targetId: input.novelId,
      table: "Character",
      id: `novel:${input.novelId}`,
    }) : null,
    volumeStrategyArtifactIds,
    worldArtifactId: input.world ? buildDirectorArtifactId({
      type: "world_skeleton",
      targetType: "novel",
      targetId: input.novelId,
      table: "World",
      id: input.world.id,
    }) : null,
    sourceKnowledgeArtifactIds: [
      input.sourceKnowledgeDocument ? buildDirectorArtifactId({
        type: "source_knowledge_pack",
        targetType: "novel",
        targetId: input.novelId,
        table: "KnowledgeDocument",
        id: input.sourceKnowledgeDocument.id,
      }) : null,
      input.continuationBookAnalysis ? buildDirectorArtifactId({
        type: "source_knowledge_pack",
        targetType: "novel",
        targetId: input.novelId,
        table: "BookAnalysis",
        id: input.continuationBookAnalysis.id,
      }) : null,
    ],
    readerPromiseArtifactIds: [
      input.bookContract ? buildDirectorArtifactId({
        type: "reader_promise",
        targetType: "novel",
        targetId: input.novelId,
        table: "BookContract",
        id: input.bookContract.id,
      }) : null,
      ...input.volumePlans
        .filter(hasVolumeReaderPromiseSignal)
        .map((volume) => buildDirectorArtifactId({
          type: "reader_promise",
          targetType: "volume",
          targetId: volume.id,
          table: "VolumePlan",
          id: volume.id,
        })),
    ],
    characterGovernanceArtifactId: buildCharacterGovernanceArtifactId(input),
  };
}

function hasVolumeReaderPromiseSignal(volume: DirectorWorkspaceArtifactInventoryInput["volumePlans"][number]): boolean {
  return [volume.mainPromise, volume.openPayoffsJson, volume.escalationMode, volume.protagonistChange, volume.nextVolumeHook]
    .some((value) => typeof value === "string" && value.trim().length > 0);
}

function buildCharacterGovernanceArtifactId(input: DirectorWorkspaceArtifactInventoryInput): string | null {
  if (input.characterCount <= 0 || !input.latestCharacter) {
    return null;
  }
  const latestResource = input.characterResourceItems
    .slice()
    .sort((left, right) => timestampOf(right.updatedAt) - timestampOf(left.updatedAt))[0];
  return buildDirectorArtifactId({
    type: "character_governance_state",
    targetType: "novel",
    targetId: input.novelId,
    table: latestResource ? "CharacterResourceLedgerItem" : "Character",
    id: latestResource?.id ?? `novel:${input.novelId}`,
  });
}

function buildAuditArtifactIdsByChapter(input: DirectorWorkspaceArtifactInventoryInput): Map<string, string[]> {
  const auditArtifactIdsByChapter = new Map<string, string[]>();
  const append = (chapterId: string, id: string) => {
    auditArtifactIdsByChapter.set(chapterId, [
      ...(auditArtifactIdsByChapter.get(chapterId) ?? []),
      id,
    ]);
  };
  for (const report of input.qualityReports) {
    if (report.chapterId) {
      append(report.chapterId, buildDirectorArtifactId({
        type: "audit_report",
        targetType: "chapter",
        targetId: report.chapterId,
        table: "QualityReport",
        id: report.id,
      }));
    }
  }
  for (const report of input.auditReports) {
    append(report.chapterId, buildDirectorArtifactId({
      type: "audit_report",
      targetType: "chapter",
      targetId: report.chapterId,
      table: "AuditReport",
      id: report.id,
    }));
  }
  return auditArtifactIdsByChapter;
}

function pushWorldAndSourceArtifacts(
  artifactTargets: DirectorArtifactTarget[],
  input: DirectorWorkspaceArtifactInventoryInput,
): void {
  if (input.world) {
    artifactTargets.push({
      artifactType: "world_skeleton",
      targetType: "novel",
      targetId: input.novelId,
      contentRef: { table: "World", id: input.world.id },
      updatedAt: input.world.updatedAt,
      contentHash: stableDirectorContentHash(`${input.world.version}:${input.world.status}`),
    });
  }
  if (input.sourceKnowledgeDocument) {
    artifactTargets.push({
      artifactType: "source_knowledge_pack",
      targetType: "novel",
      targetId: input.novelId,
      contentRef: { table: "KnowledgeDocument", id: input.sourceKnowledgeDocument.id },
      updatedAt: input.sourceKnowledgeDocument.updatedAt,
      contentHash: stableDirectorContentHash(`${input.sourceKnowledgeDocument.activeVersionId ?? ""}:${input.sourceKnowledgeDocument.activeVersionNumber}`),
    });
  }
  if (input.continuationBookAnalysis) {
    artifactTargets.push({
      artifactType: "source_knowledge_pack",
      targetType: "novel",
      targetId: input.novelId,
      contentRef: { table: "BookAnalysis", id: input.continuationBookAnalysis.id },
      updatedAt: input.continuationBookAnalysis.updatedAt,
      contentHash: stableDirectorContentHash(`${input.continuationBookAnalysis.documentVersionId}:${input.continuationBookAnalysis.status}`),
    });
  }
}

function pushVolumeStrategyArtifacts(
  artifactTargets: DirectorArtifactTarget[],
  input: DirectorWorkspaceArtifactInventoryInput,
  ids: ReturnType<typeof buildCoreArtifactIds>,
): void {
  for (const volume of input.volumePlans) {
    artifactTargets.push({
      artifactType: "volume_strategy",
      targetType: "volume",
      targetId: volume.id,
      contentRef: { table: "VolumePlan", id: volume.id },
      updatedAt: volume.updatedAt,
      dependsOn: compactDirectorArtifactDependencies([
        ids.storyMacroArtifactId,
        ...ids.readerPromiseArtifactIds,
        ids.worldArtifactId,
        ...ids.sourceKnowledgeArtifactIds,
      ]),
    });
  }
}

function pushChapterArtifacts(
  artifactTargets: DirectorArtifactTarget[],
  input: DirectorWorkspaceArtifactInventoryInput,
  ids: ReturnType<typeof buildCoreArtifactIds>,
  auditArtifactIdsByChapter: Map<string, string[]>,
  retentionArtifactIdsByChapter: Map<string, string[]>,
): void {
  for (const chapter of input.chapters) {
    const taskSheetArtifactId = buildDirectorArtifactId({
      type: "chapter_task_sheet",
      targetType: "chapter",
      targetId: chapter.id,
      table: "Chapter",
      id: chapter.id,
    });
    const draftArtifactId = buildDirectorArtifactId({
      type: "chapter_draft",
      targetType: "chapter",
      targetId: chapter.id,
      table: "Chapter",
      id: chapter.id,
    });
    const chapterVolumeId = ids.volumeIdByChapterOrder.get(chapter.order);
    const chapterVolumeStrategyArtifactId = chapterVolumeId
      ? ids.volumeStrategyArtifactIds.get(chapterVolumeId)
      : null;
    if (chapter.taskSheet?.trim()) {
      artifactTargets.push({
        artifactType: "chapter_task_sheet",
        targetType: "chapter",
        targetId: chapter.id,
        contentRef: { table: "Chapter", id: chapter.id },
        updatedAt: chapter.updatedAt,
        contentHash: stableDirectorContentHash(chapter.taskSheet),
        dependsOn: compactDirectorArtifactDependencies([
          ids.characterCastArtifactId,
          ids.characterGovernanceArtifactId,
          chapterVolumeStrategyArtifactId,
          ids.worldArtifactId,
          ...ids.sourceKnowledgeArtifactIds,
        ]),
      });
    }
    if (chapter.content?.trim()) {
      artifactTargets.push({
        artifactType: "chapter_draft",
        targetType: "chapter",
        targetId: chapter.id,
        contentRef: { table: "Chapter", id: chapter.id },
        updatedAt: chapter.updatedAt,
        source: "user_edited",
        contentHash: stableDirectorContentHash(chapter.content),
        protectedUserContent: true,
        dependsOn: compactDirectorArtifactDependencies([
          chapter.taskSheet?.trim() ? taskSheetArtifactId : null,
          ...(retentionArtifactIdsByChapter.get(chapter.id) ?? []),
        ]),
      });
    }
    if (chapter.chapterStatus === "needs_repair") {
      artifactTargets.push({
        artifactType: "repair_ticket",
        targetType: "chapter",
        targetId: chapter.id,
        contentRef: { table: "Chapter", id: chapter.id },
        updatedAt: chapter.updatedAt,
        contentHash: stableDirectorContentHash(chapter.repairHistory ?? chapter.content),
        dependsOn: compactDirectorArtifactDependencies([
          chapter.content?.trim() ? draftArtifactId : null,
          ...(retentionArtifactIdsByChapter.get(chapter.id) ?? []),
          ...(auditArtifactIdsByChapter.get(chapter.id) ?? []),
        ]),
      });
    }
  }
}

function pushAuditReportArtifacts(
  artifactTargets: DirectorArtifactTarget[],
  input: DirectorWorkspaceArtifactInventoryInput,
): void {
  for (const report of input.qualityReports) {
    artifactTargets.push({
      artifactType: "audit_report",
      targetType: report.chapterId ? "chapter" : "novel",
      targetId: report.chapterId ?? input.novelId,
      contentRef: { table: "QualityReport", id: report.id },
      updatedAt: report.updatedAt,
      dependsOn: report.chapterId
        ? [buildDraftDependency(report.chapterId)]
        : [],
    });
  }
  for (const report of input.auditReports) {
    artifactTargets.push({
      artifactType: "audit_report",
      targetType: "chapter",
      targetId: report.chapterId,
      contentRef: { table: "AuditReport", id: report.id },
      updatedAt: report.updatedAt,
      dependsOn: [buildDraftDependency(report.chapterId)],
    });
  }
}

function timestampOf(value: Date | string): number {
  const normalized = value instanceof Date ? value.toISOString() : value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
