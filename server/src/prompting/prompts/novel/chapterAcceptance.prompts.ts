import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../core/renderContextBlocks";
import { NOVEL_PROMPT_BUDGETS } from "./promptBudgetProfiles";

export const chapterAcceptanceIssueCategorySchema = z.enum([
  "continuity",
  "character",
  "plot",
  "mode_fit",
  "voice",
]);

export const chapterAcceptanceAssessmentSchema = z.object({
  status: z.enum(["accepted", "repairable", "needs_manual_review", "continue_with_risk"]),
  score: z.object({
    coherence: z.number().min(0).max(100),
    pacing: z.number().min(0).max(100),
    repetition: z.number().min(0).max(100),
    engagement: z.number().min(0).max(100),
    voice: z.number().min(0).max(100),
    overall: z.number().min(0).max(100),
  }),
  summary: z.string().trim().min(1),
  blockingIssues: z.array(z.object({
    severity: z.enum(["low", "medium", "high", "critical"]),
    category: chapterAcceptanceIssueCategorySchema,
    code: z.string().trim().min(1),
    evidence: z.string().trim().min(1),
    fixSuggestion: z.string().trim().min(1),
  })).default([]),
  repairDirectives: z.array(z.object({
    mode: z.enum(["patch", "rewrite", "manual"]),
    target: z.enum(["continuity", "character", "plot", "ending", "voice"]),
    instruction: z.string().trim().min(1),
  })).default([]),
  riskTags: z.array(z.string().trim().min(1)).default([]),
  assetSyncRecommendation: z.object({
    priority: z.enum(["normal", "high"]).default("normal"),
    reason: z.string().trim().min(1),
    requiresFullPayoffReconcile: z.boolean().default(false),
  }),
  continuePolicy: z.enum(["continue", "repair_once", "pause"]),
});

export type ChapterAcceptanceAssessmentOutput = z.infer<typeof chapterAcceptanceAssessmentSchema>;

export interface ChapterAcceptancePromptInput {
  novelTitle: string;
  chapterOrder: number;
  chapterTitle: string;
  targetWordCount?: number | null;
  content: string;
}

const CHAPTER_ACCEPTANCE_EXAMPLE: ChapterAcceptanceAssessmentOutput = {
  status: "repairable",
  score: {
    coherence: 82,
    pacing: 78,
    repetition: 86,
    engagement: 80,
    voice: 81,
    overall: 81,
  },
  summary: "本章主线可以成立，但结尾钩子和中段推进需要轻修后再继续。",
  blockingIssues: [
    {
      severity: "medium",
      category: "plot",
      code: "ending_hook_soft",
      evidence: "结尾只说明主角准备行动，没有形成新的压力或悬念。",
      fixSuggestion: "补强结尾的决策代价或外部压力，让下一章入口更明确。",
    },
  ],
  repairDirectives: [
    {
      mode: "patch",
      target: "ending",
      instruction: "保留正文主体，只补强结尾 300 字以内的钩子和压力。",
    },
  ],
  riskTags: ["ending_hook"],
  assetSyncRecommendation: {
    priority: "normal",
    reason: "本章有可记录的剧情推进，但没有明显需要全量伏笔对账的风险。",
    requiresFullPayoffReconcile: false,
  },
  continuePolicy: "repair_once",
};

export const chapterAcceptanceAssessmentPrompt: PromptAsset<
  ChapterAcceptancePromptInput,
  ChapterAcceptanceAssessmentOutput
> = {
  id: "novel.chapter.acceptance_assessment",
  version: "v1",
  taskType: "review",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterAcceptance,
    preferredGroups: [
      "chapter_mission",
      "structure_obligations",
      "local_state",
      "style_contract",
      "open_conflicts",
    ],
    dropOrder: [
      "recent_chapters",
      "participant_subset",
      "world_rules",
      "historical_issues",
    ],
  },
  contextRequirements: [
    { group: "chapter_mission", required: true, priority: 100 },
    { group: "structure_obligations", priority: 94 },
    { group: "local_state", priority: 89 },
    { group: "style_contract", priority: 74 },
    { group: "open_conflicts", priority: 70 },
  ],
  structuredOutputHint: {
    example: CHAPTER_ACCEPTANCE_EXAMPLE,
    note: "一次性判断章节是否可接收、是否需要局部修文、是否需要暂停确认，以及后续资产同步优先级。",
  },
  outputSchema: chapterAcceptanceAssessmentSchema,
  render: (input, context) => [
    new SystemMessage([
      "你是中文长篇小说正文接收闸门。",
      "你的任务是一次性判断当前章节正文是否可以保存并继续推进，是否只需要局部轻修，是否需要暂停人工确认，以及后续资产同步是否需要高优先级处理。",
      "",
      "只输出合法 JSON 对象，不要输出 Markdown、解释、注释或额外文本。",
      "",
      "判断原则：",
      "1. 默认支持继续推进；普通可优化问题不要升级为暂停。",
      "2. 只有严重越过章节任务、关键连续性断裂、角色行为严重失真、受保护信息提前泄露、正文无法阅读时，才使用 needs_manual_review。",
      "3. 可通过局部补丁解决的问题使用 repairable，并给出 repairDirectives。",
      "4. 章节可以继续但存在后续风险时使用 continue_with_risk，并用 riskTags 说明风险。",
      "5. blockingIssues 保留最关键的 0-5 条，每条必须有明确证据和可执行修复建议。",
      "6. style_contract 或反 AI 要求属于强约束；发现明显来源实体泄露、模板腔、总结腔时归入 voice。",
      "7. assetSyncRecommendation 只判断资产同步优先级和是否需要全量伏笔对账，不要输出落库细节。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      `章节：第 ${input.chapterOrder} 章 ${input.chapterTitle}`,
      typeof input.targetWordCount === "number" ? `目标长度：约 ${input.targetWordCount} 字` : "目标长度：未指定",
      "",
      "分层上下文：",
      renderSelectedContextBlocks(context),
      "",
      "正文：",
      input.content,
    ].join("\n")),
  ],
};
