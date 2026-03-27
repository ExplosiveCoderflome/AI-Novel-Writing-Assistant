import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../../core/renderContextBlocks";
import { createVolumeChapterListSchema } from "../../../../services/novel/volume/volumeGenerationSchemas";
import { type VolumeChapterListPromptInput } from "./shared";
import { buildVolumeChapterListContextBlocks } from "./contextBlocks";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";

export function createVolumeChapterListPrompt(
  targetChapterCount: number,
): PromptAsset<
  VolumeChapterListPromptInput,
  ReturnType<typeof createVolumeChapterListSchema>["_output"]
> {
  return {
    id: "novel.volume.chapter_list",
    version: "v2",
    taskType: "planner",
    mode: "structured",
    language: "zh",
    contextPolicy: {
      maxTokensBudget: NOVEL_PROMPT_BUDGETS.volumeChapterList,
      requiredGroups: ["book_contract", "target_volume", "target_beat_sheet", "target_chapter_count"],
      preferredGroups: ["macro_constraints", "adjacent_volumes", "soft_future_summary"],
      dropOrder: ["soft_future_summary"],
    },
    outputSchema: createVolumeChapterListSchema(targetChapterCount),
    render: (_input, context) => [
      new SystemMessage([
        "你是网文章节拆分规划助手。",
        "必须服从当前卷骨架和 beat sheet，把当前卷拆成章节列表。",
        "只输出严格 JSON。",
        `必须输出 ${targetChapterCount} 章，每章只能包含 title 和 summary。`,
        "每章 summary 必须说明这章具体推进了什么，以及它在当前卷节奏中的作用。",
      ].join("\n")),
      new HumanMessage([
        "当前卷拆章上下文：",
        renderSelectedContextBlocks(context),
      ].join("\n")),
    ],
  };
}

export { buildVolumeChapterListContextBlocks };
