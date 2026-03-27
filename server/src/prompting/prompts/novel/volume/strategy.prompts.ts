import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../../core/renderContextBlocks";
import {
  createVolumeStrategyCritiqueSchema,
  createVolumeStrategySchema,
} from "../../../../services/novel/volume/volumeGenerationSchemas";
import {
  type VolumeStrategyCritiquePromptInput,
  type VolumeStrategyPromptInput,
} from "./shared";
import {
  buildVolumeStrategyContextBlocks,
  buildVolumeStrategyCritiqueContextBlocks,
} from "./contextBlocks";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";

export function createVolumeStrategyPrompt(
  maxVolumeCount = 12,
): PromptAsset<
  VolumeStrategyPromptInput,
  ReturnType<typeof createVolumeStrategySchema>["_output"]
> {
  return {
    id: "novel.volume.strategy",
    version: "v1",
    taskType: "planner",
    mode: "structured",
    language: "zh",
    contextPolicy: {
      maxTokensBudget: NOVEL_PROMPT_BUDGETS.volumeStrategy,
      requiredGroups: ["book_contract", "suggested_volume_count"],
      preferredGroups: ["macro_constraints", "existing_volume_window", "guidance"],
      dropOrder: ["existing_volume_window"],
    },
    outputSchema: createVolumeStrategySchema(maxVolumeCount),
    render: (_input, context) => [
      new SystemMessage([
        "你是长篇网文分卷策略规划助手。",
        "目标不是直接生成最终分卷骨架，而是先决定整本书应该分几卷、前几卷哪些要硬规划、后几卷哪些保留软规划。",
        "",
        "只输出严格 JSON。",
        `recommendedVolumeCount 必须在 1-${maxVolumeCount} 之间，且等于 volumes.length。`,
        "前 hardPlannedVolumeCount 卷的 planningMode 必须是 hard，后续卷必须是 soft。",
        "strategy 必须优先服务连载追读动力，而不是一次性写死后半本。",
      ].join("\n")),
      new HumanMessage([
        "规划上下文：",
        renderSelectedContextBlocks(context),
      ].join("\n")),
    ],
  };
}

export const volumeStrategyCritiquePrompt: PromptAsset<
  VolumeStrategyCritiquePromptInput,
  ReturnType<typeof createVolumeStrategyCritiqueSchema>["_output"]
> = {
  id: "novel.volume.strategy.critique",
  version: "v1",
  taskType: "review",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.volumeStrategyCritique,
    requiredGroups: ["book_contract", "strategy_context"],
    preferredGroups: ["macro_constraints", "existing_volume_window", "guidance"],
  },
  outputSchema: createVolumeStrategyCritiqueSchema(),
  render: (_input, context) => [
    new SystemMessage([
      "你是长篇网文结构审查助手。",
      "请审查当前分卷策略是否过早锁死、回报同质、升级断裂或不确定性声明不足。",
      "只输出严格 JSON。",
      "issues 中的每条问题都必须写清 targetRef、severity、title、detail。",
    ].join("\n")),
    new HumanMessage([
      "待审查的分卷策略上下文：",
      renderSelectedContextBlocks(context),
    ].join("\n")),
  ],
};

export {
  buildVolumeStrategyContextBlocks,
  buildVolumeStrategyCritiqueContextBlocks,
};
