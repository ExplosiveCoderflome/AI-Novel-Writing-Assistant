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

function normalizeAcceptanceCategory(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "coherence" || normalized === "logic") {
    return "continuity";
  }
  if (normalized === "pacing" || normalized === "repetition" || normalized === "ending") {
    return "plot";
  }
  if (normalized === "style" || normalized === "tone") {
    return "voice";
  }
  if (normalized === "mode" || normalized === "mode-fit" || normalized === "mode fit") {
    return "mode_fit";
  }
  return normalized;
}

function normalizeAcceptanceStatus(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (["acceptable", "accept", "pass", "passed", "approved", "ok", "okay"].includes(normalized)) {
    return "accepted";
  }
  if (["needs_repair", "fixable", "repair", "patchable", "needs_fix"].includes(normalized)) {
    return "repairable";
  }
  if (["manual", "stop", "review_required", "needs_review", "manual_review"].includes(normalized)) {
    return "needs_manual_review";
  }
  if (["continue", "go_on", "proceed", "continue_risk"].includes(normalized)) {
    return "continue_with_risk";
  }
  return normalized;
}

function normalizeRepairTarget(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "coherence" || normalized === "logic") {
    return "continuity";
  }
  if (
    normalized === "pacing"
    || normalized === "repetition"
    || normalized === "middle"
    || normalized === "internal_monologue"
    || normalized === "internal monologue"
  ) {
    return "plot";
  }
  if (normalized === "ending_hook" || normalized === "ending hook" || normalized === "hook") {
    return "ending";
  }
  if (normalized === "style" || normalized === "tone" || normalized === "ending_tone" || normalized === "ending tone") {
    return "voice";
  }
  return normalized;
}

function normalizeRepairMode(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "local" || normalized === "light" || normalized === "minor" || normalized === "fix") {
    return "patch";
  }
  if (normalized === "full_rewrite" || normalized === "full rewrite" || normalized === "redo") {
    return "rewrite";
  }
  if (normalized === "pause" || normalized === "human" || normalized === "review") {
    return "manual";
  }
  return normalized;
}

function normalizeContinuePolicy(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "go_on" || normalized === "proceed" || normalized === "continue_with_risk") {
    return "continue";
  }
  if (normalized === "repair" || normalized === "patch" || normalized === "fix_once") {
    return "repair_once";
  }
  if (normalized === "manual" || normalized === "needs_manual_review" || normalized === "stop") {
    return "pause";
  }
  return normalized;
}

function normalizeMissingObligationKind(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    must_hit: "must_hit_now",
    required_must_hit: "must_hit_now",
    required_hit: "must_hit_now",
    must_preserve_now: "must_preserve",
    required_preserve: "must_preserve",
    required_payoff_touch: "payoff_touch",
    payoff: "payoff_touch",
    required_character_appearance: "character_appearance",
    character: "character_appearance",
    character_required: "character_appearance",
    required_goal_change: "goal_change",
    goal: "goal_change",
    forbidden: "forbidden_crossing",
    forbidden_event: "forbidden_crossing",
  };
  return aliases[normalized] ?? normalized;
}

function readAliasString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeMissingObligation(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  const kind = normalizeMissingObligationKind(
    record.kind ?? record.obligationType ?? record.type ?? record.category,
  );
  const summary = readAliasString(record, ["summary", "target", "fixSuggestion", "description", "issue"]);
  const evidence = readAliasString(record, ["evidence", "reason", "text"]);
  return {
    ...record,
    kind,
    ...(summary ? { summary } : {}),
    ...(evidence ? { evidence } : {}),
  };
}

