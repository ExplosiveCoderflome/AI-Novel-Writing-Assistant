import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { characterMindDeltaSchema } from "./characterMind.promptSchemas";
import { characterDialogueInfluenceResolutionSchema } from "@ai-novel/shared/types/characterDialogue";
import { chapterConcreteFactSchema } from "../../../services/novel/chapterSummarySchemas";
import { characterResourceExtractionUpdateSchema } from "./characterResource.promptSchemas";
import { NOVEL_PROMPT_BUDGETS } from "./promptBudgetProfiles";
import { payoffLedgerSyncItemSchema } from "../payoff/payoffLedgerSync.promptSchemas";

const nullableText = z.string().trim().optional().nullable();
const confidenceSchema = z.number().min(0).max(1).optional().nullable();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeCharacterResourceDelta(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const updateTypeAliases: Record<string, string> = {
    create: "introduced",
    created: "introduced",
    craft: "introduced",
    crafted: "introduced",
    generate: "introduced",
    generated: "introduced",
    produce: "introduced",
    produced: "introduced",
    refine: "introduced",
    refined: "introduced",
    discover: "revealed",
    discovered: "revealed",
    expose: "revealed",
    exposed: "revealed",
    gain: "acquired",
    gained: "acquired",
    obtain: "acquired",
    obtained: "acquired",
    buy: "acquired",
    bought: "acquired",
    purchase: "acquired",
    purchased: "acquired",
    spend: "consumed",
    spent: "consumed",
  };
  const resourceTypeAliases: Record<string, string> = {
    material: "consumable",
    materials: "consumable",
    medicine: "consumable",
    pill: "consumable",
    elixir: "consumable",
    currency: "world_resource",
    money: "world_resource",
    points: "world_resource",
    score: "world_resource",
    spirit_stone: "world_resource",
    spirit_stones: "world_resource",
    item: "physical_item",
    object: "physical_item",
    token: "relationship_token",
    ability: "ability_resource",
    skill: "ability_resource",
    secret: "hidden_card",
  };
  const updateType = typeof value.updateType === "string"
    ? updateTypeAliases[value.updateType.trim().toLowerCase()] ?? value.updateType
    : value.updateType;
  let resourceType = typeof value.resourceType === "string"
    ? resourceTypeAliases[value.resourceType.trim().toLowerCase()] ?? value.resourceType
    : value.resourceType;
  if (typeof resourceType === "string" && !["physical_item", "clue", "credential", "ability_resource", "relationship_token", "consumable", "hidden_card", "world_resource"].includes(resourceType)) {
    resourceType = "physical_item";
  }
  const statusAfterAliases: Record<string, string> = {
    active: "available",
    owned: "available",
    usable: "available",
    in_hand: "available",
    "in hand": "available",
    held: "available",
    known: "available",
    revealed: "available",
    concealed: "hidden",
    secret: "hidden",
    spent: "consumed",
    used: "consumed",
    exhausted: "consumed",
    broken: "damaged",
    removed: "lost",
    gone: "lost",
    missing: "lost",
  };
  const statusAfter = typeof value.statusAfter === "string"
    ? statusAfterAliases[value.statusAfter.trim().toLowerCase()] ?? value.statusAfter
    : value.statusAfter;
  let ownerType = value.ownerType;
  if (typeof ownerType === "string" && !["character", "organization", "location", "world", "unknown"].includes(ownerType)) {
    ownerType = "unknown";
  }
  let narrativeFunction = normalizeCharacterResourceNarrativeFunction({
    rawValue: value.narrativeFunction,
    normalizedResourceType: resourceType,
    statusAfter,
  });
  if (typeof narrativeFunction === "string" && !["tool", "clue", "weapon", "proof", "key", "cost", "promise", "hidden_card", "constraint"].includes(narrativeFunction)) {
    narrativeFunction = "tool";
  }
  return {
    ...value,
    resourceType,
    ownerType,
    updateType,
    statusAfter,
    narrativeFunction,
  };
}

