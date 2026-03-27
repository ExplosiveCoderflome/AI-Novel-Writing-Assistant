import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../../core/renderContextBlocks";
import { createVolumeBeatSheetSchema } from "../../../../services/novel/volume/volumeGenerationSchemas";
import { type VolumeBeatSheetPromptInput } from "./shared";
import { buildVolumeBeatSheetContextBlocks } from "./contextBlocks";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";

export const volumeBeatSheetPrompt: PromptAsset<
  VolumeBeatSheetPromptInput,
  ReturnType<typeof createVolumeBeatSheetSchema>["_output"]
> = {
  id: "novel.volume.beat_sheet",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.volumeBeatSheet,
    requiredGroups: ["book_contract", "target_volume"],
    preferredGroups: ["macro_constraints", "strategy_context", "volume_window"],
    dropOrder: ["soft_future_summary"],
  },
  outputSchema: createVolumeBeatSheetSchema(),
  render: (_input, context) => [
    new SystemMessage([
      "你是网文章节节奏规划助手。",
      "当前阶段为单卷生成 beat sheet，用来承接卷骨架并为拆章做节奏约束。",
      "只输出严格 JSON。",
      "beats 至少覆盖开卷抓手、第一次升级、中段反转、高潮前挤压、卷高潮、卷尾钩子。",
      "每个 beat 都必须写清 summary、chapterSpanHint、mustDeliver。",
    ].join("\n")),
    new HumanMessage([
      "当前卷节奏上下文：",
      renderSelectedContextBlocks(context),
    ].join("\n")),
  ],
};

export { buildVolumeBeatSheetContextBlocks };
