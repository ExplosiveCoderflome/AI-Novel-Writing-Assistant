/**
 * AI 漫画项目服务
 *
 * 低耦合：仅依赖 prisma（基础设施）和 adaptation 共享层，
 * 不 import 任何 services/novel/* 或 services/drama/* 实现
 * （由 CI 守卫 comicDecoupling.test.js 强制）。
 */
import { prisma } from "../../db/prisma";
import { adaptationSourceRegistry } from "../adaptation/source/SourceContentPort";
import { novelSourceAdapter } from "../adaptation/source/NovelSourceAdapter";
import type { AdaptationSourceType, SourceBundle, SourceRef } from "../adaptation/contracts/sourceBundle";

adaptationSourceRegistry.register(novelSourceAdapter);

export interface CreateComicProjectInput {
  title: string;
  sourceType: AdaptationSourceType;
  /** 软引用：novel_import 时为 novelId */
  sourceRef?: string;
  trackId?: string;
  /** original / text_import 的原始输入 */
  inspiration?: string;
  rawText?: string;
}

export class ComicProjectService {
  async createProject(input: CreateComicProjectInput) {
    return prisma.comicProject.create({
      data: {
        title: input.title,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef ?? null,
        sourceInput: input.rawText ?? input.inspiration ?? null,
        trackId: input.trackId ?? null,
        status: "draft",
      },
    });
  }

  async listProjects() {
    return prisma.comicProject.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        sourceBundle: { select: { id: true, importedAt: true } },
        _count: { select: { episodes: true, characters: true } },
      },
    });
  }

  async getProject(projectId: string) {
    return prisma.comicProject.findUnique({
      where: { id: projectId },
      include: {
        sourceBundle: true,
        characters: { orderBy: { createdAt: "asc" } },
        episodes: {
          orderBy: { order: "asc" },
          include: { panels: { orderBy: { order: "asc" } } },
        },
        batchJobs: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
  }

  async deleteProject(projectId: string) {
    return prisma.comicProject.delete({ where: { id: projectId } });
  }

  async updateProjectStyle(projectId: string, stylePreset: string) {
    return prisma.comicProject.update({
      where: { id: projectId },
      data: { stylePreset },
    });
  }

  async updateProjectStatus(projectId: string, status: string) {
    return prisma.comicProject.update({
      where: { id: projectId },
      data: { status },
    });
  }

  /**
   * 通过防腐层把内容源装配为标准化内容包并落库（导入即快照）：
   * 1) ComicSourceBundle（梗概/节拍/角色/硬事实）
   * 2) ComicCharacter（角色资源导入）
   */
  async importSourceBundle(projectId: string) {
    const project = await prisma.comicProject.findUnique({ where: { id: projectId } });
    if (!project) throw new Error(`未找到漫画项目：${projectId}`);

    const sourceRef: SourceRef = {
      type: project.sourceType as AdaptationSourceType,
      ref: project.sourceRef ?? undefined,
      inspiration: project.sourceInput ?? undefined,
      rawText: project.sourceInput ?? undefined,
    };

    const adapter = adaptationSourceRegistry.resolve(sourceRef.type);
    const bundle: SourceBundle = await adapter.loadBundle(sourceRef);

    // 事务：落库 sourceBundle + characters
    await prisma.$transaction(async (tx) => {
      // 幂等：已存在则替换
      await tx.comicSourceBundle.upsert({
        where: { projectId },
        create: { projectId, bundleJson: JSON.stringify(bundle) },
        update: { bundleJson: JSON.stringify(bundle), importedAt: new Date() },
      });

      // 删除旧角色资源再重建（保证与源同步）
      await tx.comicCharacter.deleteMany({ where: { projectId } });
      if (bundle.characters.length > 0) {
        await tx.comicCharacter.createMany({
          data: bundle.characters.map((character) => ({
            projectId,
            name: character.name,
            persona: character.persona ?? null,
            visualAnchor: character.visualHint ?? null,
            sourceCharacterRef: character.sourceCharacterRef ?? null,
          })),
        });
      }

      await tx.comicProject.update({
        where: { id: projectId },
        data: { status: "outlined" },
      });
    });

    return prisma.comicProject.findUnique({
      where: { id: projectId },
      include: { sourceBundle: true, characters: true },
    });
  }
}
