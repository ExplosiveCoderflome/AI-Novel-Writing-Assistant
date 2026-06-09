import { prisma } from "../../db/prisma";

export class DramaExportService {
  async exportProject(projectId: string, format: "markdown" | "json" = "markdown") {
    const project = await prisma.dramaProject.findUnique({
      where: { id: projectId },
      include: {
        episodes: { orderBy: { order: "asc" } },
        characters: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!project) {
      throw new Error(`未找到短剧项目：${projectId}`);
    }
    if (format === "json") {
      return {
        contentType: "application/json; charset=utf-8",
        filename: `${project.title}-short-drama.json`,
        body: JSON.stringify(project, null, 2),
      };
    }
    const body = [
      `# ${project.title}`,
      "",
      `来源：${project.source}`,
      `赛道：${project.track ?? "未设置"}`,
      `目标集数：${project.targetEpisodes}`,
      "",
      "## 角色",
      ...project.characters.map((character) => `- ${character.name}${character.persona ? `：${character.persona}` : ""}`),
      "",
      "## 分集台本",
      ...project.episodes.flatMap((episode) => [
        "",
        `### 第 ${episode.order} 集 ${episode.title}`,
        "",
        `- 钩子：${episode.hookOpening ?? ""}`,
        `- 卡点：${episode.cliffhanger ?? ""}`,
        `- 付费卡点：${episode.isPaywall ? "是" : "否"}`,
        `- 情绪净值：${episode.emotionNet ?? ""}`,
        "",
        episode.content ?? "",
      ]),
      "",
    ].join("\n");
    return {
      contentType: "text/markdown; charset=utf-8",
      filename: `${project.title}-short-drama.md`,
      body,
    };
  }
}

export const dramaExportService = new DramaExportService();
