import { prisma } from "../../db/prisma";
import {
  DirectorFactSummaryService,
  type DirectorFactBaseSummary,
} from "./director/projections/DirectorFactSummaryService";
import {
  ChapterExecutionProgressInspector,
  type ChapterExecutionProgressSummary,
} from "./director/runtime/ChapterExecutionProgressInspector";
import { parseStructuredOutline } from "./novelProductionHelpers";

export interface ProductionStatusStage {
  key: string;
  label: string;
  status: "pending" | "completed" | "running" | "blocked";
  detail: string | null;
}

export interface ProductionFactProgress {
  planningCompleted: number;
  planningTotal: number;
  planningPercent: number;
  plannedChapterCount: number;
  chapterCount: number;
  draftedChapterCount: number;
  reviewedChapterCount: number;
  approvedChapterCount: number;
  committedChapterCount: number;
  completedChapters: number;
  needsRepairChapters: number;
  currentChapterOrder: number | null;
  activeChapterOrder: number | null;
  chapterExecutionPercent: number;
  qualityRepairPercent: number;
  totalPercent: number;
  facts: {
    hasWorld: boolean;
    hasStoryMacro: boolean;
    hasBookContract: boolean;
    hasStoryBible: boolean;
    hasCharacters: boolean;
    characterCount: number;
    hasVolumeStrategy: boolean;
    volumeCount: number;
    hasChapterTaskSheets: boolean;
    syncedChapterCount: number;
  };
}

export interface ProductionRuntimeStatus {
  jobId: string | null;
  status: string | null;
  state: "idle" | "queued" | "running" | "succeeded" | "failed" | "cancelled" | "unknown";
  label: string;
  failureSummary: string | null;
  isActive: boolean;
  blocksFactProgress: false;
}

type ProductionChapterProgress = DirectorFactBaseSummary["chapterExecution"] | ChapterExecutionProgressSummary | null;

interface ProductionNovelWorldState {
  id: string;
  title: string | null;
  coverSummary: string | null;
  sourceWorldId: string | null;
  hasStructuredData: boolean;
  hasStorySlice: boolean;
}

export interface ProductionStatusResult {
  novelId: string;
  title: string;
  worldId: string | null;
  worldName: string | null;
  chapterCount: number;
  targetChapterCount: number;
  assetStages: ProductionStatusStage[];
  assetsReady: boolean;
  pipelineReady: boolean;
  pipelineJobId: string | null;
  pipelineStatus: string | null;
  failureSummary: string | null;
  recoveryHint: string | null;
  currentStage: string;
  summary: string;
  progressBasis: "facts";
  factProgress: ProductionFactProgress;
  runtimeStatus: ProductionRuntimeStatus;
}

export class NovelProductionStatusService {
  private readonly db: Pick<typeof prisma, "novel">;
  private readonly factSummaryService: Pick<DirectorFactSummaryService, "getBaseSummary"> | null;
  private readonly chapterInspector: Pick<ChapterExecutionProgressInspector, "inspectNovel"> | null;
  private readonly novelWorldReader: ((novelId: string) => Promise<ProductionNovelWorldState | null>) | null;

  constructor(input: {
    db?: Pick<typeof prisma, "novel">;
    factSummaryService?: Pick<DirectorFactSummaryService, "getBaseSummary">;
    chapterInspector?: Pick<ChapterExecutionProgressInspector, "inspectNovel">;
    novelWorldReader?: (novelId: string) => Promise<ProductionNovelWorldState | null>;
  } = {}) {
    this.db = input.db ?? prisma;
    this.factSummaryService = input.factSummaryService ?? null;
    this.chapterInspector = input.chapterInspector ?? null;
    this.novelWorldReader = input.novelWorldReader ?? null;
  }

