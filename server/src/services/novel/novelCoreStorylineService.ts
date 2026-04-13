import { prisma } from "../../db/prisma";
import {
  buildStorylineDiffSummary,
  countCharacterMentions,
  estimateAffectedChapterCount,
  estimateChangedLines,
  StorylineDraftInput,
  StorylineImpactInput,
} from "./novelCoreShared";
import { queueRagUpsert } from "./novelCoreSupport";

export class NovelCoreStorylineService {
  async listStorylineVersions(novelId: string) {
    return prisma.storylineVersion.findMany({
      where: { novelId },
      orderBy: [{ version: "desc" }],
    });
  }

  async createStorylineDraft(novelId: string, input: StorylineDraftInput) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true, outline: true },
    });
    if (!novel) {
      throw new Error("小说不存在");
    }

    const latestVersion = await prisma.storylineVersion.findFirst({
      where: { novelId },
      orderBy: { version: "desc" },
    });

    const baseVersion = typeof input.baseVersion === "number"
      ? await prisma.storylineVersion.findFirst({
        where: { novelId, version: input.baseVersion },
      })
      : null;

    const previousContent = baseVersion?.content ?? latestVersion?.content ?? novel.outline ?? "";
    const diffSummary = input.diffSummary?.trim() || buildStorylineDiffSummary(previousContent, input.content);

    return prisma.storylineVersion.create({
      data: {
        novelId,
        version: (latestVersion?.version ?? 0) + 1,
        status: "draft",
        content: input.content,
        diffSummary,
      },
    });
  }

  async activateStorylineVersion(novelId: string, versionId: string) {
    const target = await prisma.storylineVersion.findFirst({
      where: { id: versionId, novelId },
    });
    if (!target) {
      throw new Error("主线版本不存在");
    }

    await prisma.$transaction([
      prisma.storylineVersion.updateMany({
        where: { novelId, status: "active" },
        data: { status: "frozen" },
      }),
      prisma.storylineVersion.update({
        where: { id: target.id },
        data: { status: "active" },
      }),
      prisma.novel.update({
        where: { id: novelId },
        data: {
          outline: target.content,
          storylineStatus: "in_progress",
        },
      }),
    ]);

    const refreshed = await prisma.storylineVersion.findUnique({ where: { id: target.id } });
    if (!refreshed) {
      throw new Error("主线版本激活失败");
    }
    queueRagUpsert("novel", novelId);
    return refreshed;
  }

  async freezeStorylineVersion(novelId: string, versionId: string) {
    const target = await prisma.storylineVersion.findFirst({
      where: { id: versionId, novelId },
      select: { id: true },
    });
    if (!target) {
      throw new Error("主线版本不存在");
    }
    return prisma.storylineVersion.update({
      where: { id: target.id },
      data: { status: "frozen" },
    });
  }

  async getStorylineDiff(novelId: string, versionId: string, compareVersion?: number) {
    const target = await prisma.storylineVersion.findFirst({
      where: { id: versionId, novelId },
    });
    if (!target) {
      throw new Error("主线版本不存在");
    }

    let baseline: { content: string } | null = null;
    if (typeof compareVersion === "number") {
      baseline = await prisma.storylineVersion.findFirst({
        where: { novelId, version: compareVersion },
        select: { content: true },
      });
    } else {
      baseline = await prisma.storylineVersion.findFirst({
        where: { novelId, version: { lt: target.version } },
        orderBy: { version: "desc" },
        select: { content: true },
      });
    }

    const previousContent = baseline?.content ?? "";
    const changedLines = estimateChangedLines(previousContent, target.content);
    const [characters, chapterCount] = await Promise.all([
      prisma.character.findMany({
        where: { novelId },
        select: { name: true },
      }),
      prisma.chapter.count({ where: { novelId } }),
    ]);

    const affectedCharacters = countCharacterMentions(target.content, characters.map((item) => item.name));
    const affectedChapters = estimateAffectedChapterCount(target.content, chapterCount, changedLines);

    return {
      id: target.id,
      novelId: target.novelId,
      version: target.version,
      status: target.status,
      diffSummary: target.diffSummary ?? buildStorylineDiffSummary(previousContent, target.content),
      changedLines,
      affectedCharacters,
      affectedChapters,
    };
  }

  async analyzeStorylineImpact(novelId: string, input: StorylineImpactInput) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true, outline: true },
    });
    if (!novel) {
      throw new Error("小说不存在");
    }

    let candidateContent = input.content?.trim() ?? "";
    let sourceVersion: number | null = null;
    if (!candidateContent && input.versionId) {
      const version = await prisma.storylineVersion.findFirst({
        where: { id: input.versionId, novelId },
        select: { version: true, content: true },
      });
      if (!version) {
        throw new Error("主线版本不存在");
      }
      candidateContent = version.content;
      sourceVersion = version.version;
    }

    if (!candidateContent) {
      throw new Error("缺少主线内容");
    }

    const baseContent = novel.outline ?? "";
    const changedLines = estimateChangedLines(baseContent, candidateContent);
    const [characters, chapterCount] = await Promise.all([
      prisma.character.findMany({
        where: { novelId },
        select: { name: true },
      }),
      prisma.chapter.count({ where: { novelId } }),
    ]);

    const affectedCharacters = countCharacterMentions(candidateContent, characters.map((item) => item.name));
    const affectedChapters = estimateAffectedChapterCount(candidateContent, chapterCount, changedLines);
    const requiresOutlineRebuild = changedLines >= 8 || affectedChapters >= Math.max(3, Math.ceil(chapterCount * 0.25));

    return {
      novelId,
      sourceVersion,
      changedLines,
      affectedCharacters,
      affectedChapters,
      requiresOutlineRebuild,
      recommendations: {
        shouldSyncOutline: changedLines > 0,
        shouldRecheckCharacters: affectedCharacters > 0,
        suggestedStrategy: requiresOutlineRebuild ? "rebuild_outline" : "incremental_sync",
      },
    };
  }
}
