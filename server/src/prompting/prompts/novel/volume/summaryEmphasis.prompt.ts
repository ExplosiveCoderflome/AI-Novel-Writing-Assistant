import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { volumeEmphasisSchema, anchorVolumeEmphasis, type VolumeEmphasisSource, type VolumeEmphasis } from "@ai-novel/shared/types/director/volumeEmphasis";
import type { PromptAsset } from "../../../core/promptTypes";

export const volumeSummaryEmphasisPrompt: PromptAsset<{ volumes: VolumeEmphasisSource[] }, { volumes: VolumeEmphasis[] }> = {
  id: "novel.volume.summary_emphasis", version: "v1", taskType: "review", mode: "structured", language: "zh",
  management: { productPrompt: true, editModes: ["readonly"] },
  contextPolicy: { maxTokensBudget: 0 },
  outputSchema: volumeEmphasisSchema,
  render: input => [
    new SystemMessage("你是给作者标注卷纲的小说编辑。逐卷阅读 summary，从中原样摘出至多两小段，让作者扫一眼就看出这卷的戏。conflict 选最关键的对抗、阻碍或两难；turn 选行动、局势、关系发生实质改变的那一下。可以参考 pressure 和 climax 理解语境，但只能复制 summary 里连续、唯一出现的原字原标点。尽量选简短而有动词的片段，让上下文保持普通字重，不要通段标粗。某项没有写出就返回 null，两者是同一处时只选一次。每卷保留输入 id。"),
    new HumanMessage(JSON.stringify(input)),
  ],
  postValidate: (output, input) => { anchorVolumeEmphasis(input.volumes, output); return output; },
};