export const chapterAcceptanceAssessmentSchema = z.object({
  status: z.preprocess(
    normalizeAcceptanceStatus,
    z.enum(["accepted", "repairable", "needs_manual_review", "continue_with_risk"]),
  ),
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
    category: z.preprocess(normalizeAcceptanceCategory, chapterAcceptanceIssueCategorySchema),
    code: z.string().trim().min(1),
    evidence: z.string().trim().min(1),
    fixSuggestion: z.string().trim().min(1),
  })).default([]),
  repairDirectives: z.array(z.object({
    mode: z.preprocess(normalizeRepairMode, z.enum(["patch", "rewrite", "manual"])),
    target: z.preprocess(normalizeRepairTarget, z.enum(["continuity", "character", "plot", "ending", "voice"])),
    instruction: z.string().trim().min(1),
  })).default([]),
  missingObligations: z.array(z.preprocess(normalizeMissingObligation, z.object({
    kind: z.preprocess(normalizeMissingObligationKind, z.enum([
      "must_hit_now",
      "must_preserve",
      "payoff_touch",
      "character_appearance",
      "goal_change",
      "forbidden_crossing",
    ])),
    summary: z.string().trim().min(1),
    evidence: z.string().trim().min(1).nullable().optional(),
  }))).default([]),
  repairability: z.enum([
    "none",
    "patchable_obligation_gap",
    "rewrite_needed",
    "plan_misalignment",
  ]).default("none"),
  decisionReason: z.string().trim().min(1).default("正文可继续推进。"),
  riskTags: z.array(z.string().trim().min(1)).default([]),
  assetSyncRecommendation: z.object({
    priority: z.enum(["normal", "high"]).default("normal"),
    reason: z.string().trim().min(1),
    requiresFullPayoffReconcile: z.boolean().default(false),
  }),
  continuePolicy: z.preprocess(normalizeContinuePolicy, z.enum(["continue", "repair_once", "pause"])),
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
  missingObligations: [
    {
      kind: "must_hit_now",
      summary: "本章必须让主角发现敌方试探，但正文只写了日常过渡。",
      evidence: "正文没有出现敌方试探或主角识破的可见行动。",
    },
    {
      kind: "character_appearance",
      summary: "关键角色春桃必须出场并执行观察任务。",
      evidence: "正文未出现春桃，也没有替代执行者。",
    },
  ],
  repairability: "patchable_obligation_gap",
  decisionReason: "结尾钩子可以通过局部补丁补齐，不需要重排章节计划。",
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
      "obligation_contract",
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
    { group: "obligation_contract", required: true, priority: 98 },
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
      "6. obligation contract 是本章硬合同。must hit now 与 forbidden crossing 缺口必须写入 missingObligations；可后续承接的 payoff、角色露面或目标变化缺口，只有会影响下一章入口时才写入 missingObligations，否则放入 riskTags。",
      "7. repairability 只能用 none、patchable_obligation_gap、rewrite_needed、plan_misalignment。局部漏写但不阻断下一章时优先 continue_with_risk；只有需要当前章节立刻补齐时才用 patchable_obligation_gap。",
      "8. style_contract 或反 AI 要求属于强约束；发现明显来源实体泄露、模板腔、总结腔时归入 voice。",
      "9. assetSyncRecommendation 只判断资产同步优先级和是否需要全量伏笔对账，不要输出落库细节。",
      "10. blockingIssues.category 只能使用 continuity、character、plot、mode_fit、voice；节奏、重复、中段铺垫、结尾钩子都归入 plot。",
      "11. repairDirectives.target 只能使用 continuity、character、plot、ending、voice；不要输出 middle、pacing、internal_monologue、ending_tone 等自定义目标。",
      "12. repairDirectives.mode 只能使用 patch、rewrite、manual；continuePolicy 只能使用 continue、repair_once、pause。",
      "13. missingObligations 必须是对象数组，每项只能使用 kind、summary、evidence；不得输出字符串数组，也不得输出 obligationType、target、fixSuggestion、type 等别名字段。",
      "14. missingObligations.kind 只能使用 must_hit_now、must_preserve、payoff_touch、character_appearance、goal_change、forbidden_crossing。",
      "15. status 只能使用 accepted、repairable、needs_manual_review、continue_with_risk；不得输出 acceptable、pass、passed、ok、approved 等别名。",
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
