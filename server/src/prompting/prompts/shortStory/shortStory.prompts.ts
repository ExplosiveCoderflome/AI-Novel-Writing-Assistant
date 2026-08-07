import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type {
  CreationDirection,
  ShortStoryPlanContract,
  ShortStoryPlanSegment,
  ShortStoryQualityResult,
} from "@ai-novel/shared/types/creationStudio";
import type { PromptAsset } from "../../core/promptTypes";

const planSegmentSchema = z.object({
  order: z.number().int().min(1).max(8),
  purpose: z.string().min(4).max(500),
  targetWordCount: z.number().int().min(300).max(15000),
  openingState: z.string().min(2).max(500),
  openingHook: z.string().min(4).max(500),
  immediateGoal: z.string().min(4).max(500),
  progressionBeats: z.array(z.string().min(4).max(500)).min(2).max(6),
  turningPoint: z.string().min(2).max(500),
  payoff: z.string().min(4).max(500),
  closingPull: z.string().min(4).max(500),
  closingState: z.string().min(2).max(500),
}).strict();

const planSchema = z.object({
  title: z.string().min(1).max(100),
  targetWordCount: z.number().int().min(3000).max(30000),
  endingPromise: z.string().min(4).max(500),
  segments: z.array(planSegmentSchema).min(2).max(8),
  causalContract: z.object({
    protagonistGoal: z.string().min(4).max(500),
    centralQuestion: z.string().min(4).max(500),
    fixedFacts: z.array(z.string().min(4).max(500)).min(3).max(12),
    causeEffectChain: z.array(z.string().min(8).max(700)).min(3).max(8),
    setupPayoffs: z.array(z.object({
      setup: z.string().min(4).max(500),
      setupSegmentOrder: z.number().int().min(1).max(8),
      payoff: z.string().min(4).max(500),
      payoffSegmentOrder: z.number().int().min(1).max(8),
    }).strict()).min(2).max(8),
  }).strict(),
}).strict();

const qualityIssueSchema = z.object({
  code: z.string().min(1).max(80),
  severity: z.enum(["critical", "standard"]),
  description: z.string().min(4).max(500),
  affectedSegmentOrders: z.array(z.number().int().min(1).max(8)).max(8),
  repairInstruction: z.string().min(4).max(1000).optional(),
}).strict();

const auditSchema = z.object({
  decision: z.enum(["accepted", "patchable", "replan_required"]),
  summary: z.string().min(4).max(1000),
  issues: z.array(qualityIssueSchema).max(20),
}).strict();

const writtenSegmentSchema = z.object({
  content: z.string().min(200),
  continuitySummary: z.string().min(10).max(1200),
}).strict();

const patchSchema = z.object({
  patches: z.array(z.object({
    segmentOrder: z.number().int().min(1).max(8),
    content: z.string().min(200),
  }).strict()).max(8),
  residualQualityDebt: z.array(z.string().min(4).max(500)).max(20),
}).strict();

export interface ShortStoryPlanPromptInput {
  originalIdea: string;
  understanding: string;
  direction: CreationDirection;
  targetWordCount: number;
  revisionInstruction?: string;
  requiredSegmentCount?: number;
  writingPlatform?: string;
  productionFoundation?: string;
}

function validatePlan(
  output: ShortStoryPlanContract,
  input: ShortStoryPlanPromptInput,
): z.output<typeof planSchema> {
  if (input.requiredSegmentCount && output.segments.length !== input.requiredSegmentCount) {
    throw new Error(`重新规划必须保持 ${input.requiredSegmentCount} 个内部片段。`);
  }
  const orders = output.segments.map((segment) => segment.order);
  if (orders.some((order, index) => order !== index + 1)) {
    throw new Error("短篇片段顺序必须从 1 连续递增。");
  }
  const budget = output.segments.reduce((sum, segment) => sum + segment.targetWordCount, 0);
  const tolerance = Math.max(500, Math.round(input.targetWordCount * 0.08));
  if (Math.abs(budget - input.targetWordCount) > tolerance) {
    throw new Error("片段字数预算之和必须接近目标总字数。");
  }
  if (Math.abs(output.targetWordCount - input.targetWordCount) > tolerance) {
    throw new Error("计划目标字数必须服从用户确认的目标。");
  }
  const segmentCount = output.segments.length;
  if (!output.causalContract) {
    throw new Error("短篇计划必须包含因果与伏笔台账。");
  }
  if (output.causalContract.setupPayoffs.some((item) => (
    item.setupSegmentOrder > item.payoffSegmentOrder
    || item.payoffSegmentOrder > segmentCount
  ))) {
    throw new Error("伏笔必须先于兑现，并且落在有效的内部片段内。");
  }
  return {
    ...output,
    targetWordCount: input.targetWordCount,
    causalContract: output.causalContract,
  };
}

