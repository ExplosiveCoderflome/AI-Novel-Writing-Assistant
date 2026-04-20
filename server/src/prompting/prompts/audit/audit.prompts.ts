import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../core/renderContextBlocks";
import { fullAuditOutputSchema } from "../../../services/audit/auditSchemas";
import { NOVEL_PROMPT_BUDGETS } from "../novel/promptBudgetProfiles";

const AUDIT_CHAPTER_EXAMPLE = {
  score: {
    coherence: 82,
    repetition: 76,
    pacing: 79,
    voice: 84,
    engagement: 81,
    overall: 80,
  },
  issues: [
    {
      severity: "medium",
      category: "pacing",
      evidence: "中段连续两段都在解释处境，但没有新增推进。",
      fixSuggestion: "压缩第二段解释，把信息并入动作或对话里。",
    },
  ],
  auditReports: [
    {
      auditType: "plot",
      overallScore: 78,
      summary: "主线推进存在，但中段阻力升级还不够明确。",
      issues: [
        {
          severity: "medium",
          code: "plot_escalation_soft",
          description: "主线冲突已经出现，但代价抬升还不够。",
          evidence: "帮派威胁出现后，主角很快脱身，压力没有持续停留。",
          fixSuggestion: "补一个无法立刻摆脱的代价或后续追踪后果。",
        },
      ],
    },
  ],
};

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
  version: "v2",
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
  structuredOutputHint: {
    example: AUDIT_CHAPTER_EXAMPLE,
    note: "severity 只能是 low/medium/high/critical；issues.category 只能是 coherence/repetition/pacing/voice/engagement/logic，不要输出 plot、character 或中文分类名。",
  },
  outputSchema: fullAuditOutputSchema,
  render: (input, context) => [
    new SystemMessage([
      "你是中文长篇小说章节审校助手。",
      "你的任务是基于章节正文、分层上下文、故事模式约束和检索补充，输出可被系统直接消费的严格 JSON 审校结果。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释或额外文本。",
      "",
      "硬性枚举要求：",
      "1. 顶层 issues.category 只能是 coherence、repetition、pacing、voice、engagement、logic。",
      "2. 不要输出 plot、character、中文分类名或任何自定义类别。",
      "3. auditReports.auditType 只能使用 continuity、character、plot、mode_fit。",
      "",
      "审校原则：",
      "1. 只根据给定正文和上下文判断，不得脑补未提供的剧情、设定或作者意图。",
      "2. 所有问题都必须具体，evidence 必须指向文本中的明确现象，fixSuggestion 必须可执行。",
      "3. score、issues、auditReports 三部分必须彼此一致，不能互相矛盾。",
      "4. requestedTypes 中要求的类型必须全部覆盖；即使问题不明显，也要给出简短结论。",
      "",
      "评分维度：",
      "1. coherence：连贯性、因果与信息自洽。",
      "2. repetition：表达或信息重复。",
      "3. pacing：推进效率与节奏平衡。",
      "4. voice：叙事声音与文本稳定性。",
      "5. engagement：吸引力、张力和追读动力。",
      "6. overall：综合评分，必须与前述维度大体匹配。",
      "",
      "输出必须严格符合 fullAuditOutputSchema。",
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
      "",
      "输出提醒：顶层 issues.category 只能使用 coherence/repetition/pacing/voice/engagement/logic。",
    ].join("\n")),
  ],
};
