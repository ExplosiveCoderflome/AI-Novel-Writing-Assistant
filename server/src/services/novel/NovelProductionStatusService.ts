import { prisma } from "../../db/prisma";
import { parseStructuredOutline } from "./novelProductionHelpers";

export interface ProductionStatusStage {
  key: string;
  label: string;
  status: "pending" | "completed" | "running" | "blocked";
  detail: string | null;
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
}

export class NovelProductionStatusService {
  async getNovelProductionStatus(input: {
    novelId?: string;
    title?: string;
    targetChapterCount?: number;
  }): Promise<ProductionStatusResult> {
    const novel = input.novelId
      ? await prisma.novel.findUnique({
          where: { id: input.novelId },
          include: {
            world: { select: { id: true, name: true } },
            bible: true,
            characters: { select: { id: true } },
            chapters: { select: { id: true, order: true }, orderBy: { order: "asc" } },
            generationJobs: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        })
      : await prisma.novel.findFirst({
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

    const structuredOutlineChapters = novel.structuredOutline?.trim()
      ? parseStructuredOutline(novel.structuredOutline).length
      : 0;
    const targetChapterCount = input.targetChapterCount
      ?? (structuredOutlineChapters > 0 ? structuredOutlineChapters : null)
      ?? (novel.chapters.length > 0 ? novel.chapters.length : null)
      ?? 20;
    const latestJob = novel.generationJobs[0] ?? null;
    const chapterCount = novel.chapters.length;

    const assetStages: ProductionStatusStage[] = [
      { key: "novel_workspace", label: "小说工作区", status: "completed", detail: `《${novel.title}》` },
      { key: "world", label: "世界观", status: novel.world ? "completed" : "pending", detail: novel.world?.name ?? null },
      { key: "characters", label: "核心角色", status: novel.characters.length > 0 ? "completed" : "pending", detail: novel.characters.length > 0 ? `${novel.characters.length} 个角色` : null },
      { key: "story_bible", label: "小说圣经", status: novel.bible ? "completed" : "pending", detail: novel.bible?.mainPromise ?? novel.bible?.coreSetting ?? null },
      { key: "outline", label: "发展走向", status: novel.outline?.trim() ? "completed" : "pending", detail: novel.outline?.trim() ? "已生成发展走向" : null },
      { key: "structured_outline", label: "结构化大纲", status: novel.structuredOutline?.trim() ? "completed" : "pending", detail: novel.structuredOutline?.trim() ? `${structuredOutlineChapters} 章规划` : null },
      { key: "chapters", label: "章节目录", status: chapterCount > 0 ? "completed" : "pending", detail: chapterCount > 0 ? `${chapterCount}/${targetChapterCount} 章` : null },
      {
        key: "pipeline",
        label: "整本写作任务",
        status: latestJob
          ? latestJob.status === "running" || latestJob.status === "queued"
            ? "running"
            : latestJob.status === "succeeded"
              ? "completed"
              : "blocked"
          : "pending",
        detail: latestJob ? `状态：${latestJob.status}` : null,
      },
    ];

    const assetsReady = assetStages.filter((stage) => stage.key !== "pipeline").every((stage) => stage.status === "completed");
    const pipelineReady = assetsReady && chapterCount > 0;

    let currentStage = "资产待准备";
    if (!novel.world) {
      currentStage = "等待生成世界观";
    } else if (novel.characters.length === 0) {
      currentStage = "等待生成核心角色";
    } else if (!novel.bible) {
      currentStage = "等待生成小说圣经";
    } else if (!novel.outline?.trim()) {
      currentStage = "等待生成发展走向";
    } else if (!novel.structuredOutline?.trim()) {
      currentStage = "等待生成结构化大纲";
    } else if (chapterCount === 0) {
      currentStage = "等待同步章节目录";
    } else if (!latestJob) {
      currentStage = "等待启动整本写作";
    } else if (latestJob.status === "queued" || latestJob.status === "running") {
      currentStage = "整本写作进行中";
    } else if (latestJob.status === "succeeded") {
      currentStage = "整本写作已完成";
    } else if (latestJob.status === "failed") {
      currentStage = "整本写作失败";
    } else if (latestJob.status === "cancelled") {
      currentStage = "整本写作已取消";
    }

    const failureSummary = latestJob?.status === "failed" ? latestJob.error ?? "整本写作任务失败。" : null;
    const recoveryHint = latestJob?.status === "failed"
      ? "请检查章节目录和模型配置，必要时重新发起整本写作。"
      : !pipelineReady
        ? "请先完成世界观、角色、圣经、大纲和章节目录准备。"
        : latestJob
          ? null
          : "当前资产已准备完成，可在审批通过后启动整本写作。";
    const summary = latestJob
      ? `《${novel.title}》当前阶段：${currentStage}。`
      : pipelineReady
        ? `《${novel.title}》资产已准备完成，尚未启动整本写作。`
        : `《${novel.title}》当前阶段：${currentStage}。`;

    return {
      novelId: novel.id,
      title: novel.title,
      worldId: novel.world?.id ?? null,
      worldName: novel.world?.name ?? null,
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
    };
  }
}

export const novelProductionStatusService = new NovelProductionStatusService();
