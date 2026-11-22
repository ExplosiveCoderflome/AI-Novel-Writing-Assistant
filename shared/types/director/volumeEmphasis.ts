import { z } from "zod";

const quote = z.string().trim().min(1).nullable();
export const volumeEmphasisSchema = z.object({
  volumes: z.array(z.object({ id: z.string().min(1), conflict: quote, turn: quote })),
});

export interface VolumeEmphasisSource {
  id: string;
  summary: string;
}
export type VolumeEmphasis = z.infer<typeof volumeEmphasisSchema>["volumes"][number];
export type AnchoredVolumeEmphasis = VolumeEmphasis & { summary: string };

export function anchorVolumeEmphasis(sources: VolumeEmphasisSource[], output: z.infer<typeof volumeEmphasisSchema>): AnchoredVolumeEmphasis[] {
  const byId = new Map(output.volumes.map(item => [item.id, item]));
  if (byId.size !== sources.length || output.volumes.length !== sources.length) throw new Error("标注须与本批卷纲逐卷对应。");
  return sources.map(({ id, summary }) => {
    const item = byId.get(id);
    if (!item) throw new Error("标注缺少对应的卷纲。");
    for (const text of [item.conflict, item.turn]) {
      if (text !== null && (!summary.includes(text) || summary.indexOf(text) !== summary.lastIndexOf(text))) {
        throw new Error(`卷 ${id} 的“${text}”无法在梗概中唯一定位。请逐字摘取原文：${summary}`);
      }
    }
    return { ...item, summary };
  });
}
