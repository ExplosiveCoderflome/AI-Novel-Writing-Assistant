import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
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
  const resourceType = typeof value.resourceType === "string"
    ? resourceTypeAliases[value.resourceType.trim().toLowerCase()] ?? value.resourceType
    : value.resourceType;
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
  const narrativeFunction = normalizeCharacterResourceNarrativeFunction({
    rawValue: value.narrativeFunction,
    normalizedResourceType: resourceType,
    statusAfter,
  });
  return {
    ...value,
    resourceType,
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

export const chapterArtifactDeltaOutputSchema = z.object({
  summary: z.string().trim().min(1),
  concreteFacts: z.array(chapterConcreteFactSchema).max(12).default([]),
  stateDeltas: chapterArtifactDeltaStateSchema,
  characterResourceDeltas: z.array(z.preprocess(normalizeCharacterResourceDelta, characterResourceExtractionUpdateSchema)).default([]),
  payoffDeltas: z.array(z.preprocess(normalizePayoffDelta, payoffLedgerSyncItemSchema)).default([]),
  relationDynamics: z.array(chapterArtifactRelationDynamicSchema).default([]),
  factionUpdates: z.array(chapterArtifactFactionUpdateSchema).default([]),
  characterCandidates: z.array(chapterArtifactCharacterCandidateSchema).default([]),
  characterKnowledgeStates: z.array(chapterArtifactCharacterKnowledgeStateSchema).default([]),
  syncPlan: chapterArtifactDeltaSyncPlanSchema,
  confidence: z.number().min(0).max(1),
  requiresFullReconcile: z.boolean().default(false),
});

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
  chapterContent: string;
}

