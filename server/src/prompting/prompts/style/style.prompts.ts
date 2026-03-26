import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { styleDetectionPayloadSchema } from "../../../services/styleEngine/styleDetectionSchema";

export interface StyleDetectionPromptInput {
  styleRulesBlock: string;
  characterRulesBlock: string;
  antiRulesText: string;
  content: string;
}

export const styleRecommendationSchema = z.object({
  summary: z.string().trim().min(1),
  candidates: z.array(z.object({
    styleProfileId: z.string().trim().min(1),
    fitScore: z.number().int().min(0).max(100),
    recommendationReason: z.string().trim().min(1),
    caution: z.string().trim().optional().nullable(),
  })).min(1).max(3),
});

export interface StyleRecommendationPromptInput {
  targetCount: number;
  novelSummary: string;
  catalogText: string;
  allowedProfileIds: string[];
}

export interface StyleGenerationPromptInput {
  styleBlock: string;
  characterBlock: string;
  antiAiBlock: string;
  selfCheckBlock: string;
  mode: "generate" | "rewrite";
  prompt: string;
  targetLength: number;
}

export interface StyleRewritePromptInput {
  styleBlock: string;
  characterBlock: string;
  antiAiBlock: string;
  content: string;
  issuesBlock: string;
}

export interface StyleProfileExtractionPromptInput {
  name: string;
  category?: string;
  sourceText: string;
  retryForFeatures?: boolean;
}

export interface StyleProfileFromBookAnalysisPromptInput {
  analysisTitle: string;
  name: string;
  sourceText: string;
}

const styleRuleObjectSchema = z.object({}).passthrough();

const styleFeatureSchema = z.object({
  id: z.string().trim().min(1),
  group: z.enum(["narrative", "language", "dialogue", "rhythm", "fingerprint"]),
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
  evidence: z.string().trim().min(1),
  importance: z.number(),
  imitationValue: z.number(),
  transferability: z.number(),
  fingerprintRisk: z.number(),
  keepRulePatch: styleRuleObjectSchema,
  weakenRulePatch: styleRuleObjectSchema.optional(),
}).passthrough();

const stylePresetSchema = z.object({
  key: z.enum(["imitate", "balanced", "transfer"]),
  label: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  decisions: z.array(z.object({
    featureId: z.string().trim().min(1),
    decision: z.enum(["keep", "weaken", "remove"]),
  })),
}).passthrough();

export const styleProfileExtractionSchema = z.object({
  name: z.string().trim().optional(),
  description: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  tags: z.array(z.string().trim()).optional(),
  applicableGenres: z.array(z.string().trim()).optional(),
  analysisMarkdown: z.string().trim().optional().nullable(),
  summary: z.string().trim().optional(),
  antiAiRuleKeys: z.array(z.string().trim()).optional(),
  features: z.array(styleFeatureSchema).optional(),
  presets: z.array(stylePresetSchema).optional(),
}).passthrough();

export const styleGeneratedProfileSchema = z.object({
  name: z.string().trim().optional(),
  description: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  tags: z.array(z.string().trim()).optional(),
  applicableGenres: z.array(z.string().trim()).optional(),
  analysisMarkdown: z.string().trim().optional().nullable(),
  antiAiRuleKeys: z.array(z.string().trim()).optional(),
  narrativeRules: styleRuleObjectSchema.optional(),
  characterRules: styleRuleObjectSchema.optional(),
  languageRules: styleRuleObjectSchema.optional(),
  rhythmRules: styleRuleObjectSchema.optional(),
}).passthrough();

export const styleDetectionPrompt: PromptAsset<
  StyleDetectionPromptInput,
  z.infer<typeof styleDetectionPayloadSchema>
> = {
  id: "style.detection",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: styleDetectionPayloadSchema,
  render: (input) => [
    new SystemMessage(`你是小说写法检测器。请根据给定写法规则和反 AI 规则检查文本。
只输出 JSON 对象，字段包括：
riskScore, summary, canAutoRewrite, violations。
violations 每项字段包括：
ruleName, ruleType, severity, excerpt, reason, suggestion, canAutoRewrite。
如果没有违规，violations 返回空数组。`),
    new HumanMessage(`当前写法规则：
${input.styleRulesBlock}

角色表达规则：
${input.characterRulesBlock}

反AI规则：
${input.antiRulesText}

待检测文本：
${input.content}`),
  ],
};

export const styleRecommendationPrompt: PromptAsset<
  StyleRecommendationPromptInput,
  z.infer<typeof styleRecommendationSchema>
