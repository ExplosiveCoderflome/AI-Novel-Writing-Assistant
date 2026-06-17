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
    // 防御：即使调用方传入字符串型 order 也能正确匹配
    const targetOrder = Number(episodeOrder);
    const episode = project.episodes.find((item) => item.order === targetOrder);
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
      charactersDigest: project.characters.map((character) => {
        // 提取角色参考图 URL（形象图 + 三视图）
        const refImageUrls: string[] = [];
        if (character.portraitData) {
          try {
            const pd = JSON.parse(character.portraitData) as { status?: string; url?: string };
            if (pd.status === "done" && pd.url) refImageUrls.push(`形象图:${pd.url}`);
          } catch { /* skip */ }
        }
        if (character.threeViewData) {
          try {
            const tvd = JSON.parse(character.threeViewData) as Array<{ view?: string; status?: string; url?: string }>;
            for (const item of tvd) {
              if (item.status === "done" && item.url) refImageUrls.push(`${item.view}视:${item.url}`);
            }
          } catch { /* skip */ }
        }

        return [
          character.name,
          character.archetype ? `原型：${character.archetype}` : "",
          character.persona ? `人设：${character.persona}` : "",
          character.speechStyle ? `口吻：${character.speechStyle}` : "",
          character.visualAnchor ? `视觉：${compactText(character.visualAnchor, 160)}` : "",
          refImageUrls.length > 0 ? `参考图：[${refImageUrls.join("，")}]（请保持人物视觉一致性）` : "",
          character.relations ? `关系：${compactText(character.relations, 160)}` : "",
        ].filter(Boolean).join("；");
      }).join("\n") || "暂无角色资源",
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
