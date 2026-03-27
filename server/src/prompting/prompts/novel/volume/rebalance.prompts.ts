import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../../core/renderContextBlocks";
import { createVolumeRebalanceSchema } from "../../../../services/novel/volume/volumeGenerationSchemas";
import { type VolumeRebalancePromptInput } from "./shared";
import { buildVolumeRebalanceContextBlocks } from "./contextBlocks";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";

export const volumeRebalancePrompt: PromptAsset<
  VolumeRebalancePromptInput,
  ReturnType<typeof createVolumeRebalanceSchema>["_output"]
> = {
  id: "novel.volume.rebalance.adjacent",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.volumeRebalance,
    requiredGroups: ["book_contract", "anchor_volume"],
    preferredGroups: ["strategy_context", "adjacent_volumes", "volume_window"],
    dropOrder: ["volume_window"],
  },
  outputSchema: createVolumeRebalanceSchema(),
  render: (_input, context) => [
    new SystemMessage([
      "你是网文连载结构调度助手。",
      "请根据当前卷变化，判断相邻卷是否需要再平衡。",
      "只输出严格 JSON。",
      "每条 decision 都必须包含 anchorVolumeId、affectedVolumeId、direction、severity、summary、actions。",
      "如果相邻卷暂时不需要调整，可以使用 hold，但 summary 仍要说明原因。",
    ].join("\n")),
    new HumanMessage([
      "相邻卷再平衡上下文：",
      renderSelectedContextBlocks(context),
    ].join("\n")),
  ],
};

export { buildVolumeRebalanceContextBlocks };