function normalizeCharacterResourceNarrativeFunction(input: {
  rawValue: unknown;
  normalizedResourceType: unknown;
  statusAfter: unknown;
}): unknown {
  if (typeof input.rawValue !== "string") {
    return input.rawValue;
  }
  const normalized = input.rawValue.trim().toLowerCase();
  const aliases: Record<string, string> = {
    cultivation: "tool",
    cultivate: "tool",
    power_up: "tool",
    upgrade: "tool",
    material: "cost",
    materials: "cost",
    ingredient: "cost",
    resource: "tool",
    finance: "cost",
    financial: "cost",
    money: "cost",
    currency: "cost",
    transaction: "cost",
    debt: "constraint",
    obligation: "constraint",
    permission: "key",
    access: "key",
    evidence: "proof",
  };
  if (normalized === "finance" && input.normalizedResourceType === "credential") {
    return "proof";
  }
  if (normalized === "finance" && input.statusAfter === "consumed") {
    return "cost";
  }
  return aliases[normalized] ?? input.rawValue;
}

function normalizeChapterReferenceText(value: unknown): unknown {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return value;
}

function normalizePayoffRiskSignal(value: unknown, index: number): unknown {
  if (typeof value === "string") {
    return {
      code: `chapter_artifact_risk_${index + 1}`,
      severity: "medium",
      summary: value.trim() || "章节资产抽取识别到伏笔风险。",
    };
  }
  if (!isRecord(value)) {
    return value;
  }
  const summary = readString(value, ["summary", "reason", "description", "risk", "text"]);
  return {
    ...value,
    code: readString(value, ["code"]) ?? `chapter_artifact_risk_${index + 1}`,
    severity: readString(value, ["severity"]) ?? "medium",
    summary: summary ?? "章节资产抽取识别到伏笔风险。",
  };
}

function normalizePayoffDelta(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const statusAliases: Record<string, string> = {
    active: "pending_payoff",
    progressed: "pending_payoff",
    progressing: "pending_payoff",
    in_progress: "pending_payoff",
    pending: "pending_payoff",
    resolved: "paid_off",
    payoff: "paid_off",
    paid: "paid_off",
  };
  const currentStatus = typeof value.currentStatus === "string"
    ? statusAliases[value.currentStatus.trim().toLowerCase()] ?? value.currentStatus
    : value.currentStatus;
  const scopeTypeAliases: Record<string, string> = {
    story: "book",
    novel: "book",
    global: "book",
    book_level: "book",
    volume_level: "volume",
    chapter_level: "chapter",
  };
  const scopeType = typeof value.scopeType === "string"
    ? scopeTypeAliases[value.scopeType.trim().toLowerCase()] ?? value.scopeType
    : value.scopeType;
  const riskSignals = Array.isArray(value.riskSignals)
    ? value.riskSignals.map((signal, index) => normalizePayoffRiskSignal(signal, index))
    : value.riskSignals;
  return {
    ...value,
    scopeType,
    currentStatus,
    riskSignals,
  };
}

function normalizeSyncPlan(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const characterDynamicsAliases: Record<string, string> = {
    delta: "write",
    full_reconcile: "write",
    reconcile: "write",
  };
  const characterDynamics = typeof value.characterDynamics === "string"
    ? characterDynamicsAliases[value.characterDynamics.trim().toLowerCase()] ?? value.characterDynamics
    : value.characterDynamics;
  return {
    ...value,
    characterDynamics,
  };
}

function normalizeArtifactDeltaOutput(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    ...value,
    syncPlan: isRecord(value.syncPlan)
      ? value.syncPlan
      : { stateSnapshot: "write", characterResources: "write", payoffLedger: "delta", characterDynamics: "write", reason: "根据章节正文完成默认同步。" },
    confidence: typeof value.confidence === "number" && Number.isFinite(value.confidence)
      ? Math.max(0, Math.min(1, value.confidence))
      : 0.5,
  };
}