function validateAudit(
  output: ShortStoryQualityResult,
  input: ShortStoryAuditPromptInput,
): z.output<typeof auditSchema> {
  const wordCount = input.content.replace(/\s+/g, "").length;
  const targetWordCount = input.plan.targetWordCount;
  if (output.decision === "accepted" && wordCount < Math.round(targetWordCount * 0.7)) {
    throw new Error("成稿明显低于目标字数，不能判定为可直接交付。");
  }
  if (output.decision === "accepted" && output.issues.some((issue) => issue.severity === "critical")) {
    throw new Error("存在关键因果或事实问题时不能判定为可直接交付。");
  }
  return output as z.output<typeof auditSchema>;
}

export const shortStoryPlanPrompt: PromptAsset<
  ShortStoryPlanPromptInput,
  z.output<typeof planSchema>,
  ShortStoryPlanContract
> = {
  id: "novel.short_story.plan",
  version: "v2",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  outputSchema: planSchema,
  repairPolicy: { maxAttempts: 1 },
  semanticRetryPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是中文商业网文短篇的全篇结构导演。",
      "这里的短篇是篇幅更短、能一次读完并完整收束的网络小说，不是传统文学短篇、散文、故事梗概或影视分场。",
      "把确认后的意图规划成 2～8 个内部写作片段。这些片段只用于后台生产，不是展示给读者的章节。",
      "结构必须能在目标字数内完成主角变化、核心冲突和明确结尾回报，同时保持中文网文的钩子、推进、反转和回报密度。",
      "开篇前 300～500 字必须进入压力、异常、冲突或决定点，不用景物、梦境、身世说明或世界设定慢慢热场。",
      "主角必须有可见的即时目标并主动选择；每个内部片段都要安排 2～6 个因果相连的 progressionBeats，而不是概述一段时间。",
      "先建立 causalContract：它是全篇不可随意改写的因果台账。fixedFacts 写清已确认的道具身份、人物关系、规则、位置和信息来源；causeEffectChain 从开场压力到结局逐项写出“因为前一行动/事实，所以发生下一变化”。",
      "setupPayoffs 至少列出 2 个伏笔与兑现：任何关键解法、反转、身份、密码、武器、规则或资源，必须在兑现前的片段以可回看的具体信息出现。不得在危机发生时突然新增万能道具、隐藏身份、技术规则或外部援手解决问题。",
      "故事只能围绕用户原始想法和确认方向展开。可以深化，但不得把用户的核心体验替换成未铺垫的另一套宏大阴谋、灾难或世界观。",
      "如果提供创作底座，题材预期、主推进单位、冲突上限、读者奖励和禁止信号都必须落实到计划中。",
      "每个片段必须产生题材匹配的 payoff，并用 closingPull 推向下一变化。回报不等于统一打脸，可以是破局、发现、关系推进、代价兑现或情绪释放。",
      "避免连续大段氛围、内心独白、背景解释和只有文采没有事件变化的内容。",
      "按故事需要决定片段数，不要机械按固定字数切块。",
      "如果提供 requiredSegmentCount，必须保持该片段数量，以便安全更新已存在的作品。",
      "所有片段的目标字数之和必须接近总目标，顺序必须从 1 连续递增。",
      "最后一个片段必须完整兑现 endingPromise，不得以长篇式悬置代替结局。",
      "只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
  postValidate: validatePlan,
};

export interface ShortStorySegmentWritePromptInput {
  originalIdea: string;
  understanding: string;
  direction: CreationDirection;
  plan: ShortStoryPlanContract;
  segment: ShortStoryPlanSegment;
  previousContinuity: string;
  previousContentTail: string;
  writingPlatform?: string;
  bookStyle?: string;
  productionFoundation?: string;
}