> = {
  id: "style.recommendation",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: styleRecommendationSchema,
  render: (input) => [
    new SystemMessage([
      "你是小说写法资产推荐器，服务对象是完全不会写作的小白用户。",
      "你的任务是从提供的写法资产列表中，挑出最适合当前小说的 2-3 套候选。",
      "只能从给定列表中选择，不允许杜撰新的写法资产 ID 或名称。",
      "优先考虑：目标读者匹配、前 30 章承诺兑现能力、商业标签匹配、题材匹配、叙事视角匹配、节奏匹配、语言质感匹配、是否能帮助小白稳定写完整本书。",
      "输出必须是 JSON 对象，格式为：",
      "{\"summary\":\"...\",\"candidates\":[{\"styleProfileId\":\"...\",\"fitScore\":88,\"recommendationReason\":\"...\",\"caution\":\"...\"}]}",
      "要求：fitScore 为 0-100 的整数；recommendationReason 必须说清楚为什么适合这本书的目标读者和前 30 章承诺；caution 可为空。",
      `请输出 ${input.targetCount} 个候选；如果确实只有 1 套明显合适，也至少给 1 个。`,
      "不要输出额外解释文字。",
    ].join("\n")),
    new HumanMessage([
      "当前小说信息：",
      input.novelSummary,
      "",
      "可选写法资产列表：",
      input.catalogText,
    ].join("\n")),
  ],
  postValidate: (output, input) => {
    const allowedIds = new Set(input.allowedProfileIds);
    if (!(output.candidates ?? []).some((candidate) => allowedIds.has(candidate.styleProfileId))) {
      throw new Error("写法推荐结果中没有有效候选。");
    }
    return output;
  },
};

export const styleGenerationPrompt: PromptAsset<StyleGenerationPromptInput, string, string> = {
  id: "style.generate",
  version: "v1",
  taskType: "writer",
  mode: "text",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => [
    new SystemMessage([
      "你是小说写作助手。请严格遵守以下写法约束。",
      input.styleBlock,
      input.characterBlock,
      input.antiAiBlock,
      `输出要求：${input.mode === "rewrite" ? "直接输出改写后的正文，不解释修改原因。" : `直接输出正文，长度约 ${input.targetLength} 字。`}`,
      input.selfCheckBlock,
    ].filter(Boolean).join("\n\n")),
    new HumanMessage(input.prompt),
  ],
};

export const styleRewritePrompt: PromptAsset<StyleRewritePromptInput, string, string> = {
  id: "style.rewrite",
  version: "v1",
  taskType: "repair",
  mode: "text",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => [
    new SystemMessage([
      "你是小说修文编辑。",
      "请根据违规问题修正原文，只改违规表达，不改变事件事实、事件顺序和人物关系。",
      input.styleBlock,
      input.characterBlock,
      input.antiAiBlock,
      "输出要求：只输出修正后的正文，不解释修改过程。",
    ].filter(Boolean).join("\n\n")),
    new HumanMessage(`原文：
${input.content}

检测到的问题：
${input.issuesBlock}`),
  ],
};

export const styleProfileExtractionPrompt: PromptAsset<
  StyleProfileExtractionPromptInput,
  z.infer<typeof styleProfileExtractionSchema>
> = {
  id: "style.profile.extract",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: styleProfileExtractionSchema,
  render: (input) => [
    new SystemMessage([
      "你是小说写法特征提取器。",
      "请从用户提供的文本里尽量完整提取“可用于仿写或写法迁移”的全部关键特征，并严格输出 JSON 对象。",
      "字段包括：name, description, category, tags, applicableGenres, analysisMarkdown, summary, antiAiRuleKeys, features, presets。",
      "要求：",
      "1. features 必须尽量覆盖叙事、语言、对话、节奏、指纹特征，不要为了安全而过度删减。",
      "2. 每个 feature 都必须提供 keepRulePatch；如果适合“弱化”，再提供 weakenRulePatch。",
      "3. importance / imitationValue / transferability / fingerprintRisk 都用 0-1 小数。",
      "4. presets 必须至少包含 imitate / balanced / transfer 三套建议。",
      "5. antiAiRuleKeys 只能推荐系统已有规则 key。",
      input.retryForFeatures
        ? "6. 上一次返回的 features 不可用。这一次必须返回非空 features 数组，并优先补足结构化特征。"
        : "6. 只输出 JSON，不要输出解释。",
      input.retryForFeatures
        ? "7. 如果其他字段不好判断，可以简短，但不要省略 features。"
        : "",
    ].filter(Boolean).join("\n")),
    new HumanMessage([
      `写法名称：${input.name}`,
      `建议分类：${input.category ?? "未指定"}`,
      "",
      "原文：",
      input.sourceText,
      input.retryForFeatures
        ? "\n重试要求：\n- 至少返回 8 个 feature（如果原文足够长）。\n- 使用精确字段名 features。\n- group 只能是 narrative、language、dialogue、rhythm、fingerprint。"
        : "",
    ].filter(Boolean).join("\n")),
  ],
};

export const styleProfileFromBookAnalysisPrompt: PromptAsset<
  StyleProfileFromBookAnalysisPromptInput,
  z.infer<typeof styleGeneratedProfileSchema>
> = {
  id: "style.profile.from_book_analysis",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: styleGeneratedProfileSchema,
  render: (input) => [
    new SystemMessage([
      "请把拆书分析中的“文风与技法”转成可执行写法资产。",
      "输出 JSON，字段包括：name, description, category, tags, applicableGenres, analysisMarkdown, narrativeRules, characterRules, languageRules, rhythmRules, antiAiRuleKeys。",
      "要求：",
      "1. narrativeRules / characterRules / languageRules / rhythmRules 必须是结构化对象。",
      "2. antiAiRuleKeys 只能推荐系统已有规则 key。",
      "3. 不要输出解释文字，只输出 JSON 对象。",
    ].join("\n")),
    new HumanMessage(`拆书分析标题：${input.analysisTitle}
写法名称：${input.name}

拆书中的文风与技法：
${input.sourceText}`),
  ],
};