function normalizeRelationDynamic(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const evidence = value.evidence;
  const evidenceText = Array.isArray(evidence)
    ? evidence.map((item) => String(item ?? "").trim()).filter(Boolean).join("；")
    : typeof evidence === "string"
      ? evidence.trim()
      : "";
  return {
    ...value,
    sourceCharacterName: readString(value, [
      "sourceCharacterName",
      "characterName1",
      "character1Name",
      "fromCharacterName",
      "sourceName",
    ]),
    targetCharacterName: readString(value, [
      "targetCharacterName",
      "characterName2",
      "character2Name",
      "toCharacterName",
      "targetName",
    ]),
    stageLabel: readString(value, [
      "stageLabel",
      "phaseAfter",
      "relationshipType",
      "relationType",
      "changeType",
    ]) ?? "关系变化",
    stageSummary: readString(value, ["stageSummary", "summary"]) ?? evidenceText,
  };
}

function normalizeCharacterCandidate(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const summary = readString(value, ["summary", "appearanceSummary", "relationToKnown", "narrativeRole"]);
  const evidence = Array.isArray(value.evidence)
    ? value.evidence
    : readString(value, ["appearanceSummary"])
      ? [readString(value, ["appearanceSummary"])]
      : [];
  return {
    ...value,
    proposedName: readString(value, ["proposedName", "characterName", "name"]),
    proposedRole: readString(value, ["proposedRole", "narrativeRole", "role"]),
    summary,
    evidence,
  };
}

const chapterArtifactStateCharacterSchema = z.object({
  characterId: nullableText,
  characterName: nullableText,
  currentGoal: nullableText,
  emotion: nullableText,
  stressLevel: z.number().min(0).max(100).optional().nullable(),
  secretExposure: nullableText,
  knownFacts: z.array(z.string().trim().min(1)).default([]),
  misbeliefs: z.array(z.string().trim().min(1)).default([]),
  summary: nullableText,
});

const chapterArtifactRelationStateSchema = z.object({
  sourceCharacterId: nullableText,
  sourceCharacterName: nullableText,
  targetCharacterId: nullableText,
  targetCharacterName: nullableText,
  trustScore: z.number().min(0).max(100).optional().nullable(),
  intimacyScore: z.number().min(0).max(100).optional().nullable(),
  conflictScore: z.number().min(0).max(100).optional().nullable(),
  dependencyScore: z.number().min(0).max(100).optional().nullable(),
  summary: nullableText,
});

const chapterArtifactInformationStateSchema = z.object({
  holderType: z.enum(["reader", "character"]).default("reader"),
  holderRefId: nullableText,
  holderRefName: nullableText,
  fact: z.string().trim().min(1),
  status: z.string().trim().min(1).default("known"),
  summary: nullableText,
});

const chapterArtifactForeshadowStateSchema = z.object({
  title: z.string().trim().min(1),
  summary: nullableText,
  status: z.string().trim().min(1).default("setup"),
  setupChapterId: z.preprocess(normalizeChapterReferenceText, nullableText),
  payoffChapterId: z.preprocess(normalizeChapterReferenceText, nullableText),
});

export const chapterArtifactDeltaStateSchema = z.object({
  summary: z.string().trim().optional().nullable(),
  characterStates: z.array(chapterArtifactStateCharacterSchema).default([]),
  relationStates: z.array(chapterArtifactRelationStateSchema).default([]),
  informationStates: z.array(chapterArtifactInformationStateSchema).default([]),
  foreshadowStates: z.array(chapterArtifactForeshadowStateSchema).default([]),
});

const chapterArtifactRelationDynamicSchema = z.preprocess(normalizeRelationDynamic, z.object({
  sourceCharacterName: z.string().trim().min(1),
  targetCharacterName: z.string().trim().min(1),
  stageLabel: z.string().trim().min(1),
  stageSummary: z.string().trim().min(1),
  nextTurnPoint: nullableText,
  confidence: confidenceSchema,
}));

