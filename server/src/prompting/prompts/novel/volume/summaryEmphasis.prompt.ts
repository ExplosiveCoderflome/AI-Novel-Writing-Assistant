import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { volumeEmphasisSchema, anchorVolumeEmphasis, type VolumeEmphasisSource, type VolumeEmphasis } from "@ai-novel/shared/types/director/volumeEmphasis";
import type { PromptAsset } from "../../../core/promptTypes";

export const volumeEmphasisInstructions = [
  "你给作者的卷纲圈重点。按输入 id 逐卷阅读 summary，挑出扫一眼就能读懂的两个短语。圈原文里的字，不能重新组织句子。",
  "conflict 圈主角正面对的麻烦。对手发难、条件逼近是冲突，同时扛两件事、为应对风险做取舍也是冲突。原文已写明这种压力时，把它圈出来。turn 圈局面发生改变的动作或结果，例如拿下第一份订单。区分问题和解决问题后的结果。",
  "例如“渡船被扣在码头，商贩凑钱买下旧驳船，货物终于赶上了集市。”可圈“渡船被扣”和“买下旧驳船”。省掉铺垫、无关主语和句末标点。每处尽量一小口就能读完；上下文中已经交代的部分留在普通字重。",
  "逐字复制 summary 中连续且能唯一定位的原文。某项确实没有写出才返回 null。两者指同一处时只摘一次。",
].join("\n");

export const volumeSummaryEmphasisPrompt: PromptAsset<{ volumes: VolumeEmphasisSource[] }, { volumes: VolumeEmphasis[] }> = {
  id: "novel.volume.summary_emphasis", version: "v1", taskType: "review", mode: "structured", language: "zh",
  management: { productPrompt: true, editModes: ["readonly"] },
  contextPolicy: { maxTokensBudget: 0 },
  outputSchema: volumeEmphasisSchema,
  semanticRetryPolicy: { maxAttempts: 1 },
  render: input => [
    new SystemMessage(volumeEmphasisInstructions),
    new HumanMessage(JSON.stringify(input)),
  ],
  postValidate: (output, input) => { anchorVolumeEmphasis(input.volumes, output); return output; },
};
