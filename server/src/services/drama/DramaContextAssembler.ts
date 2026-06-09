import { prisma } from "../../db/prisma";
import { compactText, safeJsonParse } from "./utils/json";

interface BeatLite {
  order: number;
  summary: string;
}

export class DramaContextAssembler {
  async buildEpisodeContext(projectId: string, episodeOrder: number) {
    const project = await prisma.dramaProject.findUnique({
      where: { id: projectId },
      include: {
        sourceBundle: true,
        characters: true,
        facts: { orderBy: [{ episodeOrder: "asc" }, { createdAt: "asc" }] },
        episodes: { orderBy: { order: "asc" } },
      },
    });
    if (!project) {
      throw new Error(`未找到短剧项目：${projectId}`);
    }
    const episode = project.episodes.find((item) => item.order === episodeOrder);
    if (!episode) {
      throw new Error(`未找到短剧第 ${episodeOrder} 集大纲。`);
    }
    const beats = safeJsonParse<BeatLite[]>(project.sourceBundle?.beats, []);
    const sourceMap = safeJsonParse<{ beatRefs?: number[] }>(episode.sourceMap, {});
    const relatedBeats = sourceMap.beatRefs?.length
      ? beats.filter((beat) => sourceMap.beatRefs?.includes(beat.order))
      : beats.slice(Math.max(0, episodeOrder - 2), episodeOrder + 2);

    return {
      project,
      episode,
      strategyJson: project.strategy ?? "{}",
      episodeJson: JSON.stringify({
        order: episode.order,
        title: episode.title,
        hookOpening: episode.hookOpening,
        hookType: episode.hookType,
        cliffhanger: episode.cliffhanger,
        emotionNet: episode.emotionNet,
        isPaywall: episode.isPaywall,
        beatSheet: safeJsonParse(episode.beatSheet, {}),
      }, null, 2),
      charactersDigest: project.characters.map((character) => [
        character.name,
        character.archetype ? `原型：${character.archetype}` : "",
        character.persona ? `人设：${character.persona}` : "",
        character.speechStyle ? `口吻：${character.speechStyle}` : "",
        character.visualAnchor ? `视觉：${compactText(character.visualAnchor, 160)}` : "",
        character.relations ? `关系：${compactText(character.relations, 160)}` : "",
      ].filter(Boolean).join("；")).join("\n") || "暂无角色资源",
      factsDigest: project.facts.map((fact) => `E${fact.episodeOrder} ${fact.category}：${fact.text}`).join("\n") || "暂无事实",
      previousDigest: project.episodes
        .filter((item) => item.order < episodeOrder && item.content)
        .slice(-3)
        .map((item) => `第${item.order}集《${item.title}》：${compactText(item.content, 260)}`)
        .join("\n") || "暂无前序台本",
      sourceDigest: relatedBeats.map((beat) => `${beat.order}：${beat.summary}`).join("\n") || compactText(project.sourceBundle?.synopsis, 1000),
    };
  }
}

export const dramaContextAssembler = new DramaContextAssembler();
