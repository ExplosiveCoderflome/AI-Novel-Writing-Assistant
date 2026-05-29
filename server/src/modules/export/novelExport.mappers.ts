import type { PipelineJob } from "@ai-novel/shared/types/novel";
import type { NovelApplicationServices } from "../../services/novel/application/NovelApplicationContracts";
import type {
  ExportAuditIssue,
  ExportBible,
  ExportChapter,
  ExportChapterAuditReport,
  ExportChapterPlan,
  ExportChapterPlanScene,
  ExportCharacter,
  ExportNovelDetail,
  ExportPlotBeat,
  ExportTimelineGroup,
} from "./novelExport.types";

function parseStringArray(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function toIsoString(value: Date | string | null | undefined): string {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return value.toISOString();
}

function mapBookContract(raw: {
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
  absoluteRedLinesJson?: string;
  absoluteRedLines?: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
} | null) {
  if (!raw) {
    return null;
  }
  return {
    id: raw.id,
    novelId: raw.novelId,
    readingPromise: raw.readingPromise,
    protagonistFantasy: raw.protagonistFantasy,
    coreSellingPoint: raw.coreSellingPoint,
    chapter3Payoff: raw.chapter3Payoff,
    chapter10Payoff: raw.chapter10Payoff,
    chapter30Payoff: raw.chapter30Payoff,
    escalationLadder: raw.escalationLadder,
    relationshipMainline: raw.relationshipMainline,
    absoluteRedLines: Array.isArray(raw.absoluteRedLines)
      ? raw.absoluteRedLines
      : parseStringArray(raw.absoluteRedLinesJson),
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
  };
}

function mapExportChapter(raw: {
  id: string;
  title: string;
  content: string | null;
  order: number;
  generationState: string;
  chapterStatus: string | null;
  targetWordCount: number | null;
  conflictLevel: number | null;
  revealLevel: number | null;
  mustAvoid: string | null;
  taskSheet: string | null;
  sceneCards: string | null;
  repairHistory: string | null;
  qualityScore: number | null;
  continuityScore: number | null;
  characterScore: number | null;
  pacingScore: number | null;
  riskFlags: string | null;
  hook: string | null;
  expectation: string | null;
  novelId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  chapterSummary?: {
    id: string;
    novelId: string;
    chapterId: string;
    summary: string;
    keyEvents: string | null;
    characterStates: string | null;
    hook: string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  } | null;
}): ExportChapter {
  return {
    id: raw.id,
    title: raw.title,
    content: raw.content,
    order: raw.order,
    generationState: raw.generationState as ExportChapter["generationState"],
    chapterStatus: (raw.chapterStatus as ExportChapter["chapterStatus"]) ?? null,
    targetWordCount: raw.targetWordCount,
    conflictLevel: raw.conflictLevel,
    revealLevel: raw.revealLevel,
    mustAvoid: raw.mustAvoid,
    taskSheet: raw.taskSheet,
    sceneCards: raw.sceneCards,
    repairHistory: raw.repairHistory,
    qualityScore: raw.qualityScore,
    continuityScore: raw.continuityScore,
    characterScore: raw.characterScore,
    pacingScore: raw.pacingScore,
    riskFlags: raw.riskFlags,
    hook: raw.hook,
    expectation: raw.expectation,
    novelId: raw.novelId,
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
    chapterSummary: raw.chapterSummary
      ? {
          id: raw.chapterSummary.id,
          novelId: raw.chapterSummary.novelId,
          chapterId: raw.chapterSummary.chapterId,
          summary: raw.chapterSummary.summary,
          keyEvents: raw.chapterSummary.keyEvents,
          characterStates: raw.chapterSummary.characterStates,
          hook: raw.chapterSummary.hook,
          createdAt: toIsoString(raw.chapterSummary.createdAt),
          updatedAt: toIsoString(raw.chapterSummary.updatedAt),
        }
      : null,
  };
}

function mapExportCharacter(raw: {
  id: string;
  name: string;
  role: string;
  gender: string;
  castRole: string | null;
  storyFunction: string | null;
  relationToProtagonist: string | null;
  personality: string | null;
  background: string | null;
  development: string | null;
  outerGoal: string | null;
  innerNeed: string | null;
  fear: string | null;
  wound: string | null;
  misbelief: string | null;
  secret: string | null;
  moralLine: string | null;
  firstImpression: string | null;
  arcStart: string | null;
  arcMidpoint: string | null;
  arcClimax: string | null;
  arcEnd: string | null;
  currentState: string | null;
  currentGoal: string | null;
  lastEvolvedAt: Date | string | null;
  novelId: string;
  baseCharacterId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): ExportCharacter {
  return {
    id: raw.id,
    name: raw.name,
    role: raw.role,
    gender: raw.gender as ExportCharacter["gender"],
    castRole: raw.castRole as ExportCharacter["castRole"],
    storyFunction: raw.storyFunction,
    relationToProtagonist: raw.relationToProtagonist,
    personality: raw.personality,
    background: raw.background,
    development: raw.development,
    outerGoal: raw.outerGoal,
    innerNeed: raw.innerNeed,
    fear: raw.fear,
    wound: raw.wound,
    misbelief: raw.misbelief,
    secret: raw.secret,
    moralLine: raw.moralLine,
    firstImpression: raw.firstImpression,
    arcStart: raw.arcStart,
    arcMidpoint: raw.arcMidpoint,
    arcClimax: raw.arcClimax,
    arcEnd: raw.arcEnd,
    currentState: raw.currentState,
    currentGoal: raw.currentGoal,
    lastEvolvedAt: toIsoString(raw.lastEvolvedAt),
    novelId: raw.novelId,
    baseCharacterId: raw.baseCharacterId,
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
  };
}

function mapExportBible(raw: {
  id: string;
  novelId: string;
  coreSetting: string | null;
  forbiddenRules: string | null;
  mainPromise: string | null;
  characterArcs: string | null;
  worldRules: string | null;
  rawContent: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
} | null): ExportBible | null {
  if (!raw) {
    return null;
  }
  return {
    id: raw.id,
    novelId: raw.novelId,
    coreSetting: raw.coreSetting,
    forbiddenRules: raw.forbiddenRules,
    mainPromise: raw.mainPromise,
    characterArcs: raw.characterArcs,
    worldRules: raw.worldRules,
    rawContent: raw.rawContent,
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
  };
}

function mapExportPlotBeat(raw: {
  id: string;
  novelId: string;
  chapterOrder: number | null;
  beatType: string;
  title: string;
  content: string;
  status: string;
  metadata: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): ExportPlotBeat {
  return {
    id: raw.id,
    novelId: raw.novelId,
    chapterOrder: raw.chapterOrder,
    beatType: raw.beatType,
    title: raw.title,
    content: raw.content,
    status: raw.status as ExportPlotBeat["status"],
    metadata: raw.metadata,
    createdAt: toIsoString(raw.createdAt),
    updatedAt: toIsoString(raw.updatedAt),
  };
}

export function mapExportNovelDetail(
  raw: NonNullable<Awaited<ReturnType<NovelApplicationServices["getNovelById"]>>>,
): ExportNovelDetail {
  return ({
    ...raw,
    chapters: (raw.chapters ?? []).map((chapter) => mapExportChapter(chapter)),
    characters: (raw.characters ?? []).map((character) => mapExportCharacter(character)),
    bible: mapExportBible(raw.bible ?? null),
    plotBeats: (raw.plotBeats ?? []).map((item) => mapExportPlotBeat(item)),
    bookContract: mapBookContract(raw.bookContract ?? null),
  } as unknown) as ExportNovelDetail;
}

export function mapPipelineJob(row: {
  id: string;
  novelId: string;
  startOrder: number;
  endOrder: number;
  runMode: string | null;
  autoReview: boolean;
  autoRepair: boolean;
  skipCompleted: boolean;
  qualityThreshold: number | null;
  repairMode: string | null;
  status: string;
  progress: number;
  completedCount: number;
  totalCount: number;
  retryCount: number;
  maxRetries: number;
  heartbeatAt: Date | null;
  currentStage: string | null;
  currentItemKey: string | null;
  currentItemLabel: string | null;
  cancelRequestedAt: Date | null;
  error: string | null;
  lastErrorType: string | null;
  payload: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): PipelineJob {
  return {
    id: row.id,
    novelId: row.novelId,
    startOrder: row.startOrder,
    endOrder: row.endOrder,
    runMode: (row.runMode as PipelineJob["runMode"]) ?? null,
    autoReview: row.autoReview,
    autoRepair: row.autoRepair,
    skipCompleted: row.skipCompleted,
    qualityThreshold: row.qualityThreshold,
    repairMode: (row.repairMode as PipelineJob["repairMode"]) ?? null,
    status: row.status as PipelineJob["status"],
    progress: row.progress,
    completedCount: row.completedCount,
    totalCount: row.totalCount,
    retryCount: row.retryCount,
    maxRetries: row.maxRetries,
    heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
    currentStage: row.currentStage,
    currentItemKey: row.currentItemKey,
    currentItemLabel: row.currentItemLabel,
    cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
    displayStatus: row.status,
    noticeCode: null,
    noticeSummary: null,
    qualityAlertDetails: [],
    error: row.error,
    lastErrorType: row.lastErrorType,
    payload: row.payload,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapChapterPlan(row: {
  id: string;
  chapterId: string | null;
  title: string;
  objective: string;
  planRole: string | null;
  phaseLabel: string | null;
  hookTarget: string | null;
  status: string;
  participantsJson: string | null;
  revealsJson: string | null;
  riskNotesJson: string | null;
  mustAdvanceJson: string | null;
  mustPreserveJson: string | null;
  sourceIssueIdsJson: string | null;
  rawPlanJson: string | null;
  scenes: Array<{
    id: string;
    sortOrder: number;
    title: string;
    objective: string | null;
    conflict: string | null;
    reveal: string | null;
    emotionBeat: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}, chapterMeta: { chapterOrder?: number; chapterTitle?: string }): ExportChapterPlan {
  const scenes: ExportChapterPlanScene[] = row.scenes.map((scene) => ({
    id: scene.id,
    sortOrder: scene.sortOrder,
    title: scene.title,
    objective: scene.objective,
    conflict: scene.conflict,
    reveal: scene.reveal,
    emotionBeat: scene.emotionBeat,
    createdAt: scene.createdAt.toISOString(),
    updatedAt: scene.updatedAt.toISOString(),
  }));

  return {
    id: row.id,
    chapterId: row.chapterId,
    chapterOrder: chapterMeta.chapterOrder ?? null,
    chapterTitle: chapterMeta.chapterTitle ?? null,
    title: row.title,
    objective: row.objective,
    planRole: row.planRole,
    phaseLabel: row.phaseLabel,
    hookTarget: row.hookTarget,
    status: row.status,
    participantsJson: row.participantsJson,
    revealsJson: row.revealsJson,
    riskNotesJson: row.riskNotesJson,
    mustAdvanceJson: row.mustAdvanceJson,
    mustPreserveJson: row.mustPreserveJson,
    sourceIssueIdsJson: row.sourceIssueIdsJson,
    rawPlanJson: row.rawPlanJson,
    scenes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapAuditReport(row: {
  id: string;
  chapterId: string;
  auditType: string;
  overallScore: number | null;
  summary: string | null;
  issues: Array<{
    id: string;
    auditType: string;
    severity: string;
    code: string;
    description: string;
    evidence: string;
    fixSuggestion: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}, chapterMeta: { chapterOrder?: number; chapterTitle?: string }): ExportChapterAuditReport {
  const issues: ExportAuditIssue[] = row.issues.map((issue) => ({
    id: issue.id,
    auditType: issue.auditType,
    severity: issue.severity,
    code: issue.code,
    description: issue.description,
    evidence: issue.evidence,
    fixSuggestion: issue.fixSuggestion,
    status: issue.status,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
  }));

  return {
    id: row.id,
    chapterId: row.chapterId,
    chapterOrder: chapterMeta.chapterOrder ?? null,
    chapterTitle: chapterMeta.chapterTitle ?? null,
    auditType: row.auditType,
    overallScore: row.overallScore,
    summary: row.summary,
    issues,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function buildExportTimelineGroups(
  characters: ExportCharacter[],
  rows: Array<{
    id: string;
    novelId: string;
    characterId: string;
    chapterId: string | null;
    chapterOrder: number | null;
    title: string;
    content: string;
    source: string;
    createdAt: Date;
    updatedAt: Date;
  }>,
): ExportTimelineGroup[] {
  const timelinesByCharacterId = new Map<string, ExportTimelineGroup>();
  for (const character of characters) {
    timelinesByCharacterId.set(character.id, {
      characterId: character.id,
      characterName: character.name,
      events: [],
    });
  }
  for (const row of rows) {
    const group = timelinesByCharacterId.get(row.characterId);
    if (!group) {
      continue;
    }
    group.events.push({
      id: row.id,
      novelId: row.novelId,
      characterId: row.characterId,
      chapterId: row.chapterId,
      chapterOrder: row.chapterOrder,
      title: row.title,
      content: row.content,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  return Array.from(timelinesByCharacterId.values());
}
