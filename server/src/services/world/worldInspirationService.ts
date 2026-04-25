import type { LLMProvider } from "@ai-novel/shared/types/llm";
import {
  createEmptyWorldReferenceSeedBundle,
  type WorldOptionRefinementLevel,
  type WorldReferenceMode,
} from "@ai-novel/shared/types/worldWizard";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  worldInspirationConceptCardLocalizationPrompt,
  worldInspirationConceptCardPrompt,
} from "../../prompting/prompts/world/world.prompts";
import { getTemplateByKey, WORLD_TEMPLATES } from "./worldTemplates";
import { generateWorldPropertyOptions } from "./worldPropertyOptions";
import { generateReferenceInspirationAnalysis } from "./worldReferenceInspiration";
import { listActiveKnowledgeDocumentContents } from "../knowledge/common";
import { extractJSONObject as extractCanonicalJSONObject } from "../novel/novelP0Utils";

export interface InspirationInput {
  input?: string;
  mode?: "free" | "reference" | "random";
  worldType?: string;
  knowledgeDocumentIds?: string[];
  referenceMode?: WorldReferenceMode;
  preserveElements?: string[];
  allowedChanges?: string[];
  forbiddenElements?: string[];
  refinementLevel?: WorldOptionRefinementLevel;
  optionsCount?: number;
  provider?: LLMProvider;
  model?: string;
}

interface InspirationConceptCard {
  worldType: string;
  templateKey: string;
  coreImagery: string[];
  tone: string;
  keywords: string[];
  summary: string;
}

interface PreparedInspirationSource {
  promptText: string;
  originalLength: number;
  chunkCount: number;
  extracted: boolean;
}

const INSPIRATION_INPUT_SOFT_LIMIT = 14_000;
const INSPIRATION_CHUNK_SIZE = 1_200;
const INSPIRATION_CHUNK_OVERLAP = 120;
const INSPIRATION_MAX_SELECTED_CHUNKS = 12;
const INSPIRATION_MAX_EXCERPT_CHARS = 260;
const INSPIRATION_MAX_DIGEST_CHARS = 18_000;

function extractJSONObject(source: string): string {
  try {
    return extractCanonicalJSONObject(source);
  } catch {
    throw new Error("Invalid JSON object.");
  }
}

function safeParseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function uniqueKnowledgeDocumentIds(ids: string[] | undefined): string[] {
  if (!ids || ids.length === 0) {
    return [];
  }
  return Array.from(new Set(ids.map((item) => item.trim()).filter(Boolean)));
}

function normalizeInspirationText(source: string): string {
  return source
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
}

function compactInspirationExcerpt(source: string, maxChars = INSPIRATION_MAX_EXCERPT_CHARS): string {
  const text = source.replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) {
    return text;
  }
  const headLength = Math.max(40, Math.floor(maxChars * 0.7));
  const tailLength = Math.max(30, maxChars - headLength - 5);
  const head = text.slice(0, headLength).trim();
  const tail = text.slice(-tailLength).trim();
  return `${head} ... ${tail}`;
}

