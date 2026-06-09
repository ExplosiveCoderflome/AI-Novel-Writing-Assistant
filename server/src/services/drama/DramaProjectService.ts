/**
 * 短剧项目服务（P0 骨架）
 *
 * 负责短剧项目的基础生命周期，以及通过防腐层把任意内容源装配为
 * 标准化内容包并落库（含角色资源导入 + 初始事实账本）。
 *
 * 低耦合：本文件只依赖 prisma（基础设施）与 drama 自有契约/端口，
 * 不 import 任何 services/novel/* 业务逻辑。
 */
import { prisma } from "../../db/prisma";
import { sourceContentRegistry } from "./source/SourceContentPort";
import { novelSourceAdapter } from "./source/NovelSourceAdapter";
import type { DramaSourceType, SourceBundle, SourceRef } from "./contracts/sourceBundle";

// 注册内置内容源 adapter（P0 先接入 novel_import；original/text_import 见 P3）
sourceContentRegistry.register(novelSourceAdapter);

export interface CreateDramaProjectInput {
  title: string;
  source: DramaSourceType;
  /** 软引用：novel_import 时为 novelId */
  sourceRef?: string;
  track?: string;
  theme?: string;
  targetEpisodes?: number;
  /** original / text_import 的原始输入（透传给 adapter） */
  inspiration?: string;
  rawText?: string;
}

export class DramaProjectService {
  async createProject(input: CreateDramaProjectInput) {
    return prisma.dramaProject.create({
      data: {
        title: input.title,
        source: input.source,
        sourceRef: input.sourceRef ?? null,
        track: input.track ?? null,
        theme: input.theme ?? null,
        targetEpisodes: input.targetEpisodes ?? 80,
        status: "draft",
      },
    });
  }

  async listProjects() {
    return prisma.dramaProject.findMany({ orderBy: { createdAt: "desc" } });
  }

  async getProject(projectId: string) {
    return prisma.dramaProject.findUnique({
      where: { id: projectId },
      include: { sourceBundle: true, characters: true },
    });
  }

  /**
   * 通过防腐层把内容源装配为标准化内容包，并落库：
   * 1) DramaSourceBundle（梗概/节拍/设定/硬事实/原文）
   * 2) DramaCharacter（角色资源导入）
   * 3) DramaFact（初始事实账本，episodeOrder=0 表示源初始事实）
   */
  async assembleSourceBundle(projectId: string): Promise<SourceBundle> {
    const project = await prisma.dramaProject.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new Error(`未找到短剧项目：${projectId}`);
    }

    const adapter = sourceContentRegistry.resolve(project.source as DramaSourceType);
    const ref: SourceRef = {
      type: project.source as DramaSourceType,
      ref: project.sourceRef ?? undefined,
    };
    const bundle = await adapter.loadBundle(ref);

    await prisma.$transaction(async (tx) => {
      await tx.dramaSourceBundle.upsert({
        where: { projectId },
        update: {
          synopsis: bundle.synopsis,
          beats: JSON.stringify(bundle.beats),
          worldNotes: bundle.worldNotes ?? null,
          hardFacts: bundle.hardFacts ? JSON.stringify(bundle.hardFacts) : null,
          rawText: bundle.rawText ?? null,
        },
        create: {
          projectId,
          synopsis: bundle.synopsis,
          beats: JSON.stringify(bundle.beats),
          worldNotes: bundle.worldNotes ?? null,
          hardFacts: bundle.hardFacts ? JSON.stringify(bundle.hardFacts) : null,
          rawText: bundle.rawText ?? null,
        },
      });

      // 角色资源导入（重置后重建，保证幂等）
      await tx.dramaCharacter.deleteMany({ where: { projectId } });
      if (bundle.characters.length > 0) {
        await tx.dramaCharacter.createMany({
          data: bundle.characters.map((character) => ({
            projectId,
            name: character.name,
            persona: character.persona ?? null,
            relations: character.relations ?? null,
            visualAnchor: character.visualHint
              ? JSON.stringify({ hint: character.visualHint })
              : null,
            sourceCharacterRef: character.sourceCharacterRef ?? null,
          })),
        });
      }

      // 初始事实账本（episodeOrder=0 表示源带入的初始硬事实）
      await tx.dramaFact.deleteMany({ where: { projectId, episodeOrder: 0 } });
      if (bundle.hardFacts && bundle.hardFacts.length > 0) {
        await tx.dramaFact.createMany({
          data: bundle.hardFacts.map((fact) => ({
            projectId,
            episodeOrder: 0,
            text: fact.text,
            category: fact.category,
            source: "auto",
          })),
        });
      }

      // 内容包就绪后仅刷新 updatedAt；status 推进交给后续策略/分集阶段
      await tx.dramaProject.update({
        where: { id: projectId },
        data: { updatedAt: new Date() },
      });
    });

    return bundle;
  }
}

export const dramaProjectService = new DramaProjectService();
