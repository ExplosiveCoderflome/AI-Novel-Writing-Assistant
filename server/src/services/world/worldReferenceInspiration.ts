import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { worldReferenceInspirationPrompt } from "../../prompting/prompts/world/world.prompts";
import {
  createEmptyWorldReferenceSeedBundle,
  normalizeWorldReferenceSeedBundle,
  type WorldReferenceAnchor,
  type WorldReferenceMode,
  type WorldReferenceSeedBundle,
} from "@ai-novel/shared/types/worldWizard";

export interface ReferenceConceptCard {
  worldType: string;
  templateKey: string;
  coreImagery: string[];
  tone: string;
  keywords: string[];
  summary: string;
}

interface GenerateReferenceInspirationInput {
  sourceText: string;
  worldTypeHint?: string;
  referenceMode: WorldReferenceMode;
  preserveElements?: string[];
  allowedChanges?: string[];
  forbiddenElements?: string[];
  provider?: LLMProvider;
  model?: string;
}

interface ReferenceInspirationPayload {
  conceptCard: ReferenceConceptCard;
  anchors: WorldReferenceAnchor[];
  referenceSeeds: WorldReferenceSeedBundle;
}

const MIN_ANCHOR_COUNT = 4;

export function buildReferenceModeLabel(mode: WorldReferenceMode): string {
  switch (mode) {
    case "extract_base":
      return "提取原作世界基底";
    case "tone_rebuild":
      return "借用原作气质与结构重建";
    case "adapt_world":
    default:
      return "基于原作做架空改造";
  }
}

function uniqueStrings(items: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      items
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean),
    ),
  );
}

