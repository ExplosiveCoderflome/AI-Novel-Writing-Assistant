import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
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
    discover: "revealed",
    discovered: "revealed",
    expose: "revealed",
    exposed: "revealed",
    gain: "acquired",
    gained: "acquired",
    obtain: "acquired",
    obtained: "acquired",
  };
  const updateType = typeof value.updateType === "string"
    ? updateTypeAliases[value.updateType.trim().toLowerCase()] ?? value.updateType
    : value.updateType;
  return {
    ...value,
    updateType,
  };
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
  const riskSignals = Array.isArray(value.riskSignals)
    ? value.riskSignals.map((signal, index) => normalizePayoffRiskSignal(signal, index))
    : value.riskSignals;
  return {
    ...value,
    currentStatus,
    riskSignals,
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
  setupChapterId: nullableText,
  payoffChapterId: nullableText,
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

export const chapterArtifactDeltaSyncPlanSchema = z.object({
  stateSnapshot: z.enum(["skip", "write"]).default("write"),
  characterResources: z.enum(["skip", "write"]).default("write"),
  payoffLedger: z.enum(["skip", "delta", "full_reconcile"]).default("delta"),
  characterDynamics: z.enum(["skip", "write"]).default("write"),
  reason: z.string().trim().min(1),
});

export const chapterArtifactDeltaOutputSchema = z.object({
  summary: z.string().trim().min(1),
  stateDeltas: chapterArtifactDeltaStateSchema,
  characterResourceDeltas: z.array(z.preprocess(normalizeCharacterResourceDelta, characterResourceExtractionUpdateSchema)).default([]),
  payoffDeltas: z.array(z.preprocess(normalizePayoffDelta, payoffLedgerSyncItemSchema)).default([]),
  relationDynamics: z.array(chapterArtifactRelationDynamicSchema).default([]),
  factionUpdates: z.array(chapterArtifactFactionUpdateSchema).default([]),
  characterCandidates: z.array(chapterArtifactCharacterCandidateSchema).default([]),
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
  summary: "本章完成一次资源获取，并把一条前置线索推进到待兑现状态。",
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
      "一次性抽取状态快照、角色资源、伏笔/payoff、关系动态和同步计划。",
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
      "8. payoffDeltas.currentStatus 只能使用 setup、hinted、pending_payoff、paid_off、failed、overdue；不要输出 active，已推进但未兑现统一用 pending_payoff。",
      "9. payoffDeltas.riskSignals 必须是对象数组，形如 { code, severity, summary }；没有风险就输出 []，不要输出字符串数组。",
      "10. relationDynamics 必须使用 sourceCharacterName、targetCharacterName、stageLabel、stageSummary；characterCandidates 必须使用 proposedName、proposedRole、summary。",
      "11. characterResourceDeltas.updateType 只能使用 introduced、acquired、revealed、used、transferred、lost、consumed、damaged、destroyed、recovered、stale_marked；新创建/首次出现统一用 introduced。",
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
