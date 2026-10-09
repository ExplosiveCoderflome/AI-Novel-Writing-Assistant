import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import {renderCacheContextSections} from "../../core/cache";
import { NOVEL_PROMPT_BUDGETS } from "./promptBudgetProfiles";
import { CHAPTER_PROSE_QUALITY_AUDIT_RULES } from "@ai-novel/shared/types/chapterProseContract";
import { repairVerificationSchema, buildRepairReviewChecklist, validateRepairReview, acceptanceStyleReviewSchema, validateAcceptanceStyleReview } from "./acceptance";
export { ChapterRepairVerificationError } from "./acceptance";

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
    styleRuleId: z.string().trim().min(1).nullable().optional(),
    evidence: z.string().trim().min(1),
    currentEvidence: z.string().trim().min(1).max(350).optional(),
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
    currentEvidence: z.string().trim().min(1).max(350).optional(),
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
  repairVerification: repairVerificationSchema.optional(),
  styleReview: acceptanceStyleReviewSchema.nullable().optional(),
});

export type ChapterAcceptanceAssessmentOutput = z.infer<typeof chapterAcceptanceAssessmentSchema>;

export interface ChapterAcceptancePromptInput {
  novelTitle: string;
  chapterOrder: number;
  chapterTitle: string;
  targetWordCount?: number | null;
  content: string;
  styleReviewEnabled?: boolean;
  styleRuleIds?: string[];
  repairReviewBaseline?: Pick<ChapterAcceptanceAssessmentOutput,
    "blockingIssues" | "missingObligations" | "repairDirectives">;
}

const CHAPTER_ACCEPTANCE_EXAMPLE: ChapterAcceptanceAssessmentOutput = {
  status: "accepted",
  styleReview: { riskScore: 0, summary: "写法规则已核对，无需局部修正。", issueCodes: [] },
  score: {
    coherence: 82,
    pacing: 84,
    repetition: 86,
    engagement: 84,
    voice: 85,
    overall: 84,
  },
  summary: "主角识破试探并取得钥匙，代价与下一步选择清晰，可继续。",
  blockingIssues: [],
  repairDirectives: [],
  missingObligations: [],
  repairability: "none",
  decisionReason: "合同动作已通过正文兑现；结尾选择能承接下一章，无需额外新增场景。",
  riskTags: ["下一章承接追查钥匙的压力"],
  assetSyncRecommendation: {
    priority: "normal",
    reason: "同步钥匙归属与人物状态。",
    requiresFullPayoffReconcile: false,
  },
  continuePolicy: "continue",
};

export const chapterAcceptanceAssessmentPrompt: PromptAsset<
  ChapterAcceptancePromptInput,
  ChapterAcceptanceAssessmentOutput
