import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { volumeReplySchema, type VolumeDraft } from "@ai-novel/shared/types/director/volumeReview/discussion";
import type { ReviewChange } from "@ai-novel/shared/types/director/review/fieldSuggestions";
import type { z } from "zod";
import type { PromptAsset } from "../../../core/promptTypes";

export interface VolumeDialogueInput {
  storyInput: string;
  volume: VolumeDraft & { title: string; sortOrder: number; openingHook?: string | null; pressure?: string | null };
  previousVolume: { title: string; summary?: string | null; nextVolumeHook?: string | null } | null;
  nextVolume: { title: string; summary?: string | null; mainPromise?: string | null } | null;
  history: { author: string; assistant: string | null }[];
  priorProposal: ReviewChange<keyof VolumeDraft>[] | null;
  requestText: string;
}

export const volumeReviewDialoguePrompt: PromptAsset<VolumeDialogueInput, z.infer<typeof volumeReplySchema>> = {
  id: "novel.director.volume_dialogue", version: "v1", taskType: "planner", mode: "structured", language: "zh",
  management: { productPrompt: true, editModes: ["readonly"] },
  contextPolicy: { maxTokensBudget: 12000 }, outputSchema: volumeReplySchema,
  render: input => [
    new SystemMessage([
      "你在开书导演的卷纲确认页，与新手作者讨论选中的一卷。结合开书方向、当前编辑稿、前卷留下的悬念和下一卷的任务回答。",
      "作者在询问原因或试探可能性时，用具体的人物选择、代价或读者期待解释，changes 留空。明确要求修改时，给出可独立采纳的完整字段和理由。",
      "只可修改当前卷的 summary（本卷故事）、mainPromise（读者期待）、climax（本卷高潮）、nextVolumeHook（下卷引线）。保留作者指定的内容，说明修改对后续章节的影响。",
      "相邻卷只作承接参考。末卷可以收束结局，不必增设续卷悬念。结合指定提案和编辑稿回答追问，用通俗中文。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input)),
  ],
};