export const shortStorySegmentWritePrompt: PromptAsset<
  ShortStorySegmentWritePromptInput,
  z.output<typeof writtenSegmentSchema>
> = {
  id: "novel.short_story.segment.write",
  version: "v2",
  taskType: "writer",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 12000 },
  contextRequirements: [
    { group: "creation_intent", required: true, priority: 100 },
    { group: "short_story_plan", required: true, priority: 100 },
    { group: "short_story_continuity", required: true, priority: 96 },
    { group: "writing_platform", required: true, priority: 104 },
    { group: "production_foundation", required: true, priority: 103 },
    { group: "book_style", required: true, priority: 80 },
  ],
  slots: [
    {
      kind: "replace",
      key: "shortWriter.tone",
      label: "语气与读感",
      description: "控制短篇正文的语言质感和阅读速度。",
      default: "使用自然、直接、有画面的中文网文表达，让人物行动和场景变化推动阅读。",
      maxLength: 800,
    },
    {
      kind: "replace",
      key: "shortWriter.openingPressure",
      label: "开篇压力",
      description: "控制故事在多快的范围内进入异常、冲突或决定点。",
      default: "第一片段在前 300～500 字进入压力、异常、冲突或决定点。",
      maxLength: 500,
    },
    {
      kind: "replace",
      key: "shortWriter.paragraphing",
      label: "段落方式",
      description: "控制移动端段落长度和对话分段。",
      default: "面向手机阅读，以 1～4 句段落为主；对话可独立成段，但不要把每句话都切碎。",
      maxLength: 500,
    },
    {
      kind: "replace",
      key: "shortWriter.payoffDensity",
      label: "冲突与回报密度",
      description: "控制每个片段中信息、阻力、选择和得失的密度。",
      default: "正文持续产生新信息、阻力、选择、得失或关系变化，不允许长时间停留在氛围或解释。",
      maxLength: 700,
    },
    {
      kind: "replace",
      key: "shortWriter.endingDelivery",
      label: "结尾兑现",
      description: "控制最后片段对高潮和结局承诺的兑现方式。",
      default: "最后片段必须完整兑现高潮与核心结局，可以留余味，但不能用戛然而止代替答案。",
      maxLength: 600,
    },
    {
      kind: "replace",
      key: "shortWriter.antiAiRules",
      label: "反 AI 味规则",
      description: "减少模板化句式、空泛议论、同义反复和梗概化表达。",
      default: "避免空泛哲理、作者判词、堆砌比喻、同义反复和用总结代替正在发生的场景。",
      maxLength: 800,
    },
    {
      kind: "append",
      key: "shortWriter.customConstraints",
      label: "自定义写法约束",
      description: "追加本书或当前短篇需要遵守的写法。",
      anchor: "book_style",
      default: "",
      maxLength: 4000,
      placeholderHint: "例如：女主说话克制，不使用网络热梗；反转必须在前文有可回看的线索。",
    },
  ],
  management: {
    productPrompt: true,
    proseGeneration: true,
    editModes: ["slots", "advanced_template"],
    advancedTemplate: {
      scope: "novel",
      requiredContextGroups: [
        "creation_intent", "short_story_plan", "short_story_continuity", "writing_platform", "book_style",
      ],
    },
  },
  outputSchema: writtenSegmentSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input, context) => [
    new SystemMessage([
      "你是中文商业网文短篇正文作者。",
      "成稿必须像篇幅更短但完整收束的网络小说：开场快、目标清楚、场景持续变化、回报密集、语言顺畅，不得写成散文、纯文学小品或剧情梗概。",
      "只写当前内部片段，但正文必须像一篇连续作品的一部分。",
      "不要输出章节名、片段名、序号、创作说明或 Markdown。",
      "自然承接前文，不重复开场，不总结计划。",
      "严格完成当前片段的 openingHook、immediateGoal、progressionBeats、turningPoint、payoff、closingPull 和 closingState；旧计划缺少新增字段时，仍要按 purpose 补足同等网文节奏。",
      "把 plan.causalContract 视为事实与因果的唯一台账：不得改变其中已确认的道具身份、人物关系、规则、地点和信息来源。每一次行动都必须由前文已经发生的事实触发，并造成可见后果。",
      "禁止“危机出现后才突然知道/拿到/发明解决方案”：关键线索、能力、技术规则、援手与反转必须已经在 causalContract 的 setupPayoffs 中完成铺垫。若当前计划没有可用铺垫，就让人物承受代价、改变策略或推进既有线索，不得临场补设定。",
      "第一片段必须在前 300～500 字进入压力、异常、冲突或决定点，禁止从天气、起床、照镜子、回忆身世或成段设定说明开始。",
      "用具体场景、动作、选择和自然对话推动因果。说明只在影响当前行动时出现，不能连续大段解释世界观或替人物总结感受。",
      "面向手机阅读组织中文段落：以 1～4 句为主，对话可独立成段；避免超长密集段落，也不要把每一句都切成碎段。",
      "正文必须持续产生新信息、阻力、选择、得失或关系变化；不能连续约 800 字只有氛围、回忆、心理描写或同义反复。",
      "语言直接、有画面、符合题材气质。少用空泛哲理、堆砌比喻、作者式议论和故作深沉的开放句。",
      "如果这是最后一段，必须完成完整结局；否则不要伪造全篇结束。",
      "最后一段必须兑现高潮与结局，让身份、关系、目标或核心谜题发生明确落点；可以留余味，但不能用戛然而止冒充高级感。",
      "返回 JSON：content 是纯正文，continuitySummary 是供下一片段使用的事实与人物状态摘要。",
      "【可编辑写法】",
      context.slots?.text("shortWriter.tone") ?? "使用自然、直接、有画面的中文网文表达。",
      context.slots?.text("shortWriter.openingPressure") ?? "第一片段在前 300～500 字进入压力。",
      context.slots?.text("shortWriter.paragraphing") ?? "面向手机阅读组织段落。",
      context.slots?.text("shortWriter.payoffDensity") ?? "持续产生信息、阻力、选择和回报。",
      context.slots?.text("shortWriter.endingDelivery") ?? "最后片段完整兑现结局。",
      context.slots?.text("shortWriter.antiAiRules") ?? "避免空泛、重复和梗概化。",
      input.writingPlatform ? `【目标平台写法】\n${input.writingPlatform}` : "",
      input.productionFoundation ? `【创作底座】\n${input.productionFoundation}` : "",
      input.bookStyle ? `【本书写法】\n${input.bookStyle}` : "",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
};

export interface ShortStoryAuditPromptInput {
  originalIdea: string;
  understanding: string;
  direction: CreationDirection;
  plan: ShortStoryPlanContract;
  content: string;
  writingPlatform?: string;
  productionFoundation?: string;
}

export const shortStoryFullAuditPrompt: PromptAsset<
  ShortStoryAuditPromptInput,
  z.output<typeof auditSchema>,
  ShortStoryQualityResult
> = {
  id: "novel.short_story.full.audit",
  version: "v2",
  taskType: "review",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  outputSchema: auditSchema,
  repairPolicy: { maxAttempts: 1 },
  semanticRetryPolicy: { maxAttempts: 1 },
  postValidate: validateAudit,
  render: (input) => [
    new SystemMessage([
      "你是中文商业网文短篇的全篇审校编辑。",
      "一次性检查完整作品的意图兑现、因果、人物变化、连续性、结尾回报和网络小说可读性。",
      "必须检查：前 300～500 字是否有有效钩子；主角目标和行动是否清楚；场景是否持续推进；是否有足够的阻力、反转与题材回报；结局是否明确兑现。",
      "逐项核对 plan.causalContract：固定事实是否前后一致；每个关键结果是否由已出现的原因推动；关键道具、身份、规则、能力和技术解法是否在兑现前铺垫；人物是否因已知信息和自身目标作出合理选择。",
      "把以下情形标为 severity=critical：同一关键道具或信息前后身份/数量/真假矛盾；用从未铺垫的新规则、新能力、新援手或新道具解决高潮；人物无动机改变立场；关键结果没有可追溯原因；作品明显低于用户目标字数。critical 问题不能作为普通质量债直接交付。",
      "把慢热说明、剧情梗概化、连续大段内心独白、空泛抒情、超长密集段落、碎句滥用、对话不自然、爽点或情绪回报不足列为可执行问题。",
      "文学性不是问题，但不能牺牲事件推进、因果清晰和手机阅读流畅度；不要把故作深沉、晦涩或开放式戛然而止误判为高级。",
      "accepted：可直接交付；patchable：局部改写可修；replan_required：只有核心结构无法通过局部修复挽回时使用。",
      "普通文风瑕疵、局部节奏、可修补伏笔或措辞问题都必须判为 patchable，不能升级为 replan_required。",
      "affectedSegmentOrders 只填写确实需要修改的内部片段。",
      "只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
};

export interface ShortStoryPatchPromptInput extends ShortStoryAuditPromptInput {
  audit: ShortStoryQualityResult;
  segments: Array<{ order: number; content: string; humanEdited: boolean }>;
}

export const shortStoryPatchRepairPrompt: PromptAsset<
  ShortStoryPatchPromptInput,
  z.output<typeof patchSchema>
> = {
  id: "novel.short_story.patch.repair",
  version: "v2",
  taskType: "repair",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  outputSchema: patchSchema,
  repairPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是中文商业网文短篇的局部修复编辑。",
      "根据全篇审校，仅返回必须替换的完整内部片段正文。",
      "humanEdited=true 的片段不得返回补丁，不得静默覆盖人工内容；相关问题写入 residualQualityDebt。",
      "保留未被审校点名的情节、事实、语气和结尾承诺。",
      "严格以 plan.causalContract 为事实台账修复。severity=critical 的问题必须优先修复：补足前置铺垫、移除临场新增解法、统一关键道具与规则、让人物选择回到可追溯动机。不得用另一条新设定遮盖旧矛盾。",
      "修复后的正文必须保持网络小说可读性：快速进入场景，以行动、冲突和对话推进，补足题材回报，控制段落长度，删除空泛抒情与梗概式叙述。",
      "正文中不要加入章节名、片段名、序号或修订说明。",
      "最多执行这一轮修复；只有无法安全修复的普通问题可以进入 residualQualityDebt，关键因果/事实矛盾不得降级为普通建议。",
      "只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
};

const revisionImpactSchema = z.object({
  understoodGoal: z.string().min(4).max(1000),
  affectedSegmentOrders: z.array(z.number().int().min(1).max(8)).min(1).max(8),
  changesEnding: z.boolean(),
  changesScale: z.boolean(),
  changesCoreIntent: z.boolean(),
  recommendedTargetWordCount: z.number().int().min(3000).max(30000),
  recommendedStrategy: z.enum(["local_patch", "rewrite_downstream", "full_replan"]),
  summary: z.string().min(4).max(1200),
  revisedDirection: z.object({
    title: z.string().min(1).max(100),
    premise: z.string().min(10).max(1000),
    coreExperience: z.string().min(4).max(500),
    protagonist: z.string().min(4).max(500),
    centralConflict: z.string().min(4).max(500),
    endingPromise: z.string().min(4).max(500),
    styleKeywords: z.array(z.string().min(1).max(30)).min(2).max(8),
  }).strict(),
}).strict();

export interface ShortStoryRevisionImpactPromptInput {
  instruction: string;
  originalIdea: string;
  understanding: string;
  direction: CreationDirection;
  plan: ShortStoryPlanContract;
  segments: Array<{ order: number; content: string; humanEdited: boolean }>;
}

export const shortStoryRevisionImpactPrompt: PromptAsset<
  ShortStoryRevisionImpactPromptInput,
  z.output<typeof revisionImpactSchema>
> = {
  id: "novel.short_story.revision.impact",
  version: "v2",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 0 },
  outputSchema: revisionImpactSchema,
  repairPolicy: { maxAttempts: 1 },
  semanticRetryPolicy: { maxAttempts: 1 },
  render: (input) => [
    new SystemMessage([
      "你是网文短篇作品的修改影响分析师。",
      "先理解用户真正想改什么，再判断哪些内部片段会受影响；此阶段绝不改正文。",
      "local_patch 适合单点内容修补；rewrite_downstream 适合某处变化会影响后续因果；full_replan 只用于规模、核心意图或整体结构变化。",
      "如果影响结尾、体量或核心体验，必须如实标记。",
      "revisedDirection 是应用修改后应遵循的完整方向；未被要求修改的字段保持原意。",
      "revisedDirection 必须继续服务篇幅更短但完整收束的中文网络小说，不得漂移成散文、纯文学小品或剧情梗概。",
      "只输出严格 JSON。",
    ].join("\n")),
    new HumanMessage(JSON.stringify(input, null, 2)),
  ],
};
