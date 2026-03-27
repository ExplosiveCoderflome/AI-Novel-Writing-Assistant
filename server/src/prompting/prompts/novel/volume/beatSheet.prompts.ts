import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { createVolumeBeatSheetSchema } from "../../../../services/novel/volume/volumeGenerationSchemas";
import {
  buildCommonNovelContext,
  buildCompactVolumeCard,
  buildCompactVolumeContext,
  buildStoryMacroContext,
  buildStrategyContext,
  type VolumeBeatSheetPromptInput,
} from "./shared";

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
    maxTokensBudget: 0,
  },
  outputSchema: createVolumeBeatSheetSchema(),
  render: (input) => [
    new SystemMessage([
      "你是网文节奏策划，负责为单卷生成“卷内节奏板”。",
      "这一步位于卷骨架和章节列表之间，目的是防止拆章平均化。",
      "",
      "只输出严格 JSON，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "",
      "输出必须包含 beats 数组。",
      "beats 必须覆盖至少这些阶段：开卷抓手、第一轮升级、中段反转、高潮前挤压、卷高潮、卷尾钩子。",
      "每个 beat 必须包含 key、label、summary、chapterSpanHint、mustDeliver。",
      "",
      "节奏设计原则：",
      "1. 每个 beat 都要说明它在连载追读里的功能，而不是只写事件描述。",
      "2. chapterSpanHint 只给范围提示，不要直接拆成具体章节。",
      "3. mustDeliver 要明确写出必须交付给读者的看点、关系变化、信息揭露或压迫升级。",
      "4. 中段反转和卷尾钩子不能弱，否则后续章节列表会发虚。",
    ].join("\n")),
    new HumanMessage([
      "工作模式：当前卷节奏板生成",
      buildCommonNovelContext(input.novel),
      buildStrategyContext(input.strategyPlan),
      `当前卷骨架：${buildCompactVolumeCard(input.targetVolume)}`,
      `全书卷骨架：${buildCompactVolumeContext(input.workspace.volumes)}`,
      buildStoryMacroContext(input.storyMacroPlan),
      input.guidance?.trim() ? `额外指令：${input.guidance.trim()}` : "",
    ].filter(Boolean).join("\n\n")),
  ],
};
