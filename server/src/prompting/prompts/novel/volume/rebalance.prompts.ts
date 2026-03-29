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
      "只输出严格 JSON，不要输出 markdown，不要解释。",
      "每条 decision 都必须包含 anchorVolumeId、affectedVolumeId、direction、severity、summary、actions。",
      "anchorVolumeId 和 affectedVolumeId 一律使用卷序号字符串，例如 \"1\"、\"2\"，不要输出数据库 uuid，也不要输出数字类型。",
      "direction 只能从以下枚举里选择一个：pull_forward、push_back、tighten_current、expand_adjacent、hold。",
      "如果相邻卷暂时不需要调整，也可以输出 hold，但 summary 仍要说明原因。",
      "最终 JSON 形状固定为：{\"decisions\":[{\"anchorVolumeId\":\"1\",\"affectedVolumeId\":\"2\",\"direction\":\"push_back\",\"severity\":\"medium\",\"summary\":\"...\",\"actions\":[\"...\"]}]}",
    ].join("\n")),
    new HumanMessage([
      "相邻卷再平衡上下文：",
      renderSelectedContextBlocks(context),
    ].join("\n")),
  ],
};

export { buildVolumeRebalanceContextBlocks };
