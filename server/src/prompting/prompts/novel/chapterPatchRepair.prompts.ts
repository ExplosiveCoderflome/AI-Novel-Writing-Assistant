import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ChapterPatchRepairPlan } from "@ai-novel/shared/types/chapterPatchRepair";
import { chapterPatchRepairPlanSchema } from "@ai-novel/shared/types/chapterPatchRepair";
import type { PromptAsset } from "../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../core/renderContextBlocks";
import { NOVEL_PROMPT_BUDGETS } from "./promptBudgetProfiles";

export interface ChapterPatchRepairPromptInput {
  novelTitle: string;
  chapterTitle: string;
  chapterContent: string;
  issuesJson: string;
  modeHint?: string;
}

export const chapterPatchRepairPrompt: PromptAsset<
  ChapterPatchRepairPromptInput,
  ChapterPatchRepairPlan
> = {
  id: "novel.review.patch",
  version: "v1",
  taskType: "repair",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterRepair,
    preferredGroups: [
      "repair_issues",
      "chapter_mission",
      "repair_boundaries",
      "world_rules",
    ],
    dropOrder: [
      "recent_chapters",
      "participant_subset",
      "continuation_constraints",
    ],
  },
  outputSchema: chapterPatchRepairPlanSchema,
  render: (input, context) => [
    new SystemMessage([
      "你是网络小说局部修文编辑。",
      "当前任务不是整章重写，而是输出可以被程序安全应用的局部补丁计划。",
      "只输出严格 JSON，不要 Markdown、解释或正文全文。",
      "",
      "【补丁原则】",
      "1. strategy 默认必须是 patch_first。",
      "2. patches 中每个 targetExcerpt 必须逐字摘自当前正文，并且应足够长，确保在正文里只出现一次。",
      "3. replacement 只替换 targetExcerpt 对应片段，不要改写无关段落；如果修复目标是删除重复片段，replacement 可以是空字符串。",
      "4. 优先修复问题清单中影响主线推进、连续性、人物动机、节奏和结尾钩子的关键问题。",
      "5. 不得新增重大设定、核心角色或与章节任务冲突的剧情转向。",
      "6. 如果确实无法用局部补丁安全修复，requiresFullRewrite 设为 true，并说明 escalationReason。",
      input.modeHint ? `7. 修复重点：${input.modeHint}` : "",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      `章节：${input.chapterTitle}`,
      "",
      "【分层上下文】",
      renderSelectedContextBlocks(context),
      "",
      "【当前正文】",
      input.chapterContent,
      "",
      "【问题清单】",
      input.issuesJson,
      "",
      "请输出局部补丁 JSON。",
    ].join("\n")),
  ],
};
