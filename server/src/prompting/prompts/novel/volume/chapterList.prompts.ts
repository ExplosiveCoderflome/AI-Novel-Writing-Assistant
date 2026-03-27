import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../../core/promptTypes";
import { createVolumeChapterListSchema } from "../../../../services/novel/volume/volumeGenerationSchemas";
import {
  buildBeatSheetContext,
  buildCommonNovelContext,
  buildCompactVolumeCard,
  buildCompactVolumeContext,
  buildStoryMacroContext,
  type VolumeChapterListPromptInput,
} from "./shared";

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
      maxTokensBudget: 0,
    },
    outputSchema: createVolumeChapterListSchema(targetChapterCount),
    render: (input) => [
      new SystemMessage([
        "你是网文章纲策划，负责把“当前卷节奏板”拆成具体章节列表。",
        "章节列表必须服从卷骨架和节奏板，不能跳过节奏板自行平均切块。",
        "",
        "只输出严格 JSON，不要输出 Markdown、解释、注释、代码块或额外文本。",
        "",
        `只允许输出 ${targetChapterCount} 章，且每章只允许包含 title、summary。`,
        "summary 必须说明本章具体推进了什么，以及它在当前卷节奏中的作用。",
        "",
        "拆章原则：",
        "1. 章节必须覆盖节奏板中的关键 beat，不允许漏掉中段反转、高潮前挤压或卷尾钩子。",
        "2. 每章都要承担明确功能，不能出现无效缓冲章。",
        "3. 前段负责进入局面，中段负责升级与转折，后段负责兑现与卷尾牵引。",
        "4. 不要把多个重大 beat 挤进同一章导致节奏失真，也不要为了凑章数注水。",
      ].join("\n")),
      new HumanMessage([
        "工作模式：当前卷章节列表生成",
        buildCommonNovelContext(input.novel),
        `目标章节数：${targetChapterCount}`,
        `上一卷：${input.previousVolume ? buildCompactVolumeCard(input.previousVolume) : "无"}`,
        `当前卷：${buildCompactVolumeCard(input.targetVolume)}`,
        `当前卷节奏板：${buildBeatSheetContext(input.targetBeatSheet)}`,
        `下一卷：${input.nextVolume ? buildCompactVolumeCard(input.nextVolume) : "无"}`,
        `全书卷骨架：${buildCompactVolumeContext(input.workspace.volumes)}`,
        buildStoryMacroContext(input.storyMacroPlan),
        input.guidance?.trim() ? `额外指令：${input.guidance.trim()}` : "",
      ].filter(Boolean).join("\n\n")),
    ],
  };
}
