import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { createBookVolumeSkeletonSchema } from "../../../../services/novel/volume/volumeGenerationSchemas";
import {
  buildCommonNovelContext,
  buildCompactVolumeContext,
  buildStoryMacroContext,
  buildStrategyContext,
  type VolumeSkeletonPromptInput,
} from "./shared";

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
      maxTokensBudget: 0,
    },
    outputSchema: createBookVolumeSkeletonSchema(targetVolumeCount),
    render: (input) => [
      new SystemMessage([
        "你是长篇网文卷纲策划，负责把卷战略落实成“卷骨架”。",
        "这一步只做卷级骨架，不做章节列表。",
        "",
        "只输出严格 JSON，不要输出 Markdown、解释、注释、代码块或额外文本。",
        "",
        `必须严格输出 ${targetVolumeCount} 卷。`,
        "每卷必须包含且只能包含这些字段：title、summary、openingHook、mainPromise、primaryPressureSource、coreSellingPoint、escalationMode、protagonistChange、midVolumeRisk、climax、payoffType、nextVolumeHook、resetPoint、openPayoffs。",
        "",
        "卷级规划原则：",
        "1. 这是连载网文，不是平均切段。每卷都要有明确的追读驱动。",
        "2. openingHook 负责抓读者，primaryPressureSource 负责压迫感，coreSellingPoint 负责记忆点。",
        "3. midVolumeRisk 必须提前暴露中段塌陷风险，避免后续拆章失控。",
        "4. payoffType 要说明本卷是阶段兑现、阶段反转、身份揭露、关系兑现还是大坑升级。",
        "5. 各卷之间要递进，但不能同质。",
        "",
        "质量要求：",
        "1. 所有字段都必须具体、可执行，不能写空话。",
        "2. 不要输出泛泛的“剧情升级”“角色成长”。",
        "3. 结果必须严格服从输入的卷战略建议，尤其是硬规划卷和软规划卷的差异。",
      ].join("\n")),
      new HumanMessage([
        "工作模式：卷骨架生成",
        buildCommonNovelContext(input.novel),
        `章节预算：${input.chapterBudget}`,
        buildStrategyContext(input.strategyPlan),
        `当前卷骨架：${buildCompactVolumeContext(input.workspace.volumes)}`,
        buildStoryMacroContext(input.storyMacroPlan),
        input.guidance?.trim() ? `额外指令：${input.guidance.trim()}` : "",
      ].filter(Boolean).join("\n\n")),
    ],
  };
}