> = {
  id: "novel.chapter.acceptance_assessment",
  version: "v10",
  cacheBoundary: {messageIndex:0,contentBlockIndex:0},
  taskType: "review",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterAcceptance,
    requiredGroups: ["style_contract"],
    preferredGroups: [
      "chapter_mission",
      "reader_experience",
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
    { group: "reader_experience", required: true, priority: 100 },
    { group: "obligation_contract", required: true, priority: 98 },
    { group: "structure_obligations", priority: 94 },
    { group: "local_state", priority: 89 },
    { group: "style_contract", required: true, priority: 74 },
    { group: "open_conflicts", priority: 70 },
  ],
  structuredOutputHint: {
    placement: "stable_prefix",
    compact: true,
    example: CHAPTER_ACCEPTANCE_EXAMPLE,
    note: "示例只演示格式，不预设当前章节通过。需修复时 blockingIssues 项使用 severity/category/code/evidence/fixSuggestion，repairDirectives 项使用 mode/target/instruction；missingObligations 项使用 kind/summary/evidence。修文复验另按尾部清单输出 repairVerification，并为问题与义务填写 currentEvidence。所有判断以当前合同和正文证据为准。",
  },
  outputSchema: chapterAcceptanceAssessmentSchema,
  postValidate: (output, input) => validateAcceptanceStyleReview(validateRepairReview(output, input), input),
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
      "3. 必须在本章立刻解决且可通过局部补丁修复的问题使用 repairable，并给出 repairDirectives；只有提升空间而无合同缺口时，不安排修文。",
      "4. 章节可以继续但存在后续风险时使用 continue_with_risk，并用 riskTags 说明风险。",
      "5. blockingIssues 保留最关键的 0-5 条，每条必须有明确证据和可执行修复建议。",
      "6. obligation contract 是本章硬合同。must hit now 与 forbidden crossing 缺口必须写入 missingObligations；可后续承接的 payoff、角色露面或目标变化缺口，只有会影响下一章入口时才写入 missingObligations，否则放入 riskTags。",
      "7. repairability 只能用 none、patchable_obligation_gap、rewrite_needed、plan_misalignment。局部漏写但不阻断下一章时优先 continue_with_risk；只有需要当前章节立刻补齐时才用 patchable_obligation_gap。",
      "8. 写法检测开启时按 style_contract 评估写法与反 AI 表达，明显违规归入 voice；检测关闭时不评价这些专项规则。普通措辞提升不升级为硬合同缺口。",
      "9. assetSyncRecommendation 只判断资产同步优先级和是否需要全量伏笔对账，不要输出落库细节。",
      "10. blockingIssues.category 只能使用 continuity、character、plot、mode_fit、voice；节奏、重复、中段铺垫、结尾钩子都归入 plot。",
      "11. repairDirectives.target 只能使用 continuity、character、plot、ending、voice；不要输出 middle、pacing、internal_monologue、ending_tone 等自定义目标。",
      "12. repairDirectives.mode 只能使用 patch、rewrite、manual；continuePolicy 只能使用 continue、repair_once、pause。",
      "13. missingObligations 必须是对象数组，每项使用 kind、summary、evidence；修文复验还须填写 currentEvidence。不得输出字符串数组，也不得输出 obligationType、target、fixSuggestion、type 等别名字段。",
      "14. missingObligations.kind 只能使用 must_hit_now、must_preserve、payoff_touch、character_appearance、goal_change、forbidden_crossing。",
      "15. status 只能使用 accepted、repairable、needs_manual_review、continue_with_risk；不得输出 acceptable、pass、passed、ok、approved 等别名。",
      "16. reader_experience 是本章读者体验合同。检查 promisedReward 是否在正文中可见、主角是否围绕 protagonistWant 主动行动并遭遇 primaryResistance、keyTurn 与 netChange 是否成立、inheritedHookResponsibilities 是否得到回应，以及 endingHook 是否产生追读力。",
      "17. 普通读者体验缺口应输出可执行的 blockingIssues / repairDirectives，并优先使用 repairable 或 continue_with_risk；不得仅因爽点、钩子或情绪强度不足升级为 needs_manual_review 或全局重规划。",
      "18. 账本进入窗口或未推进属于关注提醒，不能单独作为本章正文缺陷。判定缺失必须同时引用本章执行义务和正文证据；可延后的承诺不得要求本章全部兑现。",
      "19. 未出场角色的目标没有变化不自动构成本章缺口，只有本章执行义务明确要求时才报告。若修复需要新增场景、改变视角、提前泄密或重新安排剧情，repairDirectives.mode 使用 rewrite/manual；仅对可定位、能保留场景与保密边界的局部缺口使用 patch。",
      "20. 以正文中可观察的行动、代价和局面变化验收，不要求逐字复述任务单。限制行动、有后果的口头条件或实际控制也可兑现相应义务，不得擅自追加字条、道具或新场景为验收条件；合同明确指定的动作、载体与结束态仍须逐项核对。",
      "21. 结尾可用未决选择、已建立的代价或明确下一步形成追读钩子；仅因没有新增追兵、反转或更强刺激，不应输出 blockingIssues / repairDirectives。普通表达提升放入 riskTags；确实未兑现本章硬合同仍须报告。",
      "22. 判断秘密泄漏须引用具体正文和 forbidden crossing / protected reveals；角色含糊警告、怀疑或误解不等同于对方已知秘密。若歧义会导致读者误判关键事实，说明冲突和必须明确的范围，避免把推测当成已发生的泄漏。",
      "23. 检查完整合同与正文后一次列齐需立即修复的缺口；同一缺口保持含义明确的 code，不用不同措辞制造新问题。summary、decisionReason 和指令简短，证据引用足以定位的句段，避免多字段重复长篇解释。",
      "24. 写法检测开启时必须输出 styleReview:{riskScore:0至100整数,summary:简短结论,issueCodes:[]}。需要局部修复的写法问题使用 blockingIssues 中的 voice 项，issueCodes 只引用这些项的 code，避免重复输出证据和修复建议。低风险表达提醒写入 riskTags；鼓励性规则未出现不构成违规。关闭时 styleReview 为 null。",
      "25. 写法 voice 项必须用 styleRuleId 引用规则目录中的真实 ID；普通写法合同问题用 null。autoRewrite=false 的规则只记录风险提醒，不安排修文。专项表达问题不能单独升级为整章重写、人工暂停或 plan_misalignment；事实、保密与章节义务冲突仍按对应合同判断。",
      "正文退化检测边界：",
      "角色位置连续性：若上下文携带正文位置来源，逐角色核对最后确认位置与本章实际出场、移动经过、囚禁/伤势及合理时空衔接。视角切换不搬动未出场角色；回忆、梦境、计划和转述不当作当下出场，地点上下级细化不等于瞬移。明确位置冲突使用 continuity 问题并同时引用来源与当前原句，给出保留情节的现有局部修复指令；不能擅自新增逃脱场景或把局部错位升级为全局重规划。位置未知或没有出场本身不构成缺口。",
      ...CHAPTER_PROSE_QUALITY_AUDIT_RULES.map((rule, index) => `${index + 1}. ${rule}`),
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      renderCacheContextSections(context).stable,
      `写法与反 AI 检测：${input.styleReviewEnabled ? "开启，逐项核对有效写法合同；按表达语义判断，不依赖违禁词命中" : "关闭，不执行专项写法检测；仍检查正文可读性、事实与章节义务"}`,
      `章节：第 ${input.chapterOrder} 章 ${input.chapterTitle}`,
      typeof input.targetWordCount === "number" ? `目标长度：约 ${input.targetWordCount} 字` : "目标长度：未指定",
      "",
      "分层上下文：",
      renderCacheContextSections(context).dynamic,
      "",
      "正文：",
      input.content,
    ].join("\n")),
    ...(input.repairReviewBaseline ? [new HumanMessage([
      "【局部修文复验清单】",
      JSON.stringify(buildRepairReviewChecklist(input)),
      "上面的清单只列历史待核对要求，不是当前正文缺陷或证据。只以本次完整候选正文为证据，逐项重新判断；不要复述首次结论。已解决的项从 blockingIssues/missingObligations 删除，未解决的同一项保留原 code 和 kind/summary。",
      "必须输出 repairVerification：contentHash 原样返回清单值；checks 对清单每个 issue/obligation 恰好核对一次，用 kind/key 标识，status 为 resolved/unresolved，currentEvidence 为当前候选中可定位的短原句（不超过350字），reason 简述解决或仍缺失的原因。禁止引用历史原句。",
      "仍未解决或新增的 blockingIssues/missingObligations 必须另外填写 currentEvidence，引用当前候选原句；普通缺失也应引用相关现有场景作为判断依据。已补入行动、专业判断或受限动作时必须核对这些变化，不能重复报告不存在的旧标点或忽略新增段落。原句证明来源，语义仍须独立判断。",
      "仍须核对完整合同、保密边界和连续性。新增问题必须引用候选正文与合同的具体冲突，并在 evidence 中说明属于修文引入的退化还是首次漏检的硬合同缺口；不得仅因角色目标表达不够直白、希望增加场景或提高刺激强度而扩大修文范围。",
    ].join("\n"))] : []),
  ],
};
