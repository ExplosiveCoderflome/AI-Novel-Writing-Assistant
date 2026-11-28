import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { OutlineDocument } from "@ai-novel/shared/types/outline";
import { volumeBeatsSchema, volumeBeatSlotKeySchema } from "@ai-novel/shared/types/volumeBeatSheet";
import { VOLUME_BEAT_SLOT_DEFINITIONS } from "@ai-novel/shared/types/volumeBeatSlots";
import { validateBeatSheetChapterCoverage } from "@ai-novel/shared/types/volumeBeatCoverage";
import type { PromptAsset } from "../../core/promptTypes";
import { createVolumeBeatSheetSchema } from "../../../services/novel/volume/volumeGenerationSchemas";

export const beatPlanningInstruction = [
  "先定卷骨架，再为有章纲的卷制定 beats，最后给每章一个本卷主节奏段 beatKey。章序范围是规划提示；章节具体归属由其剧情决定。",
  "节奏段字段为 key、label、title（本卷短标题）、summary、chapterSpanHint（本卷内章序，如1-2章）、mustDeliver（必须兑现的内容数组）。",
  "按职能顺序规划，各职能每卷最多一次。短卷（不超过8章）至少有开卷抓手、卷高潮、卷尾钩子，可共享章序。长卷包含全部必需职能。跨度从卷内第1章连续覆盖到计划篇幅。终卷兑现结局。",
  VOLUME_BEAT_SLOT_DEFINITIONS.map(s => `${s.key}=${s.roleLabel}（${s.required ? "必需" : "可选"}）`).join("；"),
].join("\n");

const outputSchema = z.object({beats: volumeBeatsSchema, assignments: z.array(z.object({
  chapterId: z.string().min(1), beatKey: volumeBeatSlotKeySchema,
}))});
interface Input {
  story: OutlineDocument["story"]; volume: OutlineDocument["volumes"][number];
  chapters: OutlineDocument["chapters"]; targetChapterCount: number;
}
export const outlineVolumeBeatsPrompt: PromptAsset<Input, z.infer<typeof outputSchema>> = {
  id:"outline.volume_beats", version:"v1", taskType:"planner", mode:"structured", language:"zh",
  contextPolicy:{maxTokensBudget:12000}, outputSchema, semanticRetryPolicy:{maxAttempts:1},
  render: input => [new SystemMessage([beatPlanningInstruction,
    "对照当前卷章纲，为每个已有章节返回一次明确归属，使用原始章节 nodeId。保留章名、章序和已有剧情，可以调整节奏安排。按 targetChapterCount 规划，尚未写章纲的位置也可以规划节奏。",
  ].join("\n")), new HumanMessage(JSON.stringify(input))],
  postValidate: (output, input) => {
    createVolumeBeatSheetSchema(input.targetChapterCount).parse(output);
    const coverage = validateBeatSheetChapterCoverage({beatSheet:output, targetChapterCount:input.targetChapterCount});
    if (!coverage.accepted) throw new Error(coverage.message!);
    const keys = new Set(output.beats.map(b => b.key));
    const ids = new Set(output.assignments.map(a => a.chapterId));
    if (output.assignments.length !== input.chapters.length || ids.size !== input.chapters.length ||
      input.chapters.some(c => !ids.has(c.nodeId)) || output.assignments.some(a => !keys.has(a.beatKey)))
      throw new Error("每章必须恰好关联本卷的一个有效节奏段，请使用已有章节 ID。");
    return output;
  },
};
