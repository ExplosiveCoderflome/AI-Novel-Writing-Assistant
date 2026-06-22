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
  slots: [
    {
      kind: "append" as const,
      key: "patch.customConstraints",
      label: "自定义补丁补充要求",
      description: "追加对局部补丁生成的额外约束，作为上下文块注入。留空则不追加。",
      anchor: "repair_issues",
      default: "",
      maxLength: 2000,
      placeholderHint: "例如：每个补丁块不得超过 3 句；优先修复节奏问题，结构问题标记但不修……",
    },
  ],
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
      "6. 局部补丁只处理正文中能定位到完整句段的问题；审校系统不可用、结构化判断缺失、评分不足等系统风险不属于正文片段修复。",
      "7. targetExcerpt 必须是正文里的完整短句或段落，不得是单个词语、称谓、标点或过短短语。",
      "8. 如果找不到至少 6 个字符且在正文中唯一出现的原文片段，不要输出 patch；requiresFullRewrite 设为 true，并说明 escalationReason。",
      "9. 补丁不能只是换同义词或润色句子；必须修出可见效果：场景状态变化、对白潜台词、人物口吻差异、具体代价、章末压力或连续性硬事实。",
      "10. 修 voice 时，优先给角色加入专属说话节奏、避讳、停顿、误读、嘴硬或小动作；不要把对白改得更工整。",
      "11. 修 plot 时，优先补动作、交易、失败后果、资源损失、关系裂口或新义务；不要用作者总结解释为什么重要。",
      "12. 如果整章只是顺滑但空转，局部补丁无法让主要场景真正动起来，requiresFullRewrite 设为 true。",
      "13. 如果确实无法用局部补丁安全修复，requiresFullRewrite 设为 true，并说明 escalationReason。",
      input.modeHint ? `14. 修复重点：${input.modeHint}` : "",
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
