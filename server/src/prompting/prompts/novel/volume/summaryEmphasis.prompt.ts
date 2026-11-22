import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { volumeEmphasisSchema, anchorVolumeEmphasis, type VolumeEmphasisSource, type VolumeEmphasis } from "@ai-novel/shared/types/director/volumeEmphasis";
import type { PromptAsset } from "../../../core/promptTypes";

export const volumeSummaryEmphasisPrompt: PromptAsset<{ volumes: VolumeEmphasisSource[] }, { volumes: VolumeEmphasis[] }> = {
  id: "novel.volume.summary_emphasis", version: "v1", taskType: "review", mode: "structured", language: "zh",
  management: { productPrompt: true, editModes: ["readonly"] },
  contextPolicy: { maxTokensBudget: 0 },
  outputSchema: volumeEmphasisSchema,
  semanticRetryPolicy: { maxAttempts: 1 },
  render: input => [
    new SystemMessage("你是给作者标注卷纲的小说编辑。按输入 id 逐卷阅读 summary，像用荧光笔一样，只从这段原文里圈出至多两小段。conflict 选关键的对抗、阻碍或两难。turn 选行动、局势、关系改变的那一下。复制连续、唯一出现的原字，不增删字词和标点。优先保留能读懂的动词和对象，去掉铺垫和句末标点，让多数文字仍是普通字重。某项没有写出就返回 null，两者指同一处时只摘一次。"),
    new HumanMessage(JSON.stringify(input)),
  ],
  postValidate: (output, input) => { anchorVolumeEmphasis(input.volumes, output); return output; },
};