const chapterArtifactFactionUpdateSchema = z.object({
  characterName: z.string().trim().min(1),
  factionLabel: z.string().trim().min(1),
  stanceLabel: nullableText,
  summary: nullableText,
  confidence: confidenceSchema,
});

const chapterArtifactCharacterCandidateSchema = z.preprocess(normalizeCharacterCandidate, z.object({
  proposedName: z.string().trim().min(1),
  proposedRole: nullableText,
  summary: nullableText,
  evidence: z.array(z.string().trim().min(1)).default([]),
  matchedCharacterName: nullableText,
  confidence: confidenceSchema,
}));

const chapterArtifactCharacterKnowledgeStateSchema = z.object({
  characterName: z.string().trim().min(1),
  knownFacts: z.array(z.string().trim().min(1)).max(5).default([]),
  hiddenFacts: z.array(z.string().trim().min(1)).max(5).default([]),
});

export const chapterArtifactDeltaSyncPlanSchema = z.preprocess(normalizeSyncPlan, z.object({
  stateSnapshot: z.enum(["skip", "write"]).default("write"),
  characterResources: z.enum(["skip", "write"]).default("write"),
  payoffLedger: z.enum(["skip", "delta", "full_reconcile"]).default("delta"),
  characterDynamics: z.enum(["skip", "write"]).default("write"),
  reason: z.string().trim().min(1),
}));

export const chapterArtifactDeltaOutputSchema = z.preprocess(normalizeArtifactDeltaOutput, z.object({
  summary: z.string().trim().min(1),
  concreteFacts: z.array(chapterConcreteFactSchema).default([]),
  stateDeltas: chapterArtifactDeltaStateSchema,
  characterResourceDeltas: z.array(z.preprocess(normalizeCharacterResourceDelta, characterResourceExtractionUpdateSchema)).default([]),
  payoffDeltas: z.array(z.preprocess(normalizePayoffDelta, payoffLedgerSyncItemSchema)).default([]),
  relationDynamics: z.array(chapterArtifactRelationDynamicSchema).default([]),
  factionUpdates: z.array(chapterArtifactFactionUpdateSchema).default([]),
  characterCandidates: z.array(chapterArtifactCharacterCandidateSchema).default([]),
  characterKnowledgeStates: z.array(chapterArtifactCharacterKnowledgeStateSchema).default([]),
  characterMindDeltas: z.array(characterMindDeltaSchema).default([]),
  characterDialogueInfluenceResolutions: z.array(characterDialogueInfluenceResolutionSchema).default([]),
  syncPlan: chapterArtifactDeltaSyncPlanSchema,
  confidence: z.number().min(0).max(1),
  requiresFullReconcile: z.boolean().default(false),
}));

export type ChapterArtifactDeltaOutput = z.infer<typeof chapterArtifactDeltaOutputSchema>;

export interface ChapterArtifactDeltaPromptInput {
  novelTitle: string;
  chapterOrder: number;
  chapterTitle: string;
  chapterGoal: string;
  characterRosterText: string;
  previousStateText: string;
  existingResourceText: string;
  existingPayoffText: string;
  activeCharacterDialogueInfluenceText: string;
  chapterContent: string;
}