  async getNovelProductionStatus(input: {
    novelId?: string;
    title?: string;
    targetChapterCount?: number;
  }): Promise<ProductionStatusResult> {
    const novel = input.novelId
      ? await this.db.novel.findUnique({
          where: { id: input.novelId },
          include: {
            world: { select: { id: true, name: true } },
            bible: true,
            characters: { select: { id: true } },
            chapters: { select: { id: true, order: true }, orderBy: { order: "asc" } },
            generationJobs: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        })
      : await this.db.novel.findFirst({
          where: {
            title: {
              contains: input.title?.trim() ?? "",
            },
          },
          include: {
            world: { select: { id: true, name: true } },
            bible: true,
            characters: { select: { id: true } },
            chapters: { select: { id: true, order: true }, orderBy: { order: "asc" } },
            generationJobs: { orderBy: { createdAt: "desc" }, take: 1 },
          },
          orderBy: { updatedAt: "desc" },
        });
    if (!novel) {
      throw new Error("未找到当前小说。");
    }

    const [factSummary, inspectedChapterProgress] = await Promise.all([
      this.loadDirectorFactSummary(novel.id),
      this.inspectChapterProgress(novel.id),
    ]);
    const novelWorldState = await this.loadNovelWorldState(novel.id);
    const worldState = resolveProductionWorldState(novel, novelWorldState);
    const chapterProgress = factSummary?.chapterExecution ?? inspectedChapterProgress;
    const structuredOutlineChapters = novel.structuredOutline?.trim()
      ? parseStructuredOutline(novel.structuredOutline).length
      : 0;
    const plannedChapterCount = factSummary?.outline.plannedChapterCount
      && factSummary.outline.plannedChapterCount > 0
      ? factSummary.outline.plannedChapterCount
      : structuredOutlineChapters;
    const targetChapterCount = input.targetChapterCount
      ?? (plannedChapterCount > 0 ? plannedChapterCount : null)
      ?? (novel.chapters.length > 0 ? novel.chapters.length : null)
      ?? 20;
    const latestJob = novel.generationJobs[0] ?? null;
    const chapterCount = novel.chapters.length;
    const runtimeStatus = buildRuntimeStatus(latestJob);
    const factProgress = buildFactProgress({
      novel,
      factSummary,
      chapterProgress,
      targetChapterCount,
      structuredOutlineChapters,
      hasActiveWorld: worldState.hasWorld,
    });

    const assetStages: ProductionStatusStage[] = [
      { key: "novel_workspace", label: "小说工作区", status: "completed", detail: `《${novel.title}》` },
      { key: "world", label: "本书世界", status: factProgress.facts.hasWorld ? "completed" : "pending", detail: worldState.worldName },
      { key: "story_macro", label: "故事宏观规划", status: factProgress.facts.hasStoryMacro ? "completed" : "pending", detail: factProgress.facts.hasStoryMacro ? "宏观规划可用" : null },
      { key: "book_contract", label: "Book Contract", status: factProgress.facts.hasBookContract ? "completed" : "pending", detail: factProgress.facts.hasBookContract ? "书级写法约定可用" : null },
      { key: "characters", label: "核心角色", status: factProgress.facts.hasCharacters ? "completed" : "pending", detail: factProgress.facts.characterCount > 0 ? `${factProgress.facts.characterCount} 个角色` : null },
      { key: "story_bible", label: "小说圣经", status: factProgress.facts.hasStoryBible || factProgress.facts.hasBookContract ? "completed" : "pending", detail: novel.bible?.mainPromise ?? novel.bible?.coreSetting ?? (factProgress.facts.hasBookContract ? "书级事实可用" : null) },
      { key: "volume_strategy", label: "卷规划", status: factProgress.facts.hasVolumeStrategy ? "completed" : "pending", detail: factProgress.facts.volumeCount > 0 ? `${factProgress.facts.volumeCount} 卷` : null },
      { key: "outline", label: "发展走向", status: novel.outline?.trim() || factProgress.facts.hasVolumeStrategy ? "completed" : "pending", detail: novel.outline?.trim() ? "已生成发展走向" : (factProgress.facts.hasVolumeStrategy ? "卷规划可用" : null) },
      { key: "structured_outline", label: "结构化大纲", status: novel.structuredOutline?.trim() || factProgress.plannedChapterCount > 0 ? "completed" : "pending", detail: factProgress.plannedChapterCount > 0 ? `${factProgress.plannedChapterCount} 章规划` : null },
      { key: "chapters", label: "章节任务单", status: factProgress.facts.hasChapterTaskSheets ? "completed" : "pending", detail: chapterCount > 0 ? `${chapterCount}/${targetChapterCount} 章` : null },
      {
        key: "chapter_drafts",
        label: "章节正文",
        status: factProgress.draftedChapterCount >= targetChapterCount && targetChapterCount > 0
          ? "completed"
          : factProgress.draftedChapterCount > 0
            ? "running"
            : "pending",
        detail: `${factProgress.draftedChapterCount}/${targetChapterCount} 章`,
      },
      {
        key: "quality_repair",
        label: "审校与修复",
        status: factProgress.needsRepairChapters > 0
          ? "blocked"
          : factProgress.reviewedChapterCount > 0
            ? "completed"
            : factProgress.draftedChapterCount > 0
              ? "running"
              : "pending",
        detail: factProgress.needsRepairChapters > 0
          ? `${factProgress.needsRepairChapters} 章待修复`
          : factProgress.reviewedChapterCount > 0
            ? `${factProgress.reviewedChapterCount} 章完成审校`
            : null,
      },
      {
        key: "state_commit",
        label: "状态提交",
        status: factProgress.committedChapterCount >= targetChapterCount && targetChapterCount > 0
          ? "completed"
          : factProgress.committedChapterCount > 0
            ? "running"
            : "pending",
        detail: factProgress.committedChapterCount > 0 ? `${factProgress.committedChapterCount}/${targetChapterCount} 章` : null,
      },
      {
        key: "pipeline",
        label: "后台任务",
        status: runtimeStatus.state === "running" || runtimeStatus.state === "queued"
          ? "running"
          : runtimeStatus.state === "succeeded"
            ? "completed"
            : runtimeStatus.state === "failed" || runtimeStatus.state === "cancelled"
              ? "blocked"
              : "pending",
        detail: runtimeStatus.status ? `后台状态：${runtimeStatus.status}` : null,
      },
    ];

    const planningAssetKeys = new Set([
      "novel_workspace",
      "world",
      "story_macro",
      "book_contract",
      "characters",
      "story_bible",
      "volume_strategy",
      "outline",
      "structured_outline",
      "chapters",
    ]);
    const assetsReady = assetStages
      .filter((stage) => planningAssetKeys.has(stage.key))
      .every((stage) => stage.status === "completed");
    const pipelineReady = assetsReady && factProgress.facts.hasChapterTaskSheets;

    const currentStage = resolveFactCurrentStage(factProgress, targetChapterCount);

    const failureSummary = runtimeStatus.failureSummary;
    const recoveryHint = buildRecoveryHint(factProgress, targetChapterCount, runtimeStatus, pipelineReady);
    const summary = buildSummary(novel.title, currentStage, factProgress, targetChapterCount, runtimeStatus);

    return {
      novelId: novel.id,
      title: novel.title,
      worldId: worldState.worldId,
      worldName: worldState.worldName,
      chapterCount,
      targetChapterCount,
      assetStages,
      assetsReady,
      pipelineReady,
      pipelineJobId: latestJob?.id ?? null,
      pipelineStatus: latestJob?.status ?? null,
      failureSummary,
      recoveryHint,
      currentStage,
      summary,
      progressBasis: "facts",
      factProgress,
      runtimeStatus,
    };
  }

  private async loadDirectorFactSummary(novelId: string): Promise<DirectorFactBaseSummary | null> {
    try {
      const factSummaryService = this.factSummaryService ?? new DirectorFactSummaryService();
      return await factSummaryService.getBaseSummary({
        taskId: "__novel_production_status__",
        novelId,
      });
    } catch {
      return null;
    }
  }

  private async inspectChapterProgress(novelId: string): Promise<ChapterExecutionProgressSummary | null> {
    try {
      const inspector = this.chapterInspector ?? new ChapterExecutionProgressInspector();
      return await inspector.inspectNovel(novelId);
    } catch {
      return null;
    }
  }

  private async loadNovelWorldState(novelId: string): Promise<ProductionNovelWorldState | null> {
    if (this.novelWorldReader) {
      return this.novelWorldReader(novelId);
    }
    const [row = null] = await prisma.$queryRaw<ProductionNovelWorldState[]>`
      SELECT
        "id",
        "title",
        "coverSummary",
        "sourceWorldId",
        CASE WHEN "structuredDataJson" IS NOT NULL AND length(trim("structuredDataJson")) > 0 THEN true ELSE false END AS "hasStructuredData",
        CASE WHEN "storySliceJson" IS NOT NULL AND length(trim("storySliceJson")) > 0 THEN true ELSE false END AS "hasStorySlice"
      FROM "NovelWorld"
      WHERE "novelId" = ${novelId}
      LIMIT 1
    `;
    return row;
  }
}

export const novelProductionStatusService = new NovelProductionStatusService();

function percent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function buildRuntimeStatus(job: {
  id: string;
  status: string;
  error?: string | null;
} | null): ProductionRuntimeStatus {
  const status = job?.status ?? null;
  const state = status === "queued"
    ? "queued"
    : status === "running"
      ? "running"
      : status === "succeeded"
        ? "succeeded"
        : status === "failed"
          ? "failed"
          : status === "cancelled"
            ? "cancelled"
            : status
              ? "unknown"
              : "idle";
  const label = state === "idle"
    ? "后台任务未启动"
    : state === "queued"
      ? "后台任务排队中"
      : state === "running"
        ? "后台任务运行中"
        : state === "succeeded"
          ? "后台任务执行完成"
          : state === "failed"
            ? "后台任务失败"
            : state === "cancelled"
              ? "后台任务取消"
              : `后台状态：${status}`;
  return {
    jobId: job?.id ?? null,
    status,
    state,
    label,
    failureSummary: state === "failed" ? job?.error ?? "后台任务失败。" : null,
    isActive: state === "queued" || state === "running",
    blocksFactProgress: false,
  };
}

function buildFactProgress(input: {
  novel: {
    world: { id: string; name: string } | null;
    bible: { mainPromise?: string | null; coreSetting?: string | null } | null;
    characters: Array<{ id: string }>;
    chapters: Array<{ id: string; order: number }>;
  };
  factSummary: DirectorFactBaseSummary | null;
  chapterProgress: ProductionChapterProgress;
  targetChapterCount: number;
  structuredOutlineChapters: number;
  hasActiveWorld: boolean;
}): ProductionFactProgress {
  const factSummary = input.factSummary;
  const chapterProgress = input.chapterProgress;
  const characterCount = Math.max(input.novel.characters.length, factSummary?.book.characterCount ?? 0);
  const syncedChapterCount = Math.max(input.novel.chapters.length, factSummary?.outline.syncedChapterCount ?? 0);
  const plannedChapterCount = factSummary?.outline.plannedChapterCount
    && factSummary.outline.plannedChapterCount > 0
    ? factSummary.outline.plannedChapterCount
    : input.structuredOutlineChapters;
  const reviewedChapterCount = factSummary?.repair.reviewedChapterCount
    ?? chapterProgress?.chapters?.filter((chapter) => chapter.completedStages.includes("audit_completed")).length
    ?? 0;
  const committedChapterCount = factSummary?.repair.committedChapterCount
    ?? chapterProgress?.chapters?.filter((chapter) => chapter.completedStages.includes("chapter_state_committed")).length
    ?? 0;
  const facts = {
    hasWorld: input.hasActiveWorld,
    hasStoryMacro: Boolean(factSummary?.book.hasStoryMacro),
    hasBookContract: Boolean(factSummary?.book.hasBookContract),
    hasStoryBible: Boolean(input.novel.bible),
    hasCharacters: characterCount > 0,
    characterCount,
    hasVolumeStrategy: Boolean(factSummary?.outline.hasVolumeStrategy),
    volumeCount: factSummary?.outline.volumeCount ?? 0,
    hasChapterTaskSheets: syncedChapterCount > 0 && (
      Boolean(factSummary?.outline.chapterListReady)
      || Boolean(factSummary?.outline.chapterDetailReady)
      || input.novel.chapters.length > 0
    ),
    syncedChapterCount,
  };
  const planningChecks = [
    facts.hasWorld,
    facts.hasStoryMacro,
    facts.hasBookContract || facts.hasStoryBible,
    facts.hasCharacters,
    facts.hasVolumeStrategy || plannedChapterCount > 0,
    facts.hasChapterTaskSheets,
  ];
  const draftedChapterCount = chapterProgress?.draftedChapterCount ?? 0;
  const approvedChapterCount = chapterProgress?.approvedChapterCount ?? 0;
  const completedChapters = chapterProgress?.completedChapters ?? approvedChapterCount;
  const needsRepairChapters = chapterProgress?.needsRepairChapters ?? factSummary?.repair.needsRepairChapterCount ?? 0;
  const planningCompleted = planningChecks.filter(Boolean).length;
  const planningPercent = percent(planningCompleted / planningChecks.length);
  const chapterExecutionPercent = percent(chapterProgress?.ratio ?? (
    input.targetChapterCount > 0 ? draftedChapterCount / input.targetChapterCount : 0
  ));
  const qualityRepairPercent = draftedChapterCount === 0
    ? 0
    : percent((draftedChapterCount - needsRepairChapters) / draftedChapterCount);
  return {
    planningCompleted,
    planningTotal: planningChecks.length,
    planningPercent,
    plannedChapterCount,
    chapterCount: input.novel.chapters.length,
    draftedChapterCount,
    reviewedChapterCount,
    approvedChapterCount,
    committedChapterCount,
    completedChapters,
    needsRepairChapters,
    currentChapterOrder: chapterProgress?.currentChapterOrder ?? null,
    activeChapterOrder: chapterProgress?.activeChapterOrder ?? null,
    chapterExecutionPercent,
    qualityRepairPercent,
    totalPercent: Math.round((planningPercent * 0.35) + (chapterExecutionPercent * 0.5) + (qualityRepairPercent * 0.15)),
    facts,
  };
}

function resolveProductionWorldState(
  novel: { world: { id: string; name: string } | null },
  novelWorld: ProductionNovelWorldState | null,
): { hasWorld: boolean; worldId: string | null; worldName: string | null } {
  if (novelWorld && (novelWorld.hasStructuredData || novelWorld.hasStorySlice || novelWorld.title || novelWorld.coverSummary)) {
    return {
      hasWorld: true,
      worldId: novelWorld.sourceWorldId ?? novel.world?.id ?? null,
      worldName: novelWorld.title ?? novel.world?.name ?? novelWorld.coverSummary ?? "本书世界",
    };
  }
  return {
    hasWorld: Boolean(novel.world),
    worldId: novel.world?.id ?? null,
    worldName: novel.world?.name ?? null,
  };
}

function resolveFactCurrentStage(progress: ProductionFactProgress, targetChapterCount: number): string {
  if (!progress.facts.hasWorld) return "等待生成世界观";
  if (!progress.facts.hasStoryMacro) return "等待生成故事宏观规划";
  if (!progress.facts.hasBookContract && !progress.facts.hasStoryBible) return "等待生成书级创作约定";
  if (!progress.facts.hasCharacters) return "等待生成核心角色";
  if (!progress.facts.hasVolumeStrategy && progress.plannedChapterCount === 0) return "等待生成卷规划";
  if (!progress.facts.hasChapterTaskSheets) return "等待生成章节任务单";
  if (progress.draftedChapterCount === 0) return "等待开始章节写作";
  if (progress.needsRepairChapters > 0) return "质量修复待处理";
  if (targetChapterCount > 0 && progress.draftedChapterCount < targetChapterCount) return "章节正文写作中";
  if (targetChapterCount > 0 && progress.committedChapterCount < targetChapterCount) return "状态提交待补齐";
  return "小说事实进展可交付";
}

function buildRecoveryHint(
  progress: ProductionFactProgress,
  targetChapterCount: number,
  runtimeStatus: ProductionRuntimeStatus,
  pipelineReady: boolean,
): string | null {
  if (!progress.facts.hasWorld) return "先生成世界观，再继续书级规划。";
  if (!progress.facts.hasStoryMacro) return "先生成故事宏观规划，明确整本书的主线和承诺。";
  if (!progress.facts.hasBookContract && !progress.facts.hasStoryBible) return "先生成书级创作约定，锁定读者承诺和写法边界。";
  if (!progress.facts.hasCharacters) return "先生成核心角色，再推进卷规划和章节任务单。";
  if (!progress.facts.hasChapterTaskSheets) return "先生成章节任务单，再启动章节正文写作。";
  if (progress.needsRepairChapters > 0) return `优先处理 ${progress.needsRepairChapters} 章质量修复，再继续后续章节。`;
  if (targetChapterCount > 0 && progress.draftedChapterCount < targetChapterCount) return `继续从第 ${progress.currentChapterOrder ?? progress.draftedChapterCount + 1} 章推进正文。`;
  if (runtimeStatus.state === "failed") return "后台任务失败不影响已产出的事实内容，可从当前事实进展继续。";
  return pipelineReady ? null : "补齐规划资产和章节任务单后再继续整本生产。";
}

function buildSummary(
  title: string,
  currentStage: string,
  progress: ProductionFactProgress,
  targetChapterCount: number,
  runtimeStatus: ProductionRuntimeStatus,
): string {
  const parts = [
    `《${title}》事实进展：${currentStage}。`,
    `规划 ${progress.planningCompleted}/${progress.planningTotal} 项，正文 ${progress.draftedChapterCount}/${targetChapterCount} 章。`,
  ];
  if (progress.needsRepairChapters > 0) {
    parts.push(`${progress.needsRepairChapters} 章待修复。`);
  }
  if (runtimeStatus.state !== "idle") {
    parts.push(`${runtimeStatus.label}。`);
  }
  if (runtimeStatus.failureSummary) {
    parts.push("已完成产物不会因此丢失。");
  }
  return parts.join("");
}
