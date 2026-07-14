/**
 * 视频项目服务
 *
 * 管理视频改编项目的生命周期。
 * 低耦合：只依赖 prisma 和 adaptation 端口，不 import novel 业务逻辑。
 */
import { prisma } from "../../db/prisma";

export interface CreateVideoProjectInput {
  title: string;
  novelId?: string;
  chapterIds?: string[];
  sourceType?: string;
  pipeline?: string;
  config?: Record<string, unknown>;
}

export class VideoProjectService {
  async createProject(input: CreateVideoProjectInput) {
    return prisma.videoProject.create({
      data: {
        title: input.title,
        novelId: input.novelId ?? null,
        chapterIdsJson: input.chapterIds ? JSON.stringify(input.chapterIds) : null,
        sourceType: input.sourceType ?? "chapter_adaptation",
        pipeline: input.pipeline ?? null,
        configJson: input.config ? JSON.stringify(input.config) : null,
        status: "draft",
      },
    });
  }

  async listProjects(novelId?: string) {
    return prisma.videoProject.findMany({
      where: novelId ? { novelId } : undefined,
      orderBy: { createdAt: "desc" },
      include: { novel: { select: { id: true, title: true } } },
    });
  }

  async getProject(projectId: string) {
    return prisma.videoProject.findUnique({
      where: { id: projectId },
      include: { novel: { select: { id: true, title: true, description: true } } },
    });
  }

  async updateProject(projectId: string, data: Partial<{
    title: string;
    status: string;
    pipeline: string;
    scriptJson: string;
    renderTaskId: string;
    resultUrl: string;
    costEstimate: number;
    actualCost: number;
    errorMessage: string;
    configJson: string;
  }>) {
    return prisma.videoProject.update({
      where: { id: projectId },
      data,
    });
  }

  async deleteProject(projectId: string) {
    return prisma.videoProject.delete({ where: { id: projectId } });
  }

  /**
   * 获取项目关联的章节内容，用于视频脚本生成。
   */
  async getProjectSourceContent(projectId: string) {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`视频项目不存在: ${projectId}`);
    }

    let chapters: Array<{ id: string; title: string; content: string | null; order: number }> = [];
    let characters: Array<{ name: string; personality: string | null; appearance: string | null }> = [];
    let novelDescription = "";

    if (project.novelId) {
      const chapterIds: string[] = project.chapterIdsJson
        ? JSON.parse(project.chapterIdsJson)
        : [];

      if (chapterIds.length > 0) {
        chapters = await prisma.chapter.findMany({
          where: { id: { in: chapterIds }, novelId: project.novelId },
          select: { id: true, title: true, content: true, order: true },
          orderBy: { order: "asc" },
        });
      } else {
        // 没有指定章节时取全部（最多前10章）
        chapters = await prisma.chapter.findMany({
          where: { novelId: project.novelId },
          select: { id: true, title: true, content: true, order: true },
          orderBy: { order: "asc" },
          take: 10,
        });
      }

      characters = await prisma.character.findMany({
        where: { novelId: project.novelId },
        select: { name: true, personality: true, appearance: true },
        take: 20,
      });

      novelDescription = project.novel?.description ?? "";
    }

    return {
      project,
      chapters,
      characters,
      novelDescription,
    };
  }
}

export const videoProjectService = new VideoProjectService();