// Keep the wire example sparse. The existing schema supplies defaults after parsing.
const CHAPTER_ARTIFACT_DELTA_EXAMPLE = {
  summary: "程秩在库房外拿到后门铜钥匙，确认潜入有了可行入口。他收起钥匙，决定先观察换岗再行动，尚不知道库房内的守卫布置。本章完成进入手段的准备，守卫情况与潜入结果仍待后续揭示。",
  concreteFacts: [
    {
      text: "程秩已拿到能打开库房后门的铜钥匙",
      category: "completed",
    },
  ],
  stateDeltas: {
    summary: "钥匙到手，潜入可行，守卫布置未知。",
    characterStates: [
      {
        characterName: "程秩",
        currentGoal: "利用后门铜钥匙进入库房",
        knownFacts: ["后门铜钥匙可以打开库房后门"],
        summary: "钥匙到手，准备潜入，尚不知守卫布置。",
      },
    ],
    relationStates: [],
    informationStates: [
      {
        holderType: "reader",
        fact: "后门铜钥匙已经被程秩拿到。",
        status: "known",
      },
    ],
    foreshadowStates: [],
  },
  characterResourceDeltas: [
    {
      resourceName: "后门铜钥匙",
      resourceType: "credential",
      updateType: "acquired",
      holderCharacterName: "程秩",
      ownerType: "character",
      ownerName: "程秩",
      statusAfter: "available",
      readerKnows: true,
      holderKnows: true,
      knownByCharacterNames: ["程秩"],
      narrativeFunction: "key",
      summary: "程秩持有后门钥匙。",
      narrativeImpact: "可从后门潜入库房。",
      constraints: ["只能解释后门通行，不能替代正门权限。"],
      evidence: ["程秩把后门铜钥匙收进袖中。"],
    },
  ],
  payoffDeltas: [
    {
      ledgerKey: "ku_fang_hou_men",
      title: "库房后门",
      summary: "钥匙提供潜入机会。",
      scopeType: "chapter",
      currentStatus: "hinted",
      targetStartChapterOrder: 4,
      targetEndChapterOrder: 6,
      evidence: [{ summary: "程秩拿到后门铜钥匙。", chapterOrder: 3 }],
    },
  ],
  relationDynamics: [],
  factionUpdates: [],
  characterCandidates: [],
  characterKnowledgeStates: [
    {
      characterName: "程秩",
      knownFacts: ["后门铜钥匙可以打开库房后门"],
      hiddenFacts: ["库房内的守卫布置"],
    },
  ],
  characterMindDeltas: [
    {
      characterName: "程秩",
      currentInterpretation: "潜入可行，但需要先查守卫。",
      activePlan: "观察换岗，再从后门潜入。",
      evidence: ["程秩把后门铜钥匙收进袖中，并决定先观察换岗。"],
      confidence: 0.78,
    },
  ],
  characterDialogueInfluenceResolutions: [],
  syncPlan: {
    stateSnapshot: "write",
    characterResources: "write",
    payoffLedger: "delta",
    characterDynamics: "skip",
    reason: "有状态、资源与伏笔变化，无关系阶段变化。",
  },
  confidence: 0.86,
  requiresFullReconcile: false,
};

export const chapterArtifactDeltaPrompt: PromptAsset<
  ChapterArtifactDeltaPromptInput,
  ChapterArtifactDeltaOutput
