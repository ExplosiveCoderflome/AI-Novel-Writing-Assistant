import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../core/renderContextBlocks";
import { fullAuditOutputSchema } from "../../../services/audit/auditSchemas";
import { NOVEL_PROMPT_BUDGETS } from "../novel/promptBudgetProfiles";

export interface AuditChapterPromptInput {
  novelTitle: string;
  chapterTitle: string;
  requestedTypes: string[];
  storyModeContext: string;
  content: string;
  ragContext: string;
}

export const auditChapterPrompt: PromptAsset<AuditChapterPromptInput, z.infer<typeof fullAuditOutputSchema>> = {
  id: "audit.chapter.full",
  version: "v1",
  taskType: "review",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterReview,
    preferredGroups: [
      "chapter_mission",
      "structure_obligations",
      "world_rules",
      "historical_issues",
    ],
    dropOrder: [
      "recent_chapters",
      "participant_subset",
      "open_conflicts",
    ],
  },
  outputSchema: fullAuditOutputSchema,
  render: (input, context) => [
    new SystemMessage([
      "你是中文长篇小说章节审校助手。",
      "你的任务是基于章节正文、分层上下文、故事模式约束和检索补充，输出可被系统直接消费的严格 JSON 审校结果。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释或额外文本。",
      "",
      "审校原则：",
      "1. 只根据给定正文和上下文判断，不得脑补未提供的剧情、设定或作者意图。",
      "2. 所有问题都必须具体，evidence 必须指向文本中的明确现象，fixSuggestion 必须可执行。",
      "3. score、issues、auditReports 三部分必须彼此一致，不能互相矛盾。",
      "4. requestedTypes 中要求的类型必须全部覆盖；即使没有明显问题，也要给出简洁结论。",
      "",
      "评分维度：",
      "1. coherence: 连贯性、因果与信息自洽。",
      "2. repetition: 表达或信息重复。",
      "3. pacing: 推进效率与节奏平衡。",
      "4. voice: 叙事声音与文本稳定性。",
      "5. engagement: 吸引力、张力和追读动力。",
      "6. overall: 综合评分，必须与前述维度大体匹配。",
      "",
      "auditReports.type 只能使用 continuity、character、plot、mode_fit。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      `章节：${input.chapterTitle}`,
      `审校范围：${input.requestedTypes.join(", ")}`,
      "",
      "分层上下文：",
      renderSelectedContextBlocks(context),
      "",
      "故事模式约束：",
      input.storyModeContext || "none",
      "",
      "正文：",
      input.content,
      "",
      "检索补充：",
      input.ragContext || "none",
    ].join("\n")),
  ],
};
