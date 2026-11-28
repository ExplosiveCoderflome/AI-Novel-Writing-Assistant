import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { chapterDialogueOutput } from "@ai-novel/shared/types/director/chapterReview/discussion";
import type { ReviewChange } from "@ai-novel/shared/types/director/review/fieldSuggestions";
import type { VolumeChapterPlan } from "@ai-novel/shared/types/novel";
import type { z } from "zod";
import type { PromptAsset } from "../../../core/promptTypes";

interface Input {
  storyInput: string;
  volumeTitle: string;
  chapter: Pick<VolumeChapterPlan, "title" | "summary" | "purpose" | "exclusiveEvent" | "endingState" | "nextChapterEntryState" | "styleContract"> & { order: number };
  scenes: { key: string; title: string; mustAdvance: string[]; mustPreserve: string[]; forbiddenExpansion: string[] }[];
  editor: Record<string, string>;
  requestText: string;
  history: { author: string; assistant: string | null }[];
  priorProposal: ReviewChange<string>[] | null;
}
export const chapterReviewDialoguePrompt: PromptAsset<Input, z.infer<typeof chapterDialogueOutput>> = {
  id: "novel.director.chapter_dialogue",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  management: { productPrompt: true, editModes: ["readonly"] },
  contextPolicy: { maxTokensBudget: 16000 },
  outputSchema: chapterDialogueOutput,
  render: (input) => [
    new SystemMessage(
      [
        "你在导演的章节任务与场景确认页帮助新手作者。依据本章路线、写法与当前编辑稿，讨论角色要做什么、遇到什么阻力、场景结束时发生什么变化。",
        "询问原因或比较可能性时直接回答，changes 留空。作者要求调整时给出可以独立采纳的字段新值和具体理由。只改当前章，保留其他场景的承接。",
        "改章节任务、需要避免或目标字数用 target=chapter。改单个场景用 target=scene 并复制 scenes 中的 sceneKey（key），例如只调整第二场的转折。editor 中场景字段由 [场景key, 字段名] 标识。",
        "以编辑稿为准，保留本章核心事件、结尾与下章开场的衔接，尊重各场已约定的事实。字数以正整数字符串表示。不要生成正文、另编场景标识或替作者确认修改。",
      ].join("\n"),
    ),
    new HumanMessage(JSON.stringify(input)),
  ],
};