function splitInspirationTextIntoChunks(
  source: string,
  chunkSize = INSPIRATION_CHUNK_SIZE,
  overlap = INSPIRATION_CHUNK_OVERLAP,
): string[] {
  const normalized = normalizeInspirationText(source);
  if (!normalized) {
    return [];
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const units = paragraphs.length > 1
    ? paragraphs
    : normalized
      .split(/(?<=[。！？!?])\s*/)
      .map((item) => item.trim())
      .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const pushLongUnit = (unit: string) => {
    const step = Math.max(1, chunkSize - overlap);
    for (let cursor = 0; cursor < unit.length; cursor += step) {
      const part = unit.slice(cursor, cursor + chunkSize).trim();
      if (part) {
        chunks.push(part);
      }
      if (cursor + chunkSize >= unit.length) {
        break;
      }
    }
  };

  for (const unit of units) {
    if (!unit) {
      continue;
    }
    if (!current) {
      if (unit.length <= chunkSize) {
        current = unit;
      } else {
        pushLongUnit(unit);
      }
      continue;
    }

    const merged = `${current}\n${unit}`;
    if (merged.length <= chunkSize) {
      current = merged;
      continue;
    }

    chunks.push(current);
    if (unit.length <= chunkSize) {
      current = unit;
    } else {
      pushLongUnit(unit);
      current = "";
    }
  }

  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function scoreInspirationChunk(chunk: string): number {
  const lengthScore = Math.min(chunk.length, INSPIRATION_CHUNK_SIZE);
  const newlineScore = (chunk.match(/\n/g) ?? []).length * 8;
  const quoteScore = (chunk.match(/[“”"「」『』]/g) ?? []).length * 3;
  const signalScore = (chunk.match(/世界|帝国|王朝|宗门|魔法|科技|神|历史|冲突|势力|文明|大陆|城邦|种族/g) ?? []).length * 14;
  return lengthScore + newlineScore + quoteScore + signalScore;
}

function pickRepresentativeChunkIndexes(chunks: string[], limit = INSPIRATION_MAX_SELECTED_CHUNKS): number[] {
  if (chunks.length <= limit) {
    return chunks.map((_, index) => index);
  }

  const selected = new Set<number>();
  const total = chunks.length;
  const add = (index: number) => {
    if (index >= 0 && index < total) {
      selected.add(index);
    }
  };

  add(0);
  add(1);
  add(total - 2);
  add(total - 1);
  const middle = Math.floor(total / 2);
  add(middle - 1);
  add(middle);

  const ranked = chunks
    .map((chunk, index) => ({ index, score: scoreInspirationChunk(chunk) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  for (const item of ranked) {
    add(item.index);
    if (selected.size >= limit) {
      break;
    }
  }

  return Array.from(selected).sort((a, b) => a - b);
}

function prepareInspirationSource(source: string): PreparedInspirationSource {
  const normalized = normalizeInspirationText(source);
  if (!normalized) {
    return {
      promptText: "一个模糊的世界观想法。",
      originalLength: 0,
      chunkCount: 0,
      extracted: false,
    };
  }

  if (normalized.length <= INSPIRATION_INPUT_SOFT_LIMIT) {
    return {
      promptText: normalized,
      originalLength: normalized.length,
      chunkCount: 1,
      extracted: false,
    };
  }

  const chunks = splitInspirationTextIntoChunks(normalized);
  const selectedIndexes = pickRepresentativeChunkIndexes(chunks);
  const excerptLines = selectedIndexes
    .map((index) => `[片段 ${index + 1}/${chunks.length}] ${compactInspirationExcerpt(chunks[index])}`);

  const digest = [
    `原文长度：${normalized.length} 字符；分段：${chunks.length}；选取片段：${selectedIndexes.length}。`,
    ...excerptLines,
  ].join("\n");

  return {
    promptText: digest.slice(0, INSPIRATION_MAX_DIGEST_CHARS),
    originalLength: normalized.length,
    chunkCount: chunks.length,
    extracted: true,
  };
}

function needsChineseConceptTranslation(card: InspirationConceptCard): boolean {
  const content = [
    card.worldType,
    card.tone,
    card.summary,
    ...card.coreImagery,
    ...card.keywords,
  ].join(" ");
  const latinCount = (content.match(/[A-Za-z]/g) ?? []).length;
  const cjkCount = (content.match(/[\u4E00-\u9FFF]/g) ?? []).length;
  return latinCount >= 12 && cjkCount < latinCount;
}

async function translateConceptCardToChinese(
  options: { provider?: LLMProvider; model?: string },
  conceptCard: InspirationConceptCard,
): Promise<InspirationConceptCard> {
  if (!needsChineseConceptTranslation(conceptCard)) {
    return conceptCard;
  }

  try {
    const result = await runStructuredPrompt({
      asset: worldInspirationConceptCardLocalizationPrompt,
      promptInput: {
        conceptCardJson: JSON.stringify(conceptCard),
      },
      options: {
        provider: options.provider ?? "deepseek",
        model: options.model,
        temperature: 0.2,
      },
    });
    const parsed = result.output as Partial<InspirationConceptCard>;
    const translatedCoreImagery = Array.isArray(parsed.coreImagery)
      ? parsed.coreImagery.map((item) => String(item).trim()).filter(Boolean)
      : conceptCard.coreImagery;
    const translatedKeywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.map((item) => String(item).trim()).filter(Boolean)
      : conceptCard.keywords;

    return {
      worldType: parsed.worldType?.trim() || conceptCard.worldType,
      templateKey: parsed.templateKey ? getTemplateByKey(parsed.templateKey).key : conceptCard.templateKey,
      coreImagery: translatedCoreImagery,
      tone: parsed.tone?.trim() || conceptCard.tone,
      keywords: translatedKeywords,
      summary: parsed.summary?.trim() || conceptCard.summary,
    };
  } catch {
    return conceptCard;
  }
}

export async function analyzeWorldInspiration(
  input: InspirationInput,
  onProgress?: (message: string) => void,
) {
  onProgress?.(input.mode === "reference" ? "正在整理参考材料" : "正在整理灵感输入");
  let nextInput = input;
  let seededConceptCard: InspirationConceptCard | null = null;
  let inspirationSource = nextInput.input?.trim() || "一个模糊的世界观想法。";
  let seededPreparedSource: PreparedInspirationSource | null = null;

  if (nextInput.mode === "random") {
    const randomTemplate = WORLD_TEMPLATES[Math.floor(Math.random() * WORLD_TEMPLATES.length)];
    const randomPool = [
      "浮空群岛",
      "死寂古城",
      "禁忌实验室",
      "裂隙之门",
      "古老契约",
      "血脉觉醒",
      "记忆税",
      "灵魂货币",
    ];
    const pickedImagery = [...randomPool].sort(() => Math.random() - 0.5).slice(0, 4);
    seededConceptCard = {
      worldType: randomTemplate.worldType,
      templateKey: randomTemplate.key,
      coreImagery: pickedImagery,
      tone: Math.random() > 0.5 ? "阴郁史诗" : "冒险史诗",
      keywords: pickedImagery,
      summary: `这是一个${randomTemplate.name}世界，核心意象为${pickedImagery.join("、")}，整体气质鲜明且冲突张力充足。`,
    };
    inspirationSource = seededConceptCard.summary;
    seededPreparedSource = {
      promptText: inspirationSource,
      originalLength: inspirationSource.length,
      chunkCount: 1,
      extracted: false,
    };
  }

  const activeKnowledgeDocuments = await listActiveKnowledgeDocumentContents(
    uniqueKnowledgeDocumentIds(nextInput.knowledgeDocumentIds),
    { allowDisabled: true },
  );
  if (activeKnowledgeDocuments.length > 0) {
    nextInput = {
      ...nextInput,
      input: [
        nextInput.input?.trim(),
        activeKnowledgeDocuments.map((item) => `知识文档：${item.title}\n${item.content}`).join("\n\n"),
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
    inspirationSource = nextInput.input?.trim() || inspirationSource;
  }

  const normalizedSource = seededPreparedSource ?? prepareInspirationSource(inspirationSource);
  const inspirationRagContext = "";

  let resolvedConceptCard = seededConceptCard;
  let referenceAnchors: Array<{ id: string; label: string; content: string }> = [];
  let referenceSeeds = createEmptyWorldReferenceSeedBundle();
  if (nextInput.mode === "reference") {
    onProgress?.("正在提取原作世界锚点");
    const referenceAnalysis = await generateReferenceInspirationAnalysis({
      sourceText: normalizedSource.promptText,
      worldTypeHint: nextInput.worldType,
      referenceMode: nextInput.referenceMode ?? "adapt_world",
      preserveElements: Array.from(new Set((nextInput.preserveElements ?? []).map((item) => item.trim()).filter(Boolean))),
      allowedChanges: Array.from(new Set((nextInput.allowedChanges ?? []).map((item) => item.trim()).filter(Boolean))),
      forbiddenElements: Array.from(new Set((nextInput.forbiddenElements ?? []).map((item) => item.trim()).filter(Boolean))),
      provider: nextInput.provider,
      model: nextInput.model,
    });
    resolvedConceptCard = await translateConceptCardToChinese({
      provider: nextInput.provider,
      model: nextInput.model,
    }, referenceAnalysis.conceptCard);
    referenceAnchors = referenceAnalysis.anchors;
    referenceSeeds = referenceAnalysis.referenceSeeds;
  } else if (!resolvedConceptCard) {
    onProgress?.("正在生成概念卡");
    const conceptResult = await runStructuredPrompt({
      asset: worldInspirationConceptCardPrompt,
      promptInput: {
        mode: nextInput.mode ?? "free",
        worldTypeHint: nextInput.worldType ?? "无",
        promptText: normalizedSource.promptText,
        extracted: normalizedSource.extracted,
        originalLength: normalizedSource.originalLength,
        ragContext: inspirationRagContext || "无",
        templateKeysText: WORLD_TEMPLATES.map((item) => item.key).join("|"),
      },
      options: {
        provider: nextInput.provider ?? "deepseek",
        model: nextInput.model,
        temperature: 0.7,
      },
    });
    const parsedConcept = conceptResult.output as {
      worldType?: string;
      templateKey?: string;
      coreImagery?: string[];
      tone?: string;
      keywords?: string[];
      summary?: string;
    };
    const rawConceptCard: InspirationConceptCard = {
      worldType: parsedConcept.worldType ?? nextInput.worldType ?? "自定义",
      templateKey: parsedConcept.templateKey
        ? getTemplateByKey(parsedConcept.templateKey).key
        : getTemplateByKey(undefined).key,
      coreImagery: parsedConcept.coreImagery ?? [],
      tone: parsedConcept.tone ?? "中性",
      keywords: parsedConcept.keywords ?? [],
      summary: parsedConcept.summary ?? compactInspirationExcerpt(inspirationSource, 360),
    };
    resolvedConceptCard = await translateConceptCardToChinese({
      provider: nextInput.provider,
      model: nextInput.model,
    }, rawConceptCard);
  }

  const resolvedTemplate = getTemplateByKey(resolvedConceptCard.templateKey);
  let generatedPropertyOptions: Awaited<ReturnType<typeof generateWorldPropertyOptions>> = [];
  try {
    onProgress?.(nextInput.mode === "reference" ? "正在生成架空改造决策" : "正在生成前置属性选项");
    generatedPropertyOptions = await generateWorldPropertyOptions({
      provider: nextInput.provider,
      model: nextInput.model,
      worldType: resolvedConceptCard.worldType || nextInput.worldType || resolvedTemplate.worldType,
      templateName: resolvedTemplate.name,
      templateDescription: resolvedTemplate.description,
      classicElements: resolvedTemplate.classicElements,
      pitfalls: resolvedTemplate.pitfalls,
      conceptSummary: resolvedConceptCard.summary,
      coreImagery: resolvedConceptCard.coreImagery,
      keywords: resolvedConceptCard.keywords,
      tone: resolvedConceptCard.tone,
      sourcePrompt: normalizedSource.promptText,
      ragContext: inspirationRagContext,
      referenceMode: nextInput.mode === "reference" ? (nextInput.referenceMode ?? "adapt_world") : null,
      referenceAnchors,
      preserveElements: nextInput.preserveElements,
      allowedChanges: nextInput.allowedChanges,
      forbiddenElements: nextInput.forbiddenElements,
      refinementLevel: nextInput.refinementLevel,
      optionsCount: nextInput.optionsCount,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    throw new Error(`前置世界属性生成失败：${reason}`);
  }

  return {
    mode: nextInput.mode ?? "free",
    conceptCard: resolvedConceptCard,
    propertyOptions: generatedPropertyOptions,
    referenceAnchors,
    referenceSeeds,
    sourceMeta: {
      extracted: normalizedSource.extracted,
      originalLength: normalizedSource.originalLength,
      chunkCount: normalizedSource.chunkCount,
    },
  };
}