const CHAPTER_ARTIFACT_DELTA_EXAMPLE: ChapterArtifactDeltaOutput = {
  summary: "程秩在本章确认库房后门存在可利用的通行漏洞，并拿到能开启后门的铜钥匙。读者由此知道潜入库房成为下一步行动选择，但他仍不掌握库房内的守卫布置，相关线索被推进到待兑现状态。",
  concreteFacts: [
    {
      text: "程秩已拿到能打开库房后门的铜钥匙",
      category: "completed",
    },
  ],
  stateDeltas: {
    summary: "主角拿到后门铜钥匙，读者知道后门潜入成为下一步行动可能。",
    characterStates: [
      {
        characterName: "程秩",
        currentGoal: "利用后门铜钥匙进入库房",
        emotion: "紧张但更有把握",
        stressLevel: 62,
        secretExposure: "读者知道他拿到钥匙",
        knownFacts: ["后门铜钥匙可以打开库房后门"],
        misbeliefs: [],
        summary: "程秩掌握了新的潜入手段，但仍不知道库房内的守卫布置。",
      },
    ],
    relationStates: [],
    informationStates: [
      {
        holderType: "reader",
        fact: "后门铜钥匙已经被程秩拿到。",
        status: "known",
        summary: "读者知道关键资源已到位。",
      },
    ],
    foreshadowStates: [
      {
        title: "库房后门",
        summary: "后门铜钥匙提示后续会出现潜入或逃离场景。",
        status: "hinted",
        setupChapterId: "当前章",
      },
    ],
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
      summary: "程秩拿到能打开库房后门的铜钥匙。",
      narrativeImpact: "后续可以合理进入库房或从后门脱身。",
      expectedFutureUse: "库房潜入。",
      constraints: ["只能解释后门通行，不能替代正门权限。"],
      evidence: ["程秩把后门铜钥匙收进袖中。"],
      confidence: 0.88,
      riskLevel: "low",
      riskReason: "",
    },
  ],
  payoffDeltas: [
    {
      ledgerKey: "ku_fang_hou_men",
      title: "库房后门",
      summary: "铜钥匙为后续库房行动提供明确铺垫。",
      scopeType: "chapter",
      currentStatus: "hinted",
      targetStartChapterOrder: 4,
      targetEndChapterOrder: 6,
      firstSeenChapterOrder: 3,
      lastTouchedChapterOrder: 3,
      setupChapterOrder: 3,
      sourceRefs: [],
      evidence: [{ summary: "程秩拿到后门铜钥匙。", chapterOrder: 3 }],
      riskSignals: [],
      statusReason: "本章完成铺垫，后续需要兑现用途。",
      confidence: 0.86,
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
  syncPlan: {
    stateSnapshot: "write",
    characterResources: "write",
    payoffLedger: "delta",
    characterDynamics: "skip",
    reason: "本章没有关系阶段变化，但有状态、资源和伏笔 delta。",
  },
  confidence: 0.86,
  requiresFullReconcile: false,
};

export const chapterArtifactDeltaPrompt: PromptAsset<
  ChapterArtifactDeltaPromptInput,
  ChapterArtifactDeltaOutput
> = {
  id: "novel.chapter.artifact_delta.extract",
  version: "v1",
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
    example: CHAPTER_ARTIFACT_DELTA_EXAMPLE,
    note: [
      "一次性抽取章节摘要、硬事实、状态快照、角色资源、伏笔/payoff、关系动态、信息边界和同步计划。",
      "只记录正文中有明确证据或与任务目标强相关的变化。",
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
      "11a. 必须把本章真正改变的场景结果写入 delta：关系阶段变化、立场变化、承诺/欠债、新义务、资源得失、信息差变化、风险升级都要可追踪，不能只写一段顺滑摘要。",
      "11b. 如果正文只产生氛围或情绪，没有可记录变化，summary 要明确指出本章缺少可写回的硬变化，并降低 confidence。",
      "12. payoffDeltas.currentStatus 只能使用 setup、hinted、pending_payoff、paid_off、failed、overdue；不要输出 active，已推进但未兑现统一用 pending_payoff。",
      "13. payoffDeltas.riskSignals 必须是对象数组，形如 { code, severity, summary }；没有风险就输出 []，不要输出字符串数组。",
      "14. relationDynamics 必须使用 sourceCharacterName、targetCharacterName、stageLabel、stageSummary；characterCandidates 必须使用 proposedName、proposedRole、summary。",
      "15. characterResourceDeltas.updateType 只能使用 introduced、acquired、revealed、used、transferred、lost、consumed、damaged、destroyed、recovered、stale_marked；新创建/首次出现统一用 introduced。",
      "16. characterResourceDeltas.resourceType 只能使用 physical_item、clue、credential、ability_resource、relationship_token、consumable、hidden_card、world_resource；材料、丹药、一次性药草用 consumable，积分/货币/宗门资源用 world_resource。",
      "17. characterResourceDeltas.narrativeFunction 只能使用 tool、clue、weapon、proof、key、cost、promise、hidden_card、constraint；修炼增益通常用 tool，消耗材料/积分用 cost，凭据/借据用 proof 或 constraint。",
      "18. characterResourceDeltas.statusAfter 只能使用 available、hidden、borrowed、transferred、lost、consumed、damaged、destroyed、stale；不要输出 active、owned、usable、used、broken 等自定义状态。",
      "19. payoffDeltas.scopeType 只能使用 book、volume、chapter；全书/故事级伏笔统一用 book，不要输出 story、novel 或 global。",
      "20. stateDeltas.foreshadowStates 的 setupChapterId/payoffChapterId 只有在能确认真实 chapterId 时才填写；如果只能确认第几章，宁可省略或写入章节序号字符串，不要输出数字。",
      "21. syncPlan.stateSnapshot、characterResources、characterDynamics 只能是 skip 或 write；只有 payoffLedger 可以是 skip、delta 或 full_reconcile。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      `章节：第 ${input.chapterOrder} 章《${input.chapterTitle}》`,
      `章节目标：${input.chapterGoal || "无明确目标"}`,
      "",
      "已知角色：",
      input.characterRosterText || "暂无角色名单",
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
    if (output.syncPlan.payoffLedger === "skip" && output.payoffDeltas.length > 0) {
      throw new Error("syncPlan.payoffLedger 为 skip 时不应输出 payoffDeltas。");
    }
    return output;
  },
};
