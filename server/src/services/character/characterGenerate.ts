import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { getLLM } from "../../llm/factory";
import { buildReferenceContext } from "./characterGenerateReference";

const STORY_FUNCTION_VALUES = ["主角", "反派", "导师", "对照组", "配角"] as const;
const GROWTH_STAGE_VALUES = ["起点", "受挫", "转折", "觉醒", "收束"] as const;

export const characterGenerateConstraintsSchema = z.object({
  storyFunction: z.enum(STORY_FUNCTION_VALUES).optional(),
  externalGoal: z.string().trim().optional(),
  internalNeed: z.string().trim().optional(),
  coreFear: z.string().trim().optional(),
  moralBottomLine: z.string().trim().optional(),
  secret: z.string().trim().optional(),
  coreFlaw: z.string().trim().optional(),
  relationshipHooks: z.string().trim().optional(),
  growthStage: z.enum(GROWTH_STAGE_VALUES).optional(),
  toneStyle: z.string().trim().optional(),
});

export type CharacterGenerateConstraints = z.infer<typeof characterGenerateConstraintsSchema>;

export interface CharacterGenerateInput {
  description: string;
  category: string;
  genre?: string;
  provider?: LLMProvider;
  model?: string;
  novelId?: string;
  knowledgeDocumentIds?: string[];
  bookAnalysisIds?: string[];
  constraints?: CharacterGenerateConstraints;
}

type CreatedBaseCharacter = Awaited<ReturnType<typeof prisma.baseCharacter.create>>;

interface JsonInvokeResult {
  parsed: Record<string, unknown> | null;
  retried: boolean;
  rawText: string;
  errorMessage?: string;
}

interface FinalCharacterPayload {
  name: string;
  role: string;
  personality: string;
  background: string;
  development: string;
  appearance: string;
  weaknesses: string;
  interests: string;
  keyEvents: string;
  tags: string;
  category: string;
}

export interface GenerateBaseCharacterResult {
  data: CreatedBaseCharacter;
  outputAnomaly: boolean;
}

function extractJSONObject(source: string): string {
  const normalized = source.replace(/```json|```/gi, "").trim();
  const first = normalized.indexOf("{");
  const last = normalized.lastIndexOf("}");
  if (first === -1 || last === -1 || first >= last) {
    throw new Error("模型输出异常：无法解析为合法 JSON。");
  }
  return normalized.slice(first, last + 1);
}

function toTrimmedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toStringList(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => toTrimmedText(item))
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeConstraints(input: CharacterGenerateConstraints | undefined): CharacterGenerateConstraints | null {
  if (!input) {
    return null;
  }
  const normalized: CharacterGenerateConstraints = {
    storyFunction: input.storyFunction,
    externalGoal: toTrimmedText(input.externalGoal),
    internalNeed: toTrimmedText(input.internalNeed),
    coreFear: toTrimmedText(input.coreFear),
    moralBottomLine: toTrimmedText(input.moralBottomLine),
    secret: toTrimmedText(input.secret),
    coreFlaw: toTrimmedText(input.coreFlaw),
    relationshipHooks: toTrimmedText(input.relationshipHooks),
    growthStage: input.growthStage,
    toneStyle: toTrimmedText(input.toneStyle),
  };
  return Object.values(normalized).some(Boolean) ? normalized : null;
}

function assertConstraintConsistency(category: string, constraints: CharacterGenerateConstraints | null): void {
  if (!constraints?.storyFunction) {
    return;
  }
  const normalizedCategory = category.trim();
  const categoryInSet = STORY_FUNCTION_VALUES.includes(normalizedCategory as (typeof STORY_FUNCTION_VALUES)[number]);
  if (categoryInSet && normalizedCategory !== constraints.storyFunction) {
    throw new Error(`约束冲突：角色类别“${normalizedCategory}”与故事功能位“${constraints.storyFunction}”不一致，请统一后再试。`);
  }
}