function compactText(source: string, maxChars: number): string {
  const normalized = source.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, maxChars - 3).trim()}...`;
}

function normalizeAnchors(raw: unknown): WorldReferenceAnchor[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const anchors = raw
    .map<WorldReferenceAnchor | null>((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      const content = typeof record.content === "string" ? record.content.trim() : "";
      const id = typeof record.id === "string" ? record.id.trim() : "";
      if (!label || !content) {
        return null;
      }
      return {
        id: id || `anchor-${index + 1}`,
        label,
        content,
      };
    })
    .filter((item): item is WorldReferenceAnchor => Boolean(item));

  return Array.from(new Map(anchors.map((item) => [item.label, item])).values()).slice(0, 6);
}

function buildFallbackAnchors(input: GenerateReferenceInspirationInput): WorldReferenceAnchor[] {
  const anchors: WorldReferenceAnchor[] = [];
  const push = (label: string, content: string) => {
    const normalizedLabel = label.trim();
    const normalizedContent = content.trim();
    if (!normalizedLabel || !normalizedContent || anchors.some((item) => item.label === normalizedLabel)) {
      return;
    }
    anchors.push({
      id: `anchor-${anchors.length + 1}`,
      label: normalizedLabel,
      content: normalizedContent,
    });
  };

  if (input.worldTypeHint?.trim()) {
    push("题材基底", `本次改造仍应落在“${input.worldTypeHint.trim()}”这一世界类型范围内。`);
  }
  if (input.preserveElements && input.preserveElements.length > 0) {
    push("必须保留", `原作不可丢的核心基底包括：${input.preserveElements.join("、")}。`);
  }
  if (input.allowedChanges && input.allowedChanges.length > 0) {
    push("允许改造", `允许围绕以下维度做架空变化：${input.allowedChanges.join("、")}。`);
  }
  if (input.forbiddenElements && input.forbiddenElements.length > 0) {
    push("禁止偏离", `以下边界不能被改坏：${input.forbiddenElements.join("、")}。`);
  }
  push("参考摘要", compactText(input.sourceText, 140));
  push(
    "世界边界",
    input.referenceMode === "tone_rebuild"
      ? "可以重建具体事实，但仍需保留原作的人际张力、生活质感与叙事手感。"
      : "改造必须建立在原作世界基底之上，不能直接跳成无关题材或失真模板。",
  );
  push("社会基底", "需要先识别原作所依赖的社会现实、行业生态与生活压力结构。");
  push("改造焦点", "优先围绕地点系统、势力网络、隐性规则与公开秩序边界来做改造。");

  return anchors.slice(0, 6);
}

function normalizeConceptCard(
  raw: unknown,
  input: GenerateReferenceInspirationInput,
  anchors: WorldReferenceAnchor[],
): ReferenceConceptCard {
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const coreImagery = Array.isArray(record.coreImagery)
    ? uniqueStrings(record.coreImagery.map((item) => (typeof item === "string" ? item : ""))).slice(0, 6)
    : [];
  const keywords = Array.isArray(record.keywords)
    ? uniqueStrings(record.keywords.map((item) => (typeof item === "string" ? item : ""))).slice(0, 8)
    : [];

  const fallbackSummary = input.referenceMode === "extract_base"
    ? `该世界应先提炼原作的稳定世界基底，再决定后续扩写方向。当前识别出的关键锚点包括：${anchors.map((item) => item.label).join("、")}。`
    : input.referenceMode === "tone_rebuild"
      ? `本次目标不是照搬原作事实，而是保留其城市气质、关系结构与叙事手感，再重建一套新的世界组织方式。关键参考锚点包括：${anchors.map((item) => item.label).join("、")}。`
      : `本次世界应建立在原作基底之上进行架空改造，先保住原作气质与现实骨架，再围绕允许改造的维度重新组织世界规则。关键锚点包括：${anchors.map((item) => item.label).join("、")}。`;

  return {
    worldType: typeof record.worldType === "string" && record.worldType.trim()
      ? record.worldType.trim()
      : input.worldTypeHint?.trim() || "参考作品改造世界",
    templateKey: "custom",
    coreImagery: coreImagery.length > 0 ? coreImagery : anchors.map((item) => item.label).slice(0, 5),
    tone: typeof record.tone === "string" && record.tone.trim()
      ? record.tone.trim()
      : "保留原作气质并进行受控改造",
    keywords: keywords.length > 0 ? keywords : uniqueStrings(anchors.flatMap((item) => [item.label, item.content])).slice(0, 8),
    summary: typeof record.summary === "string" && record.summary.trim()
      ? record.summary.trim()
      : fallbackSummary,
  };
}

function buildPrompt(input: GenerateReferenceInspirationInput): string {
  return [
    `参考方式：${buildReferenceModeLabel(input.referenceMode)}`,
    input.worldTypeHint?.trim() ? `世界类型提示：${input.worldTypeHint.trim()}` : "",
    input.preserveElements && input.preserveElements.length > 0
      ? `必须保留：${input.preserveElements.join("、")}`
      : "",
    input.allowedChanges && input.allowedChanges.length > 0
      ? `允许改造：${input.allowedChanges.join("、")}`
      : "",
    input.forbiddenElements && input.forbiddenElements.length > 0
      ? `禁止偏离：${input.forbiddenElements.join("、")}`
      : "",
    `参考材料：${input.sourceText}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateReferenceInspirationAnalysis(
  input: GenerateReferenceInspirationInput,
): Promise<ReferenceInspirationPayload> {
  const retryPrompt = `${buildPrompt(input)}

请注意：
1. 如果是“基于原作做架空改造”，重点是提炼原作世界锚点、可直接沿用的原作设定和改造边界，而不是生成新的题材模板。
2. 如果是“提取原作世界基底”，重点是稳定事实与世界组织方式，不要主动放大改造。
3. 如果是“借用原作气质与结构重建”，重点是保留氛围、关系结构和生活质感，不要求保留全部具体事实。`;

  for (const prompt of [buildPrompt(input), retryPrompt]) {
    try {
      const result = await runStructuredPrompt({
        asset: worldReferenceInspirationPrompt,
        promptInput: {
          userPrompt: prompt,
          isRetry: prompt === retryPrompt,
        },
        options: {
          provider: input.provider ?? "deepseek",
          model: input.model,
          temperature: 0.2,
        },
      });
      const parsed = result.output;

      const anchors = normalizeAnchors((parsed as any).anchors);
      const safeAnchors = anchors.length >= MIN_ANCHOR_COUNT ? anchors : buildFallbackAnchors(input);
      const referenceSeeds = normalizeWorldReferenceSeedBundle(
        (parsed as any).seedPackage ?? (parsed as any).referenceSeeds,
      );
      return {
        conceptCard: normalizeConceptCard((parsed as any).conceptCard, input, safeAnchors),
        anchors: safeAnchors,
        referenceSeeds,
      };
    } catch {
      continue;
    }
  }

  const fallbackAnchors = buildFallbackAnchors(input);
  return {
    conceptCard: normalizeConceptCard(null, input, fallbackAnchors),
    anchors: fallbackAnchors,
    referenceSeeds: createEmptyWorldReferenceSeedBundle(),
  };
}