> = {
  id: "novel.chapter.artifact_delta.extract",
  version: "v4",
  cacheBoundary: {messageIndex:0,contentBlockIndex:0},
  taskType: "fact_extraction",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterArtifactDelta,
  },
  repairPolicy: {
    maxAttempts: 1,
  },
  structuredOutputHint: {
    placement: "stable_prefix",
    compact: true,
    example: CHAPTER_ARTIFACT_DELTA_EXAMPLE,
    note: [
      "一次性抽取章节摘要、硬事实、状态快照、角色资源、伏笔/payoff、关系动态、信息边界和同步计划。",
      "只记录正文中有明确证据或与任务目标强相关的变化。",
      "示例是最小字段演示，可选字段仅在有实际信息时填写，不要照着示例扩写每个维度。",
      "syncPlan 与 requiresFullReconcile 由你基于剧情风险判断，代码只负责校验与落库。",
    ].join(" "),
  },
  outputSchema: chapterArtifactDeltaOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是中文长篇小说章节资产 delta 抽取器。",
      "你的任务是从单章正文中一次性提取后续写作需要的增量资产，并给出同步计划。",
      "",
      "只输出合法 JSON 对象，不要输出 Markdown、解释、注释或代码块。",
      "",
      "抽取原则：",
      "1. 只抽取正文中已经发生、被读者知道、被角色知道，或由章节任务明确要求产生的变化。",
      "2. 不要把普通描写、一次性环境物、纯心理形容误判为长期账本资产。",
      "3. 角色资源必须有 evidence；伏笔/payoff 必须能说明 setup、推进、兑现或风险。",
      "4. 关系动态只记录本章发生了阶段变化、阵营立场变化或新角色候选时的内容。",
      "5. 默认输出 delta；只有账本明显冲突、已兑现但找不到前置铺垫、关键线索跨多章错位、或本章集中处理多个 payoff 时，才建议 full_reconcile。",
      "6. syncPlan 由你判断，不要依赖关键词；如果没有对应变化，明确 skip 并说明 reason。",
      "7. 所有角色名优先使用已知角色名单；无法确认的新人物放入 characterCandidates，不要强行归到已有角色。",
      "8. summary 必须使用简体中文，控制在 80-180 字，覆盖关键事件、冲突推进、人物状态变化、本章结果或悬念方向。",
      "9. concreteFacts 只记录本章正文即兴产生且后续必须保持一致的硬事实，每条不超过 40 字；包括承诺、交易条款、事件性质、关键数字日期地点、身份与状态变化。",
      "10. concreteFacts.category 只能使用 completed、revealed、state_changed；无明确硬事实时输出 []，不得把抽象目标或氛围描述写入 concreteFacts。",
      "11. characterKnowledgeStates 只在本章存在显著信息差时填写；knownFacts 写该角色本章后明确知道的事实，hiddenFacts 写该角色仍不知道、后续不能让其超前知情的事实，每组最多 5 条；无信息差输出 []。",
      "11a. characterMindDeltas 只在正文明确改变角色对局势的理解、情绪、意图、计划、误判或行动选择时填写，最多 4 条；它是可追溯的角色主观推断，不是客观事实，不得凭空补秘密。每条必须给 evidence；没有明显变化输出 []。",
      "11b. characterDialogueInfluenceResolutions 只评估下面提供的“当前有效角色对话影响”。它们是作者与角色对话后确认的软性行为倾向，不是客观事实或强制剧情。只有正文已经明确承接某个影响的行动、情绪或关系张力时，才输出 { influenceId, status: \"applied\", evidence, confidence }；尚未承接、仅有模糊铺垫或正文相反时可输出 defer，也可不输出。它不创造事实，不能凭计划或旁白推测标记 applied。applied 必须给正文证据。",
      "12. payoffDeltas.currentStatus 只能使用 setup、hinted、pending_payoff、paid_off、failed、overdue；不要输出 active，已推进但未兑现统一用 pending_payoff。",
      "13. payoffDeltas.riskSignals 必须是对象数组，形如 { code, severity, summary }；没有风险就输出 []，不要输出字符串数组。",
      "14. relationDynamics 必须使用 sourceCharacterName、targetCharacterName、stageLabel、stageSummary；characterCandidates 必须使用 proposedName、proposedRole、summary。",
      "15. characterResourceDeltas.updateType 只能使用 introduced、acquired、revealed、used、transferred、lost、consumed、damaged、destroyed、recovered、stale_marked；新创建/首次出现统一用 introduced。",
      "16. characterResourceDeltas.resourceType 只能使用 physical_item、clue、credential、ability_resource、relationship_token、consumable、hidden_card、world_resource；材料、丹药、一次性药草用 consumable，积分/货币/宗门资源用 world_resource。",
      "17. characterResourceDeltas.narrativeFunction 只能使用 tool、clue、weapon、proof、key、cost、promise、hidden_card、constraint；修炼增益通常用 tool，消耗材料/积分用 cost，凭据/借据用 proof 或 constraint。",
      "18. characterResourceDeltas.statusAfter 只能使用 available、hidden、borrowed、transferred、lost、consumed、damaged、destroyed、stale；不要输出 active、owned、usable、used、broken 等自定义状态。",
      "19. characterResourceDeltas 最多输出 8 条；优先保留会跨章影响行动边界、伏笔兑现或资源归属的变化。",
      "20. payoffDeltas.scopeType 只能使用 book、volume、chapter；全书/故事级伏笔统一用 book，不要输出 story、novel 或 global。",
      "21. stateDeltas.foreshadowStates 的 setupChapterId/payoffChapterId 只有在能确认真实 chapterId 时才填写；如果只能确认第几章，宁可省略或写入章节序号字符串，不要输出数字。",
      "22. syncPlan.stateSnapshot、characterResources、characterDynamics 只能是 skip 或 write；只有 payoffLedger 可以是 skip、delta 或 full_reconcile。",
      "【紧凑输出与连续性保护】",
      "23. 使用紧凑 JSON，不要缩进、排版换行或 Markdown。先保证对象完整闭合，再追求说明细节；输出上限不是必须写满的目标。",
      "24. 不要重抄已有账本、全体人物档案或整章剧情。只输出与本章有关的有效状态、真正新增或改变的资产；无变化的数组返回 []。",
      "25. summary 用于章节总览；各子项只写各自的变化。同一资源的 summary、narrativeImpact、expectedFutureUse 不要重复讲同一件事；可选字段没有新增信息时省略，不要填 null、空字符串或占位说明。",
      "26. 每个子项的说明优先用一句短句；证据优先保留一条足以支持变化的正文短摘录，不抄整段。payoffDeltas.evidence 只输出一条；只有多个独立事实无法由一条证据覆盖时才增加其他维度的证据。",
      "27. stateDeltas 保留本章相关角色的章末有效状态；信息归属、人物误判、伤势、资源归属、资源不可用条件与保护秘密不能为缩短输出而删除。readerKnows、holderKnows 等布尔字段必须反映真实信息边界，值为 false 时必须显式填写，不能省略后变为默认 true。",
      "28. characterMindDeltas 描述人物主观理解和意图，不重复客观资源台账；relationStates 描述章末关系，relationDynamics 只描述有证据的关系阶段转变。必要的不同维度可以引用同一事件，但不得各自复述整段剧情。",
      "29. 角色状态、关系状态和资源的 summary 会供后续章节读取，有有效变化时保留一句短摘要。资源风险等级、未来使用窗口等会改变后续行动边界的字段须按证据保留，不能将关键字段当作冗余省略。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      "",
      "已知角色：",
      input.characterRosterText || "暂无角色名单",
      "",
      `章节：第 ${input.chapterOrder} 章《${input.chapterTitle}》`,
      `章节目标：${input.chapterGoal || "无明确目标"}`,
      "",
      "上一状态摘要：",
      input.previousStateText || "暂无上一状态快照",
      "",
      "已有角色资源账本：",
      input.existingResourceText || "暂无已有关键资源",
      "",
      "已有伏笔账本：",
      input.existingPayoffText || "暂无已有伏笔账本",
      "",
      "当前有效角色对话影响（仅供核对正文是否承接；是软性行为倾向，不是客观事实或强制剧情）：",
      input.activeCharacterDialogueInfluenceText || "无",
      "",
      "章节正文：",
      input.chapterContent,
    ].join("\n")),
  ],
  postValidate: (output) => {
    for (const update of output.characterResourceDeltas) {
      if (update.evidence.length === 0) {
        throw new Error(`资源变化缺少证据：${update.resourceName}`);
      }
    }
    for (const resolution of output.characterDialogueInfluenceResolutions) {
      if (resolution.status === "applied" && resolution.evidence.length === 0) {
        throw new Error(`角色对话影响承接缺少证据：${resolution.influenceId}`);
      }
    }
    if (output.syncPlan.payoffLedger === "skip" && output.payoffDeltas.length > 0) {
      throw new Error("syncPlan.payoffLedger 为 skip 时不应输出 payoffDeltas。");
    }
    return output;
  },
};