function buildConstraintsText(constraints: CharacterGenerateConstraints | null): string {
  if (!constraints) {
    return "无";
  }
  const lines = [
    constraints.storyFunction ? `角色功能位：${constraints.storyFunction}` : "",
    constraints.externalGoal ? `外显目标：${constraints.externalGoal}` : "",
    constraints.internalNeed ? `内在需求：${constraints.internalNeed}` : "",
    constraints.coreFear ? `核心恐惧：${constraints.coreFear}` : "",
    constraints.moralBottomLine ? `道德底线：${constraints.moralBottomLine}` : "",
    constraints.secret ? `秘密：${constraints.secret}` : "",
    constraints.coreFlaw ? `核心缺陷：${constraints.coreFlaw}` : "",
    constraints.relationshipHooks ? `关系钩子：${constraints.relationshipHooks}` : "",
    constraints.growthStage ? `成长阶段：${constraints.growthStage}` : "",
    constraints.toneStyle ? `风格语气：${constraints.toneStyle}` : "",
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : "无";
}

async function invokeJsonWithRetry(
  llm: Awaited<ReturnType<typeof getLLM>>,
  messages: BaseMessage[],
  stageLabel: "骨架" | "成稿",
): Promise<JsonInvokeResult> {
  let retried = false;
  let rawText = "";
  let errorMessage = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const repairInstruction = new SystemMessage(
      `你上一次在${stageLabel}阶段输出不符合 JSON 规范。请严格只输出合法 JSON，不要任何解释和 markdown。`,
    );
    const currentMessages = attempt === 0 ? messages : [...messages, repairInstruction];
    try {
      const result = await llm.invoke(currentMessages);
      rawText = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
      const parsed = JSON.parse(extractJSONObject(rawText)) as Record<string, unknown>;
      return { parsed, retried, rawText };
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : `模型输出异常：${stageLabel}阶段无法解析。`;
      if (attempt === 0) {
        retried = true;
        continue;
      }
    }
  }

  return {
    parsed: null,
    retried,
    rawText,
    errorMessage,
  };
}

function buildFallbackSkeleton(input: CharacterGenerateInput, constraints: CharacterGenerateConstraints | null): Record<string, unknown> {
  const description = input.description.trim();
  const growthStart = constraints?.growthStage ?? "起点";
  return {
    nameSuggestion: description.slice(0, 12) || "未命名角色",
    role: constraints?.storyFunction || input.category.trim(),
    corePersona: constraints?.toneStyle || "理性克制但情绪暗涌",
    behaviorPatterns: [
      constraints?.externalGoal ? `优先围绕“${constraints.externalGoal}”行动` : "以结果为导向",
      constraints?.moralBottomLine ? `坚持底线“${constraints.moralBottomLine}”` : "关键时刻坚持个人底线",
    ],
    triggerPoints: [
      constraints?.coreFear ? `触及“${constraints.coreFear}”会强烈应激` : "被背叛时会激烈反弹",
    ],
    lifeOrigin: constraints?.relationshipHooks || `来自用户描述：${description}`,
    relationshipNetwork: constraints?.relationshipHooks ? [constraints.relationshipHooks] : ["与核心人物存在强关联"],
    externalGoal: constraints?.externalGoal || "达成阶段性胜利并保全关键关系",
    internalNeed: constraints?.internalNeed || "获得被理解与自我接纳",
    coreFear: constraints?.coreFear || "失去掌控并伤害重要之人",
    moralBottomLine: constraints?.moralBottomLine || "不主动伤害无辜者",
    secret: constraints?.secret || "隐藏过去的关键真相",
    coreFlaw: constraints?.coreFlaw || "过度控制导致关系紧绷",
    growthArc: [
      `${growthStart}：以外在目标驱动行动`,
      "转折：在重大冲突中暴露缺陷并付出代价",
      "收束：整合自我需求与外在使命，形成新选择",
    ],
    keyEvents: ["触发事件：被卷入高压冲突", "破局事件：秘密暴露或关系断裂", "收束事件：做出关键取舍"],
    dailyAnchors: ["偏好独处复盘", "保持某种固定习惯以稳定情绪"],
    conflictKeywords: ["控制", "信任", "牺牲"],
    themeKeywords: ["成长", "救赎", "代价"],
    appearance: "外在形象干练，细节处保留鲜明记忆点",
    toneStyle: constraints?.toneStyle || "克制、冷静、内心有张力",
  };
}

