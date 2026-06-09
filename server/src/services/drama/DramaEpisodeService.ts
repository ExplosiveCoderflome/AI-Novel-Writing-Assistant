import { prisma } from "../../db/prisma";

export interface DramaEpisodeUpdateInput {
  title?: string;
  content?: string;
  hookOpening?: string | null;
  cliffhanger?: string | null;
  durationSec?: number | null;
}

export class DramaEpisodeService {
  async updateEpisode(projectId: string, order: number, input: DramaEpisodeUpdateInput) {
    const contentChanged = input.content !== undefined;
    return prisma.dramaEpisode.update({
      where: { projectId_order: { projectId, order } },
      data: {
        title: input.title,
        content: input.content,
        hookOpening: input.hookOpening,
        cliffhanger: input.cliffhanger,
        durationSec: input.durationSec,
        status: contentChanged ? "scripted" : undefined,
        qualityFlags: contentChanged ? null : undefined,
      },
    });
  }
}

export const dramaEpisodeService = new DramaEpisodeService();
