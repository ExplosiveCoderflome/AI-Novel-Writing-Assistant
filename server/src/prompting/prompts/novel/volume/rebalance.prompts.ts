import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { createVolumeRebalanceSchema } from "../../../../services/novel/volume/volumeGenerationSchemas";
import {
  buildBeatSheetContext,
  buildCommonNovelContext,
  buildCompactVolumeCard,
  buildCompactVolumeContext,
  buildStoryMacroContext,
  type VolumeRebalancePromptInput,
} from "./shared";

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
    maxTokensBudget: 0,
  },
  outputSchema: createVolumeRebalanceSchema(),
  render: (input) => [
    new SystemMessage([
      "你是网文连载结构调度器，负责在当前卷章节列表变化后，给出相邻卷的再平衡建议。",
      "只输出严格 JSON，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "输出必须包含 decisions 数组。",
      "每条 decision 必须包含 anchorVolumeId、affectedVolumeId、direction、severity、summary、actions。",
      "",
      "判断原则：",
      "1. 如果当前卷扩张导致下一卷开局抓手变弱，要明确指出。",
      "2. 如果当前卷压缩导致前一卷兑现不完整，也要指出。",
      "3. 如果相邻卷暂时不需要动，可以用 hold，但 summary 仍要说明原因。",
      "4. actions 必须是可执行建议，不要写空话。",
    ].join("\n")),
    new HumanMessage([
      "工作模式：相邻卷再平衡建议",
      buildCommonNovelContext(input.novel),
      `前一卷：${input.previousVolume ? buildCompactVolumeCard(input.previousVolume) : "无"}`,
      `当前卷：${buildCompactVolumeCard(input.anchorVolume)}`,
      `当前卷节奏板：${buildBeatSheetContext(input.workspace.beatSheets.find((sheet) => sheet.volumeId === input.anchorVolume.id))}`,
      `下一卷：${input.nextVolume ? buildCompactVolumeCard(input.nextVolume) : "无"}`,
      `全书卷骨架：${buildCompactVolumeContext(input.workspace.volumes)}`,
      buildStoryMacroContext(input.storyMacroPlan),
      input.guidance?.trim() ? `额外指令：${input.guidance.trim()}` : "",
    ].filter(Boolean).join("\n\n")),
  ],
};