function buildFallbackFinalPayload(
  input: CharacterGenerateInput,
  constraints: CharacterGenerateConstraints | null,
  skeleton: Record<string, unknown>,
): FinalCharacterPayload {
  const role = constraints?.storyFunction || toTrimmedText(skeleton.role) || input.category.trim();
  const behaviorPatterns = toStringList(skeleton.behaviorPatterns, 4);
  const triggerPoints = toStringList(skeleton.triggerPoints, 3);
  const relationHooks = toStringList(skeleton.relationshipNetwork, 3);
  const growthArc = toStringList(skeleton.growthArc, 3);
  const keyEvents = toStringList(skeleton.keyEvents, 3);
  const dailyAnchors = toStringList(skeleton.dailyAnchors, 3);
  const conflictKeywords = toStringList(skeleton.conflictKeywords, 4);
  const themeKeywords = toStringList(skeleton.themeKeywords, 4);

  const personality = [
    `核心人格：${toTrimmedText(skeleton.corePersona) || "复杂克制"}`,
    behaviorPatterns.length > 0 ? `行为模式：${behaviorPatterns.join("；")}` : "",
    triggerPoints.length > 0 ? `触发点：${triggerPoints.join("；")}` : "",
  ].filter(Boolean).join("。");

  const background = [
    `身世起点：${toTrimmedText(skeleton.lifeOrigin) || `来自描述：${input.description.trim()}`}`,
    relationHooks.length > 0 ? `关系网络：${relationHooks.join("；")}` : "",
    `秘密：${toTrimmedText(skeleton.secret) || constraints?.secret || "待剧情逐步揭示"}`,
  ].filter(Boolean).join("。");

  const development = growthArc.length > 0
    ? growthArc.join(" -> ")
    : `${constraints?.growthStage || "起点"} -> 受挫 -> 收束`;

  const weaknesses = [
    `核心缺陷：${toTrimmedText(skeleton.coreFlaw) || constraints?.coreFlaw || "高压下决策失衡"}`,
    `代价：${toTrimmedText(skeleton.coreFear) || constraints?.coreFear || "容易错失关键关系"}`,
  ].join("；");

  const tagSet = new Set<string>([
    role,
    ...conflictKeywords,
    ...themeKeywords,
  ].filter(Boolean));

  return {
    name: toTrimmedText(skeleton.nameSuggestion) || input.description.trim().slice(0, 12) || "未命名角色",
    role,
    personality: personality || input.description.trim(),
    background: background || `来自用户描述：${input.description.trim()}`,
    development: development || "待补充成长线",
    appearance: toTrimmedText(skeleton.appearance),
    weaknesses,
    interests: dailyAnchors.join("；") || "偏好通过日常仪式感维持稳定",
    keyEvents: keyEvents.join("；") || "触发事件；破局事件；收束事件",
    tags: Array.from(tagSet).slice(0, 10).join(","),
    category: input.category.trim(),
  };
}

function mergeFinalPayload(
  generated: Record<string, unknown> | null,
  fallback: FinalCharacterPayload,
  constraints: CharacterGenerateConstraints | null,
): FinalCharacterPayload {
  const merged: FinalCharacterPayload = {
    name: toTrimmedText(generated?.name) || fallback.name,
    role: constraints?.storyFunction || toTrimmedText(generated?.role) || fallback.role,
    personality: toTrimmedText(generated?.personality) || fallback.personality,
    background: toTrimmedText(generated?.background) || fallback.background,
    development: toTrimmedText(generated?.development) || fallback.development,
    appearance: toTrimmedText(generated?.appearance) || fallback.appearance,
    weaknesses: toTrimmedText(generated?.weaknesses) || fallback.weaknesses,
    interests: toTrimmedText(generated?.interests) || fallback.interests,
    keyEvents: toTrimmedText(generated?.keyEvents) || fallback.keyEvents,
    tags: toTrimmedText(generated?.tags) || fallback.tags,
    category: fallback.category,
  };
  return merged;
}

