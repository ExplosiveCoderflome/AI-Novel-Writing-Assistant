import type { NovelExportFormat, NovelExportScope } from "@ai-novel/shared/types/novelExport";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { createNovelApplicationServices } from "../../services/novel/application/NovelApplicationServices";
import { StoryMacroPlanService } from "../../services/novel/storyMacro/StoryMacroPlanService";
import {
  buildExportTimestamp,
  buildMarkdownExportContent,
  buildScopedNovelExportPayload,
  buildTxtContent,
  safeFileNamePart,
  type NovelExportResult,
  type NovelTxtRecord,
} from "./novelExport.formatting";
import {
  buildExportTimelineGroups,
  mapAuditReport,
  mapChapterPlan,
  mapExportNovelDetail,
  mapPipelineJob,
} from "./novelExport.mappers";
import type { NovelExportBundle } from "./novelExport.types";

export class NovelExportService {
  private readonly novelService = createNovelApplicationServices();
  private readonly storyMacroPlanService = new StoryMacroPlanService();

  private buildFileName(title: string, scope: NovelExportScope, format: Exclude<NovelExportFormat, "txt">): string {
    const extension = format === "markdown" ? "md" : "json";
    const suffix = scope === "full" ? "" : `-${scope}`;
    return `${safeFileNamePart(title)}${suffix}-${buildExportTimestamp()}.${extension}`;
  }

  private async getTxtNovelRecord(novelId: string): Promise<NovelTxtRecord> {
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
    if (!rawNovel) {
      throw new AppError("小说不存在。", 404);
    }
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

    const timelines = buildExportTimelineGroups(novel.characters ?? [], characterTimelineRows);

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
          timelines,
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
