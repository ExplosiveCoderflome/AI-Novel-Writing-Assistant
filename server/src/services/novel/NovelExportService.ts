import type { PipelineJob } from "@ai-novel/shared/types/novel";
import type { NovelExportFormat, NovelExportScope } from "@ai-novel/shared/types/novelExport";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { NovelService } from "./NovelService";
import { StoryMacroPlanService } from "./storyMacro/StoryMacroPlanService";
import { buildMarkdownExportContent, buildScopedNovelExportPayload } from "./export/novelExportFormatting";
import type {
  ExportBible,
  ExportChapter,
  ExportAuditIssue,
  ExportChapterAuditReport,
  ExportChapterPlan,
  ExportChapterPlanScene,
  ExportCharacter,
  ExportNovelDetail,
  ExportPlotBeat,
  ExportTimelineGroup,
  NovelExportBundle,
} from "./export/novelExportTypes";

interface NovelChapterRecord {
  order: number;
  title: string;
  content: string | null;
}

interface NovelRecord {
  title: string;
  description: string | null;
  chapters: NovelChapterRecord[];
}

interface NovelExportResult {
  fileName: string;
  contentType: string;
  content: string;
}

function normalizeText(input: string | null | undefined): string {
  return (input ?? "").replace(/\r\n?/g, "\n").trim();
}

function safeFileNamePart(input: string): string {
  const cleaned = input
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "novel";
}

function padTimeUnit(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(2, "0");
}

function buildExportTimestamp(input: Date = new Date()): string {
  return [
    input.getFullYear(),
    padTimeUnit(input.getMonth() + 1),
    padTimeUnit(input.getDate()),
  ].join("")
    + "-"
    + [
      padTimeUnit(input.getHours()),
      padTimeUnit(input.getMinutes()),
      padTimeUnit(input.getSeconds()),
    ].join("");
}

function buildTxtContent(novel: NovelRecord): string {
  const lines: string[] = [];
  lines.push(`《${novel.title}》`);
  lines.push("");

  const description = normalizeText(novel.description);
  if (description) {
    lines.push("【简介】");
    lines.push(description);
    lines.push("");
  }

  if (novel.chapters.length === 0) {
    lines.push("（暂无章节内容）");
    return lines.join("\n");
  }

  for (const chapter of novel.chapters) {
    lines.push("=".repeat(48));
    lines.push(`第${chapter.order}章 ${chapter.title}`);
    lines.push("-".repeat(48));
    lines.push(normalizeText(chapter.content) || "（本章暂无内容）");
    lines.push("");
  }

  return lines.join("\n");
}

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

function mapExportNovelDetail(raw: Awaited<ReturnType<NovelService["getNovelById"]>>): ExportNovelDetail {
  if (!raw) {
    throw new AppError("小说不存在。", 404);
  }
  return ({
    ...raw,
    chapters: (raw.chapters ?? []).map((chapter) => mapExportChapter(chapter)),
    characters: (raw.characters ?? []).map((character) => mapExportCharacter(character)),
    bible: mapExportBible(raw.bible ?? null),
    plotBeats: (raw.plotBeats ?? []).map((item) => mapExportPlotBeat(item)),
    bookContract: mapBookContract(raw.bookContract ?? null),
  } as unknown) as ExportNovelDetail;
}