export async function generateBaseCharacterFromAI(input: CharacterGenerateInput): Promise<GenerateBaseCharacterResult> {
  const constraints = normalizeConstraints(input.constraints);
  assertConstraintConsistency(input.category, constraints);

  console.info("[base-characters.generate] start", {
    category: input.category,
    hasConstraints: Boolean(constraints),
    knowledgeRefCount: input.knowledgeDocumentIds?.length ?? 0,
    bookAnalysisRefCount: input.bookAnalysisIds?.length ?? 0,
  });

  const referenceContext = await buildReferenceContext({
    novelId: input.novelId,
    knowledgeDocumentIds: input.knowledgeDocumentIds,
    bookAnalysisIds: input.bookAnalysisIds,
  });

  const llm = await getLLM(input.provider ?? "deepseek", {
    model: input.model,
    temperature: 0.6,
  });

  const constraintsText = buildConstraintsText(constraints);
  const stageOneMessages: BaseMessage[] = [
    new SystemMessage(`你是资深中文小说角色策划。现在只做“角色骨架”设计。
优先级（必须遵守）：约束条件 > 参考资料 > 用户描述。
如果约束内部冲突，请在 conflictNotes 指出冲突点，并尽量给出可执行骨架。
只输出合法 JSON，不要 markdown、不要解释。
输出 JSON：
{
  "nameSuggestion": "...",
  "role": "...",
  "corePersona": "...",
  "behaviorPatterns": ["..."],
  "triggerPoints": ["..."],
  "lifeOrigin": "...",
  "relationshipNetwork": ["..."],
  "externalGoal": "...",
  "internalNeed": "...",
  "coreFear": "...",
  "moralBottomLine": "...",
  "secret": "...",
  "coreFlaw": "...",
  "growthArc": ["阶段1","阶段2","阶段3"],
  "keyEvents": ["事件1","事件2","事件3"],
  "dailyAnchors": ["..."],
  "conflictKeywords": ["..."],
  "themeKeywords": ["..."],
  "appearance": "...",
  "toneStyle": "...",
  "conflictNotes": ["..."]
}`),
    new HumanMessage(`角色描述：${input.description}
角色类别：${input.category}
小说类型：${input.genre ?? "通用"}
约束条件：
${constraintsText}
${referenceContext ? `参考资料：\n${referenceContext}` : "参考资料：无"}`),
  ];

  const stageOne = await invokeJsonWithRetry(llm, stageOneMessages, "骨架");
  if (stageOne.retried || !stageOne.parsed) {
    console.warn("[base-characters.generate] stage_one_retry_or_fallback", {
      retried: stageOne.retried,
      parseSucceeded: Boolean(stageOne.parsed),
      errorMessage: stageOne.errorMessage ?? "",
    });
  }

  const skeleton = stageOne.parsed ?? buildFallbackSkeleton(input, constraints);
  const stageTwoMessages: BaseMessage[] = [
    new SystemMessage(`你是资深中文小说角色编辑。请把角色骨架转换为最终入库 JSON。
优先级（必须遵守）：约束条件 > 参考资料 > 用户描述。
字段要求：
- personality：核心人格 + 行为模式 + 触发点
- background：身世/关系/秘密
- development：三段式成长弧
- weaknesses：核心缺陷 + 代价
- keyEvents：严格 3 个关键事件，用“；”连接
- interests：偏好与日常锚点
- tags：逗号分隔，包含角色功能位 + 冲突关键词 + 主题词
只输出合法 JSON：
{
  "name": "...",
  "role": "...",
  "personality": "...",
  "background": "...",
  "development": "...",
  "appearance": "...",
  "weaknesses": "...",
  "interests": "...",
  "keyEvents": "...",
  "tags": "标签1,标签2"
}`),
    new HumanMessage(`角色骨架：
${JSON.stringify(skeleton, null, 2)}
约束条件：
${constraintsText}
${referenceContext ? `参考资料：\n${referenceContext}` : "参考资料：无"}`),
  ];

  const stageTwo = await invokeJsonWithRetry(llm, stageTwoMessages, "成稿");
  if (stageTwo.retried || !stageTwo.parsed) {
    console.warn("[base-characters.generate] stage_two_retry_or_fallback", {
      retried: stageTwo.retried,
      parseSucceeded: Boolean(stageTwo.parsed),
      errorMessage: stageTwo.errorMessage ?? "",
    });
  }

  const fallbackPayload = buildFallbackFinalPayload(input, constraints, skeleton);
  const finalPayload = mergeFinalPayload(stageTwo.parsed, fallbackPayload, constraints);
  const outputAnomaly = !stageOne.parsed || !stageTwo.parsed;

  if (outputAnomaly) {
    console.warn("[base-characters.generate] model_output_anomaly_fallback_used", {
      stageOneParsed: Boolean(stageOne.parsed),
      stageTwoParsed: Boolean(stageTwo.parsed),
    });
  }

  const data = await prisma.baseCharacter.create({
    data: finalPayload,
  });

  console.info("[base-characters.generate] done", {
    outputAnomaly,
    retriedStageOne: stageOne.retried,
    retriedStageTwo: stageTwo.retried,
  });

  return {
    data,
    outputAnomaly,
  };
}
