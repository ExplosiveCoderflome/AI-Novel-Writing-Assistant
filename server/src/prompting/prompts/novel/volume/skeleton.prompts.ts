import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../../core/renderContextBlocks";
import { createBookVolumeSkeletonSchema } from "../../../../services/novel/volume/volumeGenerationSchemas";
import { type VolumeSkeletonPromptInput } from "./shared";
import { buildVolumeSkeletonContextBlocks } from "./contextBlocks";
import { NOVEL_PROMPT_BUDGETS } from "../promptBudgetProfiles";

export function createVolumeSkeletonPrompt(
  targetVolumeCount: number,
): PromptAsset<
  VolumeSkeletonPromptInput,
  ReturnType<typeof createBookVolumeSkeletonSchema>["_output"]
> {
  return {
    id: "novel.volume.skeleton",
    version: "v2",
    taskType: "planner",
    mode: "structured",
    language: "zh",
    contextPolicy: {
      maxTokensBudget: NOVEL_PROMPT_BUDGETS.volumeSkeleton,
      requiredGroups: ["book_contract", "strategy_context", "chapter_budget"],
      preferredGroups: ["macro_constraints", "existing_volume_window", "guidance"],
    },
    outputSchema: createBookVolumeSkeletonSchema(targetVolumeCount),
    render: (_input, context) => [
      new SystemMessage([
        "你是长篇网文分卷骨架规划助手。",
        "当前阶段只做卷级骨架，不展开章节。",
        "",
        `必须严格输出 ${targetVolumeCount} 卷。`,
        "每卷必须包含 title、summary、openingHook、mainPromise、primaryPressureSource、coreSellingPoint、escalationMode、protagonistChange、midVolumeRisk、climax、payoffType、nextVolumeHook、resetPoint、openPayoffs。",
        "骨架必须服从上游策略，特别是 hard/soft 规划分层。",
      ].join("\n")),
      new HumanMessage([
        "分卷骨架上下文：",
        renderSelectedContextBlocks(context),
      ].join("\n")),
    ],
  };
}

export { buildVolumeSkeletonContextBlocks };