function mapPipelineJob(row: {
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

function mapChapterPlan(row: {
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

function mapAuditReport(row: {
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

export class NovelExportService {
  private readonly novelService = new NovelService();
  private readonly storyMacroPlanService = new StoryMacroPlanService();

  private buildFileName(title: string, scope: NovelExportScope, format: Exclude<NovelExportFormat, "txt">): string {
    const extension = format === "markdown" ? "md" : "json";
    const suffix = scope === "full" ? "" : `-${scope}`;
    return `${safeFileNamePart(title)}${suffix}-${buildExportTimestamp()}.${extension}`;
  }

  private async getTxtNovelRecord(novelId: string): Promise<NovelRecord> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        title: true,
        description: true,
        chapters: {
          select: {
            order: true,
            title: true,
            content: true,
          },
          orderBy: {
            order: "asc",
          },
        },
      },
    });

    if (!novel) {
      throw new AppError("小说不存在。", 404);
    }

    return novel;
  }

  private async buildExportBundle(novelId: string): Promise<NovelExportBundle> {
    const rawNovel = await this.novelService.getNovelById(novelId);
    const novel = mapExportNovelDetail(rawNovel);

    const chapterMetaById = new Map(
      (novel.chapters ?? []).map((chapter) => [
        chapter.id,
        {
          chapterOrder: chapter.order,
          chapterTitle: chapter.title,
        },
      ]),
    );

    const [
      storyMacroPlan,
      worldSlice,
      characterRelations,
      characterCastOptions,
      volumeWorkspace,
      latestStateSnapshot,
      payoffLedger,
      qualityReport,
      latestPipelineJobRow,
      chapterPlanRows,
      auditReportRows,
      characterTimelineRows,
    ] = await Promise.all([
      this.storyMacroPlanService.getPlan(novelId),
      this.novelService.getWorldSlice(novelId),
      this.novelService.listCharacterRelations(novelId),
      this.novelService.listCharacterCastOptions(novelId),
      this.novelService.getVolumes(novelId),
      this.novelService.getLatestStateSnapshot(novelId),
      this.novelService.getPayoffLedger(novelId).catch(() => null),
      this.novelService.getQualityReport(novelId),
      prisma.generationJob.findFirst({
        where: { novelId },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.storyPlan.findMany({
        where: {
          novelId,
          level: "chapter",
        },
        include: {
          scenes: {
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.auditReport.findMany({
        where: { novelId },
        include: {
          issues: {
            orderBy: [{ createdAt: "asc" }],
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
      prisma.characterTimeline.findMany({
        where: { novelId },
        orderBy: [{ chapterOrder: "asc" }, { createdAt: "asc" }],
      }),
    ]);

    const chapterPlans = chapterPlanRows
      .map((row) => mapChapterPlan(row, chapterMetaById.get(row.chapterId ?? "") ?? {}))
      .sort((left, right) => {
        const leftOrder = left.chapterOrder ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.chapterOrder ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || left.createdAt.localeCompare(right.createdAt);
      });

    const chapterAuditReports = auditReportRows
      .map((row) => mapAuditReport(row, chapterMetaById.get(row.chapterId) ?? {}))
      .sort((left, right) => {
        const leftOrder = left.chapterOrder ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.chapterOrder ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || right.createdAt.localeCompare(left.createdAt);
      });

    const timelinesByCharacterId = new Map<string, ExportTimelineGroup>();
    for (const character of novel.characters ?? []) {
      timelinesByCharacterId.set(character.id, {
        characterId: character.id,
        characterName: character.name,
        events: [],
      });
    }
    for (const row of characterTimelineRows) {
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

    return {
      metadata: {
        exportedAt: new Date().toISOString(),
        novelId: novel.id,
        novelTitle: novel.title,
      },
      sections: {
        basic: {
          novel,
          worldSlice,
        },
        story_macro: {
          storyMacroPlan,
          bookContract: novel.bookContract ?? null,
        },
        character: {
          characters: novel.characters ?? [],
          relations: characterRelations,
          castOptions: characterCastOptions,
          timelines: Array.from(timelinesByCharacterId.values()),
        },
        outline: {
          workspace: volumeWorkspace,
        },
        structured: {
          workspace: volumeWorkspace,
        },
        chapter: {
          chapters: novel.chapters ?? [],
          chapterPlans,
          latestStateSnapshot,
        },
        pipeline: {
          latestPipelineJob: latestPipelineJobRow ? mapPipelineJob(latestPipelineJobRow) : null,
          qualityReport,
          bible: novel.bible ?? null,
          plotBeats: novel.plotBeats ?? [],
          payoffLedger,
          latestStateSnapshot,
          chapterAuditReports,
        },
      },
    };
  }

  async buildExportContent(
    novelId: string,
    format: NovelExportFormat,
    scope: NovelExportScope = "full",
  ): Promise<NovelExportResult> {
    if (format === "txt") {
      if (scope !== "full") {
        throw new AppError("TXT 导出仅支持整本书正文导出。", 400);
      }
      const novel = await this.getTxtNovelRecord(novelId);
      return {
        fileName: `${safeFileNamePart(novel.title)}-${buildExportTimestamp()}.txt`,
        contentType: "text/plain; charset=utf-8",
        content: buildTxtContent(novel),
      };
    }

    const bundle = await this.buildExportBundle(novelId);
    if (format === "json") {
      return {
        fileName: this.buildFileName(bundle.metadata.novelTitle, scope, "json"),
        contentType: "application/json; charset=utf-8",
        content: JSON.stringify(buildScopedNovelExportPayload(bundle, scope), null, 2),
      };
    }

    return {
      fileName: this.buildFileName(bundle.metadata.novelTitle, scope, "markdown"),
      contentType: "text/markdown; charset=utf-8",
      content: buildMarkdownExportContent(bundle, scope),
    };
  }
}

export const novelExportService = new NovelExportService();
