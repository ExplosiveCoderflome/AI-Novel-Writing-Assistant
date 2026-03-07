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
  stageLabel: string,
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
  const growthStart = constraints?.growthStage ?? "start";
  return {
    nameSuggestion: description.slice(0, 12) || "Unnamed Character",
    role: constraints?.storyFunction || input.category.trim(),
    corePersona: constraints?.toneStyle || "rational and restrained with hidden emotional tension",
    surfaceTemperament: constraints?.toneStyle || "calm on the surface, intense underneath",
    coreDrive: constraints?.internalNeed || "needs recognition and emotional safety",
    socialMask: "appears composed and in-control in public, reveals anxiety in private",
    behaviorPatterns: [
      constraints?.externalGoal ? `prioritizes actions around "${constraints.externalGoal}"` : "result-driven in critical moments",
      constraints?.moralBottomLine ? `keeps moral line: "${constraints.moralBottomLine}"` : "keeps a personal bottom line under pressure",
    ],
    triggerPoints: [
      constraints?.coreFear ? `strong stress reaction when touching "${constraints.coreFear}"` : "reacts strongly to betrayal or being underestimated",
    ],
    lifeOrigin: constraints?.relationshipHooks || `derived from user description: ${description}`,
    relationshipNetwork: constraints?.relationshipHooks ? [constraints.relationshipHooks] : ["strong tie to core cast"],
    externalGoal: constraints?.externalGoal || "secure a staged victory while preserving key relationships",
    internalNeed: constraints?.internalNeed || "be understood and accepted",
    coreFear: constraints?.coreFear || "losing control and hurting important people",
    moralBottomLine: constraints?.moralBottomLine || "does not actively harm innocents",
    secret: constraints?.secret || "keeps a decisive truth from the past",
    coreFlaw: constraints?.coreFlaw || "overcontrol that strains relationships",
    growthArc: [
      `${growthStart}: acts for external objective`,
      "turning point: flaw exposed in major conflict with real cost",
      "resolution: integrates inner need with external mission and makes a new choice",
    ],
    keyEvents: [
      "trigger event: pulled into high-pressure conflict",
      "breakthrough event: secret exposed or core relationship ruptures",
      "resolution event: makes a decisive trade-off",
    ],
    dailyAnchors: ["regular solo debrief", "stabilizes mood with fixed rituals"],
    habitualActions: ["brief pause before key responses", "adjusts sleeves when tense"],
    speechStyle: "concise and controlled; direct at decision points",
    talents: ["information synthesis", "rapid situational judgment", "execution under pressure"],
    conflictKeywords: ["control", "trust", "sacrifice"],
    themeKeywords: ["growth", "redemption", "cost"],
    bodyType: "fit build, tense posture, efficient movement",
    facialFeatures: "sharp eye focus and high facial recognizability",
    styleSignature: "utility-first outfit with one repeating signature accessory",
    auraAndVoice: "cool and steady voice, noticeable presence",
    appearance: "clean and capable look with memorable detail",
    toneStyle: constraints?.toneStyle || "restrained, calm, high inner tension",
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
  const habitualActions = toStringList(skeleton.habitualActions, 3);
  const talents = toStringList(skeleton.talents, 4);
  const conflictKeywords = toStringList(skeleton.conflictKeywords, 4);
  const themeKeywords = toStringList(skeleton.themeKeywords, 4);

  const personality = [
    `Core Persona: ${toTrimmedText(skeleton.corePersona) || "complex and restrained"}` ,
    `Surface Temperament: ${toTrimmedText(skeleton.surfaceTemperament) || constraints?.toneStyle || "calm and controlled"}`,
    `Core Drive: ${toTrimmedText(skeleton.coreDrive) || constraints?.internalNeed || "needs understanding and belonging"}` ,
    behaviorPatterns.length > 0 ? `Behavior Patterns: ${behaviorPatterns.join("; ")}` : "",
    triggerPoints.length > 0 ? `Emotional Triggers: ${triggerPoints.join("; ")}` : "",
    toTrimmedText(skeleton.socialMask) ? `Social Mask: ${toTrimmedText(skeleton.socialMask)}` : "",
  ].filter(Boolean).join(". ");

  const background = [
    `Origin: ${toTrimmedText(skeleton.lifeOrigin) || `derived from description: ${input.description.trim()}`}` ,
    relationHooks.length > 0 ? `Relationship Network: ${relationHooks.join("; ")}` : "",
    `Secret: ${toTrimmedText(skeleton.secret) || constraints?.secret || "to be revealed by plot"}` ,
  ].filter(Boolean).join(". ");

  const development = growthArc.length > 0
    ? growthArc.join(" -> ")
    : `${constraints?.growthStage || "start"} -> setback -> resolution`;

  const weaknesses = [
    `Core Flaw: ${toTrimmedText(skeleton.coreFlaw) || constraints?.coreFlaw || "decision instability under pressure"}` ,
    `Cost: ${toTrimmedText(skeleton.coreFear) || constraints?.coreFear || "loss of key relationships"}` ,
  ].join("; ");

  const appearance = [
    `Body: ${toTrimmedText(skeleton.bodyType) || "fit but tense posture"}` ,
    `Facial Features: ${toTrimmedText(skeleton.facialFeatures) || toTrimmedText(skeleton.appearance) || "recognizable sharp gaze"}` ,
    `Style Signature: ${toTrimmedText(skeleton.styleSignature) || "practical outfit with recurring marker"}` ,
    `Aura/Voice: ${toTrimmedText(skeleton.auraAndVoice) || "steady cool voice with pressure aura"}` ,
  ].filter(Boolean).join(". ");

  const interests = [
    dailyAnchors.length > 0 ? `Daily Anchors: ${dailyAnchors.join("; ")}` : "",
    habitualActions.length > 0 ? `Habitual Actions: ${habitualActions.join("; ")}` : "",
    toTrimmedText(skeleton.speechStyle) ? `Speech Style: ${toTrimmedText(skeleton.speechStyle)}` : "",
    talents.length > 0 ? `Talents: ${talents.join("; ")}` : "",
  ].filter(Boolean).join(". ");

  const tagSet = new Set<string>([
    role,
    toTrimmedText(skeleton.surfaceTemperament),
    ...talents,
    ...conflictKeywords,
    ...themeKeywords,
  ].filter(Boolean));

  return {
    name: toTrimmedText(skeleton.nameSuggestion) || input.description.trim().slice(0, 12) || "Unnamed Character",
    role,
    personality: personality || input.description.trim(),
    background: background || `derived from user description: ${input.description.trim()}` ,
    development: development || "growth arc pending",
    appearance: appearance || toTrimmedText(skeleton.appearance),
    weaknesses,
    interests: interests || "maintains stability through repeated daily rituals",
    keyEvents: keyEvents.join("; ") || "trigger event; breakthrough event; resolution event",
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
    new SystemMessage(`You are a senior Chinese fiction character planner.
Task: generate a character skeleton JSON only.
Priority: constraints > reference context > user description.
If constraints conflict, put conflict points into conflictNotes.
Output valid JSON only, no markdown, no explanation.
Required JSON keys:
{
  "nameSuggestion": "...",
  "role": "...",
  "corePersona": "...",
  "surfaceTemperament": "...",
  "coreDrive": "...",
  "socialMask": "...",
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
  "growthArc": ["phase1","phase2","phase3"],
  "keyEvents": ["event1","event2","event3"],
  "dailyAnchors": ["..."],
  "habitualActions": ["..."],
  "speechStyle": "...",
  "talents": ["..."],
  "conflictKeywords": ["..."],
  "themeKeywords": ["..."],
  "bodyType": "...",
  "facialFeatures": "...",
  "styleSignature": "...",
  "auraAndVoice": "...",
  "appearance": "...",
  "toneStyle": "...",
  "conflictNotes": ["..."]
}`),
    new HumanMessage(`Character description: ${input.description}
Character category: ${input.category}
Genre: ${input.genre ?? "general"}
Constraints:
${constraintsText}
${referenceContext ? `Reference context:
${referenceContext}` : "Reference context: none"}`),
  ];

  const stageOne = await invokeJsonWithRetry(llm, stageOneMessages, "skeleton");
  if (stageOne.retried || !stageOne.parsed) {
    console.warn("[base-characters.generate] stage_one_retry_or_fallback", {
      retried: stageOne.retried,
      parseSucceeded: Boolean(stageOne.parsed),
      errorMessage: stageOne.errorMessage ?? "",
    });
  }

  const skeleton = stageOne.parsed ?? buildFallbackSkeleton(input, constraints);
  const stageTwoMessages: BaseMessage[] = [
    new SystemMessage(`You are a senior Chinese fiction character editor.
Convert the character skeleton into final storage JSON.
Priority: constraints > reference context > user description.
Field requirements:
- personality: include core persona + surface temperament + core drive + behavior patterns + emotional triggers.
- appearance: include body type + facial features + style signature + aura/voice.
- background: include origin + relationship network + secret.
- development: 3-stage growth arc.
- weaknesses: flaw + cost.
- interests: include daily anchors + habitual actions + speech style + talents.
- keyEvents: exactly 3 pivotal events, joined in one string.
- tags: comma-separated, include role + conflict/theme keywords + distinguishing traits.
Output valid JSON only:
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
  "tags": "tag1,tag2"
}`),
    new HumanMessage(`Character skeleton:
${JSON.stringify(skeleton, null, 2)}
Constraints:
${constraintsText}
${referenceContext ? `Reference context:
${referenceContext}` : "Reference context: none"}`),
  ];

  const stageTwo = await invokeJsonWithRetry(llm, stageTwoMessages, "final");
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
