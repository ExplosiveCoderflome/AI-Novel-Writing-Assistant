import type { Prisma, World as PrismaWorld } from "@prisma/client";
import type { BaseMessageChunk } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  WorldConsistencyReport,
  WorldLayerKey,
  WorldVisualizationPayload,
} from "@ai-novel/shared/types/world";
import { featureFlags } from "../../config/featureFlags";
import { prisma } from "../../db/prisma";
import { getLLM } from "../../llm/factory";
import { createWorldBuildingGraph } from "../../graphs/worldBuildingGraph";
import { getTemplateByKey, LAYER_FIELD_MAP, WORLD_LAYER_ORDER, WORLD_TEMPLATES } from "./worldTemplates";
import { listActiveKnowledgeDocumentContents } from "../knowledge/common";
import { ragServices } from "../rag";
import type { RagOwnerType } from "../rag/types";

const LAYER_STATUSES = ["pending", "generated", "confirmed", "stale"] as const;
type LayerStatus = (typeof LAYER_STATUSES)[number];
type RefineMode = "replace" | "alternatives";

const WORLD_TEXT_FIELDS = [
  "description",
  "background",
  "geography",
  "cultures",
  "magicSystem",
  "politics",
  "races",
  "religions",
  "technology",
  "conflicts",
  "history",
  "economy",
  "factions",
] as const;
type WorldTextField = (typeof WORLD_TEXT_FIELDS)[number];

type LayerStateMap = Record<
  WorldLayerKey,
  {
    key: WorldLayerKey;
    status: LayerStatus;
    updatedAt: string;
  }
>;

interface CreateWorldInput {
  name: string;
  description?: string;
  worldType?: string;
  templateKey?: string;
  axioms?: string;
  background?: string;
  geography?: string;
  cultures?: string;
  magicSystem?: string;
  politics?: string;
  races?: string;
  religions?: string;
  technology?: string;
  conflicts?: string;
  history?: string;
  economy?: string;
  factions?: string;
  selectedDimensions?: string;
  selectedElements?: string;
  knowledgeDocumentIds?: string[];
}

interface WorldGenerateInput {
  name: string;
  description: string;
  worldType: string;
  complexity: "simple" | "standard" | "detailed";
  dimensions: {
    geography: boolean;
    culture: boolean;
    magicSystem: boolean;
    technology: boolean;
    history: boolean;
  };
  provider?: LLMProvider;
  model?: string;
}

interface RefineWorldInput {
  attribute: WorldTextField;
  currentValue: string;
  refinementLevel: "light" | "deep";
  mode?: RefineMode;
  alternativesCount?: number;
  provider?: LLMProvider;
  model?: string;
}

interface InspirationInput {
  input?: string;
  mode?: "free" | "reference" | "random";
  worldType?: string;
  knowledgeDocumentIds?: string[];
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

interface LayerGenerateInput {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

interface LayerUpdateInput {
  content: string;
}

interface DeepeningAnswerInput {
  questionId: string;
  answer: string;
}

interface ImportWorldInput {
  format: "json" | "markdown" | "text";
  content: string;
  name?: string;
  provider?: LLMProvider;
  model?: string;
}

interface LibraryUseInput {
  worldId?: string;
  targetField?: WorldTextField;
}

function cleanJsonText(source: string): string {
  return source.replace(/```json|```/gi, "").trim();
}

function extractJSONObject(source: string): string {
  const text = cleanJsonText(source);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || first >= last) {
    throw new Error("Invalid JSON object.");
  }
  return text.slice(first, last + 1);
}

function extractJSONArray(source: string): string {
  const text = cleanJsonText(source);
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first === -1 || last === -1 || first >= last) {
    throw new Error("Invalid JSON array.");
  }
  return text.slice(first, last + 1);
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

function nowISO(): string {
  return new Date().toISOString();
}

function uniqueKnowledgeDocumentIds(ids: string[] | undefined): string[] {
  if (!ids || ids.length === 0) {
    return [];
  }
  return Array.from(new Set(ids.map((item) => item.trim()).filter(Boolean)));
}

function parseListFromText(content: string, fallback: string[]): string[] {
  const parsed = content
    .split(/[\n,，;；]/)
    .map((item) => item.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

const INSPIRATION_INPUT_SOFT_LIMIT = 14_000;
const INSPIRATION_CHUNK_SIZE = 1_200;
const INSPIRATION_CHUNK_OVERLAP = 120;
const INSPIRATION_MAX_SELECTED_CHUNKS = 12;
const INSPIRATION_MAX_EXCERPT_CHARS = 260;
const INSPIRATION_MAX_DIGEST_CHARS = 18_000;

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
  const signalScore = (chunk.match(/世界|帝国|王朝|宗门|魔法|科技|神|历史|冲突|势力|文明|大陆|城邦|种族/g) ?? []).length
    * 14;
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
    `原文过长，已自动分段提取。`,
    `原文长度：${normalized.length} 字符；分段：${chunks.length}；选取片段：${selectedIndexes.length}。`,
    "以下是用于分析的代表片段：",
    ...excerptLines,
  ].join("\n");

  return {
    promptText: digest.slice(0, INSPIRATION_MAX_DIGEST_CHARS),
    originalLength: normalized.length,
    chunkCount: chunks.length,
    extracted: true,
  };
}

function normalizeLayerStates(raw: string | null | undefined): LayerStateMap {
  const fallback = WORLD_LAYER_ORDER.reduce((acc, key) => {
    acc[key] = { key, status: "pending", updatedAt: nowISO() };
    return acc;
  }, {} as LayerStateMap);
  const parsed = safeParseJSON<Partial<LayerStateMap>>(raw, {});

  for (const key of WORLD_LAYER_ORDER) {
    const existing = parsed[key];
    fallback[key] = {
      key,
      status: LAYER_STATUSES.includes(existing?.status as LayerStatus)
        ? (existing?.status as LayerStatus)
        : "pending",
      updatedAt: existing?.updatedAt ?? fallback[key].updatedAt,
    };
  }
  return fallback;
}

function markDownstreamStale(states: LayerStateMap, fromLayer: WorldLayerKey): LayerStateMap {
  const index = WORLD_LAYER_ORDER.indexOf(fromLayer);
  if (index < 0) {
    return states;
  }
  for (let i = index + 1; i < WORLD_LAYER_ORDER.length; i += 1) {
    const key = WORLD_LAYER_ORDER[i];
    if (states[key].status === "generated" || states[key].status === "confirmed") {
      states[key] = { ...states[key], status: "stale", updatedAt: nowISO() };
    }
  }
  return states;
}

function buildFieldDiff(
  older: Partial<Record<WorldTextField, string | null>>,
  newer: Partial<Record<WorldTextField, string | null>>,
): Array<{ field: WorldTextField; before: string | null; after: string | null }> {
  const changes: Array<{ field: WorldTextField; before: string | null; after: string | null }> = [];
  for (const field of WORLD_TEXT_FIELDS) {
    const before = older[field] ?? null;
    const after = newer[field] ?? null;
    if ((before ?? "") !== (after ?? "")) {
      changes.push({ field, before, after });
    }
  }
  return changes;
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

function needsChineseTextTranslation(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) {
    return false;
  }
  const latinCount = (normalized.match(/[A-Za-z]/g) ?? []).length;
  if (latinCount < 12) {
    return false;
  }
  const cjkCount = (normalized.match(/[\u4E00-\u9FFF]/g) ?? []).length;
  return cjkCount === 0 || cjkCount * 2 < latinCount;
}

function normalizeAxiomList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const normalized = raw
    .map((item) => {
      if (typeof item === "string") {
        return item.trim();
      }
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const candidate = record.text ?? record.content ?? record.axiom ?? record.rule ?? record.value;
        if (typeof candidate === "string") {
          return candidate.trim();
        }
      }
      return "";
    })
    .filter(Boolean);
  return Array.from(new Set(normalized)).slice(0, 5);
}

function normalizeQuickOptionList(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const normalized = raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(normalized)).slice(0, 4);
}

function normalizeGeneratedLayerFieldValue(raw: unknown): string {
  if (typeof raw === "string") {
    return raw.trim();
  }
  if (typeof raw === "number" || typeof raw === "boolean") {
    return String(raw);
  }
  if (Array.isArray(raw)) {
    if (raw.every((item) => typeof item === "string")) {
      return raw.map((item) => item.trim()).filter(Boolean).join("、");
    }
    return JSON.stringify(raw, null, 2);
  }
  if (raw && typeof raw === "object") {
    return JSON.stringify(raw, null, 2);
  }
  return "";
}

export class WorldService {
  async listWorlds() {
    return prisma.world.findMany({
      orderBy: { updatedAt: "desc" },
    });
  }

  async getTemplates() {
    return WORLD_TEMPLATES;
  }

  private queueRagUpsert(ownerType: RagOwnerType, ownerId: string): void {
    void ragServices.ragIndexService.enqueueUpsert(ownerType, ownerId).catch(() => {
      // keep primary workflow resilient even when rag queueing fails
    });
  }

  private queueRagDelete(ownerType: RagOwnerType, ownerId: string): void {
    void ragServices.ragIndexService.enqueueDelete(ownerType, ownerId).catch(() => {
      // keep primary workflow resilient even when rag queueing fails
    });
  }

  async analyzeInspiration(input: InspirationInput) {
    if (input.mode === "random") {
      const template = WORLD_TEMPLATES[Math.floor(Math.random() * WORLD_TEMPLATES.length)];
      const pool = [
        "浮空群岛",
        "死寂古城",
        "禁忌实验室",
        "裂隙之门",
        "古老契约",
        "血脉觉醒",
        "记忆税",
        "灵魂货币",
      ];
      const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, 4);
      return {
        mode: "random",
        conceptCard: {
          worldType: template.worldType,
          templateKey: template.key,
          coreImagery: picked,
          tone: Math.random() > 0.5 ? "阴郁史诗" : "冒险史诗",
          keywords: picked,
          summary: `这是一个${template.name}世界，核心意象为${picked.join("、")}，整体气质鲜明且冲突张力充足。`,
        },
      };
    }

    const knowledgeDocuments = await listActiveKnowledgeDocumentContents(
      uniqueKnowledgeDocumentIds(input.knowledgeDocumentIds),
      { allowDisabled: true },
    );
    if (knowledgeDocuments.length > 0) {
      input = {
        ...input,
        input: [
          input.input?.trim(),
          knowledgeDocuments.map((item) => `知识文档：${item.title}\n${item.content}`).join("\n\n"),
        ]
          .filter(Boolean)
          .join("\n\n"),
      };
    }

    const llm = await getLLM(input.provider ?? "deepseek", {
      model: input.model,
      temperature: 0.7,
    });
    const source = input.input?.trim() || "一个模糊的世界观想法。";
    const preparedSource = prepareInspirationSource(source);
    let ragContext = "";
    if (knowledgeDocuments.length === 0) {
      try {
        ragContext = await ragServices.hybridRetrievalService.buildContextBlock(source, {
          ownerTypes: ["world", "world_library_item"],
          finalTopK: 6,
        });
      } catch {
        ragContext = "";
      }
    }
    const templateKeys = WORLD_TEMPLATES.map((item) => item.key).join("|");
    const result = await llm.invoke([
      new SystemMessage(
        `请输出世界灵感概念卡 JSON，所有文本字段必须是简体中文：
{
  "worldType":"...",
  "templateKey":"${templateKeys}",
  "coreImagery":["..."],
  "tone":"...",
  "keywords":["..."],
  "summary":"3-5句中文概述"
}
仅输出 JSON，不要输出任何解释文字。`,
      ),
      new HumanMessage(
        `模式：${input.mode ?? "free"}
世界类型提示：${input.worldType ?? "无"}
灵感文本：${preparedSource.promptText}
是否分段提取：${preparedSource.extracted ? "是" : "否"}
原文长度：${preparedSource.originalLength} 字符
可用世界观素材检索：${ragContext || "无"}`,
      ),
    ]);
    const parsed = safeParseJSON<{
      worldType?: string;
      templateKey?: string;
      coreImagery?: string[];
      tone?: string;
      keywords?: string[];
      summary?: string;
    }>(extractJSONObject(String(result.content)), {});
    const conceptCard: InspirationConceptCard = {
      worldType: parsed.worldType ?? input.worldType ?? "自定义",
      templateKey: parsed.templateKey ? getTemplateByKey(parsed.templateKey).key : getTemplateByKey(undefined).key,
      coreImagery: parsed.coreImagery ?? [],
      tone: parsed.tone ?? "中性",
      keywords: parsed.keywords ?? [],
      summary: parsed.summary ?? compactInspirationExcerpt(source, 360),
    };
    const normalizedConceptCard = await this.translateConceptCardToChinese(llm, conceptCard);

    return {
      mode: input.mode ?? "free",
      conceptCard: normalizedConceptCard,
      sourceMeta: {
        extracted: preparedSource.extracted,
        originalLength: preparedSource.originalLength,
        chunkCount: preparedSource.chunkCount,
      },
    };
  }

  async createWorld(input: CreateWorldInput) {
    const knowledgeDocumentIds = uniqueKnowledgeDocumentIds(input.knowledgeDocumentIds);
    if (knowledgeDocumentIds.length > 0) {
      const documents = await prisma.knowledgeDocument.findMany({
        where: {
          id: { in: knowledgeDocumentIds },
          status: { not: "archived" },
        },
        select: { id: true },
      });
      if (documents.length !== knowledgeDocumentIds.length) {
        throw new Error("Some knowledge documents are missing or archived.");
      }
    }

    const world = await prisma.world.create({
      data: {
        name: input.name,
        description: input.description,
        worldType: input.worldType,
        templateKey: input.templateKey ?? "custom",
        axioms: input.axioms,
        background: input.background,
        geography: input.geography,
        cultures: input.cultures,
        magicSystem: input.magicSystem,
        politics: input.politics,
        races: input.races,
        religions: input.religions,
        technology: input.technology,
        conflicts: input.conflicts,
        history: input.history,
        economy: input.economy,
        factions: input.factions,
        selectedDimensions: input.selectedDimensions,
        selectedElements: input.selectedElements,
        status: "draft",
        layerStates: JSON.stringify(normalizeLayerStates(undefined)),
      },
    });
    if (knowledgeDocumentIds.length > 0) {
      await prisma.knowledgeBinding.createMany({
        data: knowledgeDocumentIds.map((documentId) => ({
          targetType: "world",
          targetId: world.id,
          documentId,
        })),
      });
    }
    await this.createSnapshot(world.id, "initial-draft");
    this.queueRagUpsert("world", world.id);
    return world;
  }

  async getWorldById(id: string) {
    return prisma.world.findUnique({
      where: { id },
      include: {
        deepeningQA: { orderBy: { createdAt: "desc" } },
        consistencyIssues: { orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }] },
        snapshots: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
  }

  async updateWorld(id: string, input: Partial<CreateWorldInput>) {
    const world = await prisma.world.findUnique({ where: { id } });
    if (!world) {
      throw new Error("World not found.");
    }

    const states = normalizeLayerStates(world.layerStates);
    for (const layer of WORLD_LAYER_ORDER) {
      const watched = LAYER_FIELD_MAP[layer];
      if (watched.some((field) => typeof input[field] === "string")) {
        states[layer] = { ...states[layer], status: "generated", updatedAt: nowISO() };
        markDownstreamStale(states, layer);
      }
    }

    const updated = await prisma.world.update({
      where: { id },
      data: {
        ...input,
        layerStates: JSON.stringify(states),
      },
    });
    this.queueRagUpsert("world", id);
    return updated;
  }

  async deleteWorld(id: string) {
    this.queueRagDelete("world", id);
    await prisma.world.delete({ where: { id } });
  }

  async suggestAxioms(
    worldId: string,
    options: { provider?: LLMProvider; model?: string },
  ) {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }
    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: 0.5,
    });
    const result = await llm.invoke([
      new SystemMessage(
        "请生成 5 条世界核心公理。输出 JSON 数组，数组元素必须是字符串（不要对象），使用简体中文。",
      ),
      new HumanMessage(
        `世界名=${world.name}
世界类型=${world.worldType ?? "未知"}
世界摘要=${world.description ?? "无"}`,
      ),
    ]);

    let parsedRaw: unknown = [];
    try {
      parsedRaw = safeParseJSON<unknown[]>(extractJSONArray(String(result.content)), []);
    } catch {
      parsedRaw = [];
    }
    const axioms = normalizeAxiomList(parsedRaw);
    return axioms.length > 0
      ? axioms
      : [
        "力量必须支付可衡量的代价。",
        "任何规则突破都必须留下可追溯机制。",
        "政治秩序受资源流动约束。",
        "核心冲突必须源于世界规则而非偶然。",
        "任何角色都不能直接违背基础公理。",
      ];
  }

  async updateAxioms(worldId: string, axioms: string[]) {
    const updated = await prisma.world.update({
      where: { id: worldId },
      data: {
        axioms: JSON.stringify(axioms),
        version: { increment: 1 },
      },
    });
    await this.createSnapshot(worldId, "axioms-updated");
    this.queueRagUpsert("world", worldId);
    return updated;
  }

  async generateLayer(worldId: string, layerKey: WorldLayerKey, input: LayerGenerateInput) {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }
    const llm = await getLLM(input.provider ?? "deepseek", {
      model: input.model,
      temperature: input.temperature ?? 0.7,
    });
    const generated = await this.buildLayerGeneration(llm, world, layerKey);

    const states = normalizeLayerStates(world.layerStates);
    states[layerKey] = { key: layerKey, status: "generated", updatedAt: nowISO() };
    markDownstreamStale(states, layerKey);

    const updated = await prisma.world.update({
      where: { id: worldId },
      data: {
        status: "refining",
        layerStates: JSON.stringify(states),
        ...generated,
      },
    });
    await this.createSnapshot(worldId, `${layerKey}-generated`);
    this.queueRagUpsert("world", worldId);

    return {
      world: updated,
      layerKey,
      generated,
      layerStates: states,
    };
  }

  async generateAllLayers(worldId: string, input: LayerGenerateInput) {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }
    const llm = await getLLM(input.provider ?? "deepseek", {
      model: input.model,
      temperature: input.temperature ?? 0.7,
    });

    const generatedByLayer = WORLD_LAYER_ORDER.reduce((acc, layerKey) => {
      acc[layerKey] = {};
      return acc;
    }, {} as Record<WorldLayerKey, Partial<Record<WorldTextField, string>>>);
    const mergedGenerated: Partial<Record<WorldTextField, string>> = {};

    const generatedEntries = await Promise.all(
      WORLD_LAYER_ORDER.map(async (layerKey) => {
        const generated = await this.buildLayerGeneration(llm, world, layerKey);
        return [layerKey, generated] as const;
      }),
    );

    for (const [layerKey, generated] of generatedEntries) {
      generatedByLayer[layerKey] = generated;
      Object.assign(mergedGenerated, generated);
    }

    const states = normalizeLayerStates(world.layerStates);
    const updatedAt = nowISO();
    for (const layerKey of WORLD_LAYER_ORDER) {
      states[layerKey] = { key: layerKey, status: "generated", updatedAt };
    }

    const updated = await prisma.world.update({
      where: { id: worldId },
      data: {
        status: "refining",
        layerStates: JSON.stringify(states),
        ...mergedGenerated,
      },
    });
    await this.createSnapshot(worldId, "layers-generated-all");
    this.queueRagUpsert("world", worldId);

    return {
      world: updated,
      generated: generatedByLayer,
      layerStates: states,
    };
  }

  async updateLayer(worldId: string, layerKey: WorldLayerKey, input: LayerUpdateInput) {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }

    const field = LAYER_FIELD_MAP[layerKey][0];
    const states = normalizeLayerStates(world.layerStates);
    states[layerKey] = { key: layerKey, status: "generated", updatedAt: nowISO() };
    markDownstreamStale(states, layerKey);

    const updated = await prisma.world.update({
      where: { id: worldId },
      data: {
        [field]: input.content,
        layerStates: JSON.stringify(states),
      },
    });
    await this.createSnapshot(worldId, `${layerKey}-manual-update`);
    this.queueRagUpsert("world", worldId);
    return updated;
  }

  async confirmLayer(worldId: string, layerKey: WorldLayerKey) {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }
    const states = normalizeLayerStates(world.layerStates);
    states[layerKey] = { key: layerKey, status: "confirmed", updatedAt: nowISO() };
    const allConfirmed = WORLD_LAYER_ORDER.every((key) => states[key].status === "confirmed");

    const updated = await prisma.world.update({
      where: { id: worldId },
      data: {
        layerStates: JSON.stringify(states),
        status: allConfirmed ? "finalized" : "refining",
        version: { increment: 1 },
      },
    });
    await this.createSnapshot(worldId, `${layerKey}-confirmed`);
    this.queueRagUpsert("world", worldId);
    return updated;
  }

  async createDeepeningQuestions(
    worldId: string,
    options: { provider?: LLMProvider; model?: string },
  ) {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }

    const llm = await getLLM(options.provider ?? "deepseek", {
      model: options.model,
      temperature: 0.6,
    });
    let ragContext = "";
    try {
      ragContext = await ragServices.hybridRetrievalService.buildContextBlock(
        `世界深化问题 ${world.name}\n${world.description ?? ""}`,
        {
          worldId,
          ownerTypes: ["world", "world_library_item"],
          finalTopK: 6,
        },
      );
    } catch {
      ragContext = "";
    }
    const result = await llm.invoke([
      new SystemMessage(
        `Output JSON array with 2-3 items only, each item:
{
  "priority":"required|recommended|optional",
  "question":"...",
  "quickOptions":["...", "...", "..."],
  "targetLayer":"foundation|power|society|culture|history|conflict",
  "targetField":"..."
}
Rules:
- quickOptions must have 2-4 concise candidate answers in Simplified Chinese.
- Only output JSON array.`,
      ),
      new HumanMessage(
        `name=${world.name}
description=${world.description ?? "none"}
data=${JSON.stringify({
          background: world.background,
          geography: world.geography,
          cultures: world.cultures,
          magicSystem: world.magicSystem,
          politics: world.politics,
          races: world.races,
          religions: world.religions,
          technology: world.technology,
          conflicts: world.conflicts,
          history: world.history,
          economy: world.economy,
        })}
ragContext=${ragContext || "none"}`,
      ),
    ]);

    const parsed = safeParseJSON<
      Array<{
        priority?: "required" | "recommended" | "optional";
        question?: string;
        quickOptions?: string[];
        targetLayer?: WorldLayerKey;
        targetField?: WorldTextField;
      }>
    >(extractJSONArray(String(result.content)), []);

    const normalized = parsed
      .filter((item) => item.question?.trim())
      .slice(0, 3)
      .map((item) => ({
        worldId,
        priority: item.priority ?? "recommended",
        question: item.question!.trim(),
        quickOptions: normalizeQuickOptionList(item.quickOptions),
        targetLayer: item.targetLayer ?? null,
        targetField: item.targetField ?? null,
        status: "pending",
      }));

    const deduped = Array.from(
      new Map(normalized.map((item) => [item.question, item])).values(),
    ).slice(0, 3);

    const fallbackPool: Array<{
      worldId: string;
      priority: "required" | "recommended" | "optional";
      question: string;
      quickOptions: string[];
      targetLayer: WorldLayerKey;
      targetField: WorldTextField;
      status: "pending";
    }> = [
      {
        worldId,
        priority: "required",
        question: "How does the power system impact normal people?",
        quickOptions: [],
        targetLayer: "power",
        targetField: "magicSystem",
        status: "pending",
      },
      {
        worldId,
        priority: "recommended",
        question: "What is the current relation among top factions?",
        quickOptions: [],
        targetLayer: "society",
        targetField: "politics",
        status: "pending",
      },
      {
        worldId,
        priority: "recommended",
        question: "Which historical event directly triggers the present conflict?",
        quickOptions: [],
        targetLayer: "history",
        targetField: "history",
        status: "pending",
      },
    ];

    for (const fallback of fallbackPool) {
      if (deduped.length >= 2) {
        break;
      }
      if (!deduped.some((item) => item.question === fallback.question)) {
        deduped.push(fallback);
      }
    }

    await prisma.worldDeepeningQA.createMany({
      data: deduped.map(({ quickOptions, ...rest }) => rest),
    });
    const questions = await prisma.worldDeepeningQA.findMany({
      where: { worldId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    const quickOptionsMap = new Map(deduped.map((item) => [item.question, item.quickOptions]));
    return questions.map((item) => ({
      ...item,
      quickOptions: quickOptionsMap.get(item.question) ?? [],
    }));
  }

  async answerDeepeningQuestions(worldId: string, answers: DeepeningAnswerInput[]) {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }
    if (answers.length === 0) {
      return prisma.worldDeepeningQA.findMany({
        where: { worldId },
        orderBy: { createdAt: "desc" },
      });
    }

    const questions = await prisma.worldDeepeningQA.findMany({
      where: { worldId, id: { in: answers.map((item) => item.questionId) } },
    });
    const questionMap = new Map(questions.map((item) => [item.id, item]));
    const appendMap = new Map<WorldTextField, string[]>();

    for (const answer of answers) {
      const question = questionMap.get(answer.questionId);
      if (!question) {
        continue;
      }
      const merged = `Q: ${question.question}\nA: ${answer.answer.trim()}`;
      const field = question.targetField as WorldTextField | null;
      if (!field) {
        continue;
      }
      const current = appendMap.get(field) ?? [];
      current.push(merged);
      appendMap.set(field, current);
    }

    await prisma.$transaction(async (tx) => {
      for (const answer of answers) {
        const question = questionMap.get(answer.questionId);
        if (!question) {
          continue;
        }
        await tx.worldDeepeningQA.update({
          where: { id: question.id },
          data: {
            answer: answer.answer.trim(),
            integratedSummary: `Q: ${question.question}\nA: ${answer.answer.trim()}`,
            status: "integrated",
          },
        });
      }
      if (appendMap.size > 0) {
        const updateData: Record<string, string> = {};
        for (const [field, segments] of appendMap.entries()) {
          const existing = world[field] ?? "";
          updateData[field] = `${existing}\n\n${segments.join("\n\n")}`.trim();
        }
        await tx.world.update({
          where: { id: worldId },
          data: updateData,
        });
      }
    });

    await this.createSnapshot(worldId, "deepening-integrated");
    this.queueRagUpsert("world", worldId);
    return prisma.worldDeepeningQA.findMany({
      where: { worldId },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    });
  }

  async checkConsistency(
    worldId: string,
    options: { provider?: LLMProvider; model?: string } = {},
  ): Promise<WorldConsistencyReport> {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }

    const issues: Array<{
      severity: "pass" | "warn" | "error";
      code: string;
      message: string;
      detail?: string;
      source: "rule" | "llm";
      targetField?: string;
    }> = [];

    const axioms = world.axioms ?? "";
    const magicText = `${world.magicSystem ?? ""} ${world.cultures ?? ""}`;
    if (
      /(no magic|without magic|magic forbidden|magic disabled)/i.test(axioms)
      && /(magic|spell|wizard|mage|academy|sorcery)/i.test(magicText)
    ) {
      issues.push({
        severity: "error",
        code: "AXIOM_MAGIC_CONFLICT",
        message: "Axiom says no magic but magic-related content is present.",
        detail: "Align core axiom and power-system details.",
        source: "rule",
        targetField: "magicSystem",
      });
    }
    if (
      /(medieval|middle age|cold weapon|pre-industrial)/i.test(`${world.worldType ?? ""} ${world.technology ?? ""}`)
      && /(laser|quantum|warp|fusion|nanotech|mecha)/i.test(world.technology ?? "")
    ) {
      issues.push({
        severity: "warn",
        code: "TECH_ERA_MISMATCH",
        message: "Technology era appears mixed without explanation.",
        detail: "Add explicit source or limit future tech references.",
        source: "rule",
        targetField: "technology",
      });
    }
    if ((world.conflicts ?? "").trim().length < 20) {
      issues.push({
        severity: "warn",
        code: "CONFLICT_WEAK",
        message: "Core conflict is too thin.",
        detail: "Add actors, trigger, and escalation path.",
        source: "rule",
        targetField: "conflicts",
      });
    }
    if (issues.length === 0) {
      issues.push({
        severity: "pass",
        code: "BASELINE_PASS",
        message: "No obvious contradiction found by rule checks.",
        source: "rule",
      });
    }

    try {
      const llm = await getLLM(options.provider ?? "deepseek", {
        model: options.model,
        temperature: 0.2,
      });
      let ragContext = "";
      try {
        ragContext = await ragServices.hybridRetrievalService.buildContextBlock(
          `世界一致性检查 ${world.name}\n${world.description ?? ""}\n${world.conflicts ?? ""}`,
          {
            worldId,
            ownerTypes: ["world", "world_library_item"],
            finalTopK: 8,
          },
        );
      } catch {
        ragContext = "";
      }
      const result = await llm.invoke([
        new SystemMessage(
          `Output JSON array of consistency issues.
Each item: {"severity":"warn|error","code":"...","message":"...","detail":"...","targetField":"..."}
If none, output [] only.`,
        ),
        new HumanMessage(
          `name=${world.name}
axioms=${world.axioms ?? "none"}
payload=${JSON.stringify({
            background: world.background,
            geography: world.geography,
            cultures: world.cultures,
            magicSystem: world.magicSystem,
            politics: world.politics,
            races: world.races,
            religions: world.religions,
            technology: world.technology,
            conflicts: world.conflicts,
            history: world.history,
            economy: world.economy,
          })}
ragContext=${ragContext || "none"}`,
        ),
      ]);
      const llmIssues = safeParseJSON<
        Array<{ severity?: "warn" | "error"; code?: string; message?: string; detail?: string; targetField?: string }>
      >(extractJSONArray(String(result.content)), []);
      for (const issue of llmIssues) {
        if (!issue.message?.trim()) {
          continue;
        }
        issues.push({
          severity: issue.severity ?? "warn",
          code: issue.code ?? "LLM_REVIEW",
          message: issue.message.trim(),
          detail: issue.detail,
          source: "llm",
          targetField: issue.targetField,
        });
      }
    } catch {
      // keep rule-only result
    }

    const errorCount = issues.filter((item) => item.severity === "error").length;
    const warnCount = issues.filter((item) => item.severity === "warn").length;
    const score = Math.max(0, 100 - errorCount * 30 - warnCount * 12);
    const status: "pass" | "warn" | "error" = errorCount > 0 ? "error" : warnCount > 0 ? "warn" : "pass";
    const summary = status === "pass"
      ? "Consistency check passed."
      : `Found ${errorCount} errors and ${warnCount} warnings.`;

    await prisma.$transaction(async (tx) => {
      await tx.worldConsistencyIssue.deleteMany({ where: { worldId } });
      await tx.worldConsistencyIssue.createMany({
        data: issues.map((item) => ({
          worldId,
          severity: item.severity,
          code: item.code,
          message: item.message,
          detail: item.detail ?? null,
          source: item.source,
          status: item.severity === "pass" ? "resolved" : "open",
          targetField: item.targetField ?? null,
        })),
      });
      await tx.world.update({
        where: { id: worldId },
        data: {
          consistencyReport: JSON.stringify({
            worldId,
            score,
            summary,
            status,
            generatedAt: nowISO(),
          }),
        },
      });
    });

    await this.createSnapshot(worldId, "consistency-checked");
    this.queueRagUpsert("world", worldId);

    const persisted = await prisma.worldConsistencyIssue.findMany({
      where: { worldId },
      orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }],
    });
    const normalizedIssues: WorldConsistencyReport["issues"] = persisted.map((item) => ({
      ...item,
      severity: item.severity as "pass" | "warn" | "error",
      source: item.source as "rule" | "llm",
      status: item.status as "open" | "resolved" | "ignored",
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }));
    return {
      worldId,
      score,
      summary,
      status,
      issues: normalizedIssues,
    };
  }

  async updateConsistencyIssueStatus(
    worldId: string,
    issueId: string,
    status: "open" | "resolved" | "ignored",
  ) {
    const updated = await prisma.worldConsistencyIssue.update({
      where: { id: issueId },
      data: { status },
    });
    if (updated.worldId !== worldId) {
      throw new Error("Issue does not belong to world.");
    }
    return updated;
  }

  async getOverview(worldId: string) {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }
    const sections = [
      { key: "description", title: "Overview", content: world.description ?? "N/A" },
      { key: "background", title: "Background", content: world.background ?? "N/A" },
      { key: "geography", title: "Geography", content: world.geography ?? "N/A" },
      { key: "power", title: "Power System", content: [world.magicSystem, world.technology].filter(Boolean).join("\n\n") || "N/A" },
      { key: "society", title: "Society", content: [world.races, world.politics, world.factions].filter(Boolean).join("\n\n") || "N/A" },
      { key: "culture", title: "Culture", content: [world.cultures, world.religions, world.economy].filter(Boolean).join("\n\n") || "N/A" },
      { key: "history", title: "History", content: world.history ?? "N/A" },
      { key: "conflicts", title: "Conflicts", content: world.conflicts ?? "N/A" },
    ];
    const summary = world.overviewSummary
      ?? `${world.name} is a ${world.worldType ?? "custom"} world centered on ${(world.conflicts ?? "order vs. change").slice(0, 60)}.`;

    if (!world.overviewSummary) {
      await prisma.world.update({
        where: { id: worldId },
        data: { overviewSummary: summary },
      });
      this.queueRagUpsert("world", worldId);
    }

    return {
      worldId,
      summary,
      sections,
    };
  }

  async getVisualization(worldId: string): Promise<WorldVisualizationPayload> {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }

    const factionSeeds = parseListFromText(
      `${world.factions ?? ""}\n${world.politics ?? ""}\n${world.races ?? ""}`,
      ["Core State", "Regional Power", "Border Group"],
    ).slice(0, 12);
    const factionNodes = factionSeeds.map((label, index) => ({
      id: `faction-${index + 1}`,
      label,
      type: /(state|kingdom|empire|republic|federation)/i.test(label) ? "state" : "faction",
    }));
    const factionEdges = factionNodes.slice(1).map((node, index) => ({
      source: factionNodes[index]?.id ?? factionNodes[0].id,
      target: node.id,
      relation: "interaction",
    }));

    const powerTree = parseListFromText(
      world.magicSystem ?? world.technology ?? "",
      ["Tier 1", "Tier 2", "Tier 3", "Tier 4"],
    ).map((description, index) => ({
      level: `L${index + 1}`,
      description,
    }));

    const geoSeeds = parseListFromText(world.geography ?? "", ["Central Zone", "Borderland", "Unknown Zone"]).slice(0, 10);
    const geoNodes = geoSeeds.map((label, index) => ({ id: `geo-${index + 1}`, label }));
    const geoEdges = geoNodes.slice(1).map((node, index) => ({
      source: geoNodes[index]?.id ?? geoNodes[0].id,
      target: node.id,
      relation: "adjacent",
    }));

    const timelineSource = parseListFromText(world.history ?? "", ["Era Start", "Order Rise", "Conflict Breakout", "Current Age"]).slice(0, 12);
    const timeline = timelineSource.map((event, index) => {
      const yearMatch = event.match(/\d{3,4}|era\s*\d+/i);
      return { year: yearMatch?.[0] ?? `stage-${index + 1}`, event };
    });

    return {
      worldId,
      factionGraph: { nodes: factionNodes, edges: factionEdges },
      powerTree,
      geographyMap: { nodes: geoNodes, edges: geoEdges },
      timeline,
    };
  }

  async listLibrary(query: { category?: string; worldType?: string; keyword?: string; limit?: number }) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    return prisma.worldPropertyLibrary.findMany({
      where: {
        ...(query.category ? { category: query.category } : {}),
        ...(query.worldType ? { worldType: query.worldType } : {}),
        ...(query.keyword
          ? {
            OR: [
              { name: { contains: query.keyword } },
              { description: { contains: query.keyword } },
            ],
          }
          : {}),
      },
      orderBy: [{ usageCount: "desc" }, { updatedAt: "desc" }],
      take: limit,
    });
  }

  async createLibraryItem(input: {
    name: string;
    description?: string;
    category: string;
    worldType?: string;
    sourceWorldId?: string;
  }) {
    const created = await prisma.worldPropertyLibrary.create({
      data: input,
    });
    this.queueRagUpsert("world_library_item", created.id);
    return created;
  }

  async useLibraryItem(itemId: string, input: LibraryUseInput) {
    const item = await prisma.worldPropertyLibrary.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new Error("Library item not found.");
    }

    await prisma.worldPropertyLibrary.update({
      where: { id: itemId },
      data: { usageCount: { increment: 1 } },
    });
    this.queueRagUpsert("world_library_item", itemId);

    if (input.worldId && input.targetField) {
      const world = await prisma.world.findUnique({ where: { id: input.worldId } });
      if (!world) {
        throw new Error("Target world not found.");
      }
      const existing = world[input.targetField] ?? "";
      await prisma.world.update({
        where: { id: input.worldId },
        data: {
          [input.targetField]: `${existing}\n- ${item.name}: ${item.description ?? ""}`.trim(),
        },
      });
      await this.createSnapshot(input.worldId, `library-use-${item.name}`);
      this.queueRagUpsert("world", input.worldId);
      return { itemId, injected: true, worldId: input.worldId };
    }
    return { itemId, injected: false, worldId: null };
  }

  async listSnapshots(worldId: string) {
    return prisma.worldSnapshot.findMany({
      where: { worldId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createSnapshot(worldId: string, label?: string) {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }
    return prisma.worldSnapshot.create({
      data: {
        worldId,
        label: label ?? null,
        data: this.serializeWorldSnapshot(world),
      },
    });
  }

  async restoreSnapshot(worldId: string, snapshotId: string) {
    const snapshot = await prisma.worldSnapshot.findFirst({
      where: { id: snapshotId, worldId },
    });
    if (!snapshot) {
      throw new Error("Snapshot not found.");
    }

    const parsed = safeParseJSON<Partial<Record<string, unknown>>>(snapshot.data, {});
    const updated = await prisma.world.update({
      where: { id: worldId },
      data: {
        description: (parsed.description as string | null | undefined) ?? null,
        worldType: (parsed.worldType as string | null | undefined) ?? null,
        templateKey: (parsed.templateKey as string | null | undefined) ?? null,
        axioms: (parsed.axioms as string | null | undefined) ?? null,
        background: (parsed.background as string | null | undefined) ?? null,
        geography: (parsed.geography as string | null | undefined) ?? null,
        cultures: (parsed.cultures as string | null | undefined) ?? null,
        magicSystem: (parsed.magicSystem as string | null | undefined) ?? null,
        politics: (parsed.politics as string | null | undefined) ?? null,
        races: (parsed.races as string | null | undefined) ?? null,
        religions: (parsed.religions as string | null | undefined) ?? null,
        technology: (parsed.technology as string | null | undefined) ?? null,
        conflicts: (parsed.conflicts as string | null | undefined) ?? null,
        history: (parsed.history as string | null | undefined) ?? null,
        economy: (parsed.economy as string | null | undefined) ?? null,
        factions: (parsed.factions as string | null | undefined) ?? null,
        status: (parsed.status as string | null | undefined) ?? "draft",
        selectedDimensions: (parsed.selectedDimensions as string | null | undefined) ?? null,
        selectedElements: (parsed.selectedElements as string | null | undefined) ?? null,
        layerStates: (parsed.layerStates as string | null | undefined) ?? null,
        consistencyReport: (parsed.consistencyReport as string | null | undefined) ?? null,
        overviewSummary: (parsed.overviewSummary as string | null | undefined) ?? null,
        version: { increment: 1 },
      },
    });
    await this.createSnapshot(worldId, `restore-from-${snapshotId.slice(0, 8)}`);
    this.queueRagUpsert("world", worldId);
    return updated;
  }

  async diffSnapshots(worldId: string, fromId: string, toId: string) {
    const [fromSnapshot, toSnapshot] = await Promise.all([
      prisma.worldSnapshot.findFirst({ where: { id: fromId, worldId } }),
      prisma.worldSnapshot.findFirst({ where: { id: toId, worldId } }),
    ]);
    if (!fromSnapshot || !toSnapshot) {
      throw new Error("Snapshot not found.");
    }
    const before = safeParseJSON<Partial<Record<WorldTextField, string | null>>>(fromSnapshot.data, {});
    const after = safeParseJSON<Partial<Record<WorldTextField, string | null>>>(toSnapshot.data, {});
    return {
      worldId,
      fromId,
      toId,
      changes: buildFieldDiff(before, after),
    };
  }

  async exportWorld(worldId: string, format: "markdown" | "json") {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }

    if (format === "json") {
      return {
        format: "json" as const,
        fileName: `${world.name}.world.json`,
        content: JSON.stringify({
          name: world.name,
          description: world.description,
          worldType: world.worldType,
          templateKey: world.templateKey,
          axioms: safeParseJSON<string[]>(world.axioms, []),
          background: world.background,
          geography: world.geography,
          cultures: world.cultures,
          magicSystem: world.magicSystem,
          politics: world.politics,
          races: world.races,
          religions: world.religions,
          technology: world.technology,
          conflicts: world.conflicts,
          history: world.history,
          economy: world.economy,
          factions: world.factions,
        }, null, 2),
      };
    }

    const markdown = [
      `# ${world.name}`,
      "",
      `> Type: ${world.worldType ?? "N/A"} | Status: ${world.status} | Version: v${world.version}`,
      "",
      "## Summary",
      world.description ?? "N/A",
      "",
      "## Axioms",
      ...(safeParseJSON<string[]>(world.axioms, []).map((item) => `- ${item}`) || ["- N/A"]),
      "",
      "## Background",
      world.background ?? "N/A",
      "",
      "## Geography",
      world.geography ?? "N/A",
      "",
      "## Power/Tech",
      [world.magicSystem, world.technology].filter(Boolean).join("\n\n") || "N/A",
      "",
      "## Society",
      [world.races, world.politics, world.factions].filter(Boolean).join("\n\n") || "N/A",
      "",
      "## Culture",
      [world.cultures, world.religions, world.economy].filter(Boolean).join("\n\n") || "N/A",
      "",
      "## History",
      world.history ?? "N/A",
      "",
      "## Conflicts",
      world.conflicts ?? "N/A",
      "",
    ].join("\n");

    return {
      format: "markdown" as const,
      fileName: `${world.name}.world.md`,
      content: markdown,
    };
  }

  async importWorld(input: ImportWorldInput) {
    if (!input.content.trim()) {
      throw new Error("Import content is empty.");
    }

    let payload: Partial<CreateWorldInput> = {};
    if (input.format === "json") {
      payload = safeParseJSON<Partial<CreateWorldInput>>(input.content, {});
    } else if (input.format === "markdown") {
      payload = this.parseMarkdownToWorld(input.content);
    } else {
      const llm = await getLLM(input.provider ?? "deepseek", {
        model: input.model,
        temperature: 0.3,
      });
      const result = await llm.invoke([
        new SystemMessage(
          `Extract world JSON with fields:
name, description, worldType, background, geography, magicSystem,
politics, cultures, races, religions, technology, history, economy, conflicts.
Output JSON only.`,
        ),
        new HumanMessage(input.content),
      ]);
      payload = safeParseJSON<Partial<CreateWorldInput>>(extractJSONObject(String(result.content)), {});
    }

    const world = await prisma.world.create({
      data: {
        name: payload.name ?? input.name ?? `imported-world-${Date.now()}`,
        description: payload.description,
        worldType: payload.worldType ?? "custom",
        templateKey: payload.templateKey ?? "custom",
        axioms: payload.axioms ?? null,
        background: payload.background,
        geography: payload.geography,
        cultures: payload.cultures,
        magicSystem: payload.magicSystem,
        politics: payload.politics,
        races: payload.races,
        religions: payload.religions,
        technology: payload.technology,
        conflicts: payload.conflicts,
        history: payload.history,
        economy: payload.economy,
        factions: payload.factions,
        status: "draft",
        layerStates: JSON.stringify(normalizeLayerStates(undefined)),
      },
    });
    await this.createSnapshot(world.id, "import-initial");
    this.queueRagUpsert("world", world.id);
    return world;
  }

  async createWorldGenerateStream(input: WorldGenerateInput) {
    const llm = await getLLM(input.provider ?? "deepseek", {
      model: input.model,
      temperature: 0.7,
    });

    if (featureFlags.worldGraphEnabled) {
      const graph = createWorldBuildingGraph(llm as BaseChatModel);
      const graphState = await graph.invoke({
        seed: input.description,
        name: input.name,
        worldType: input.worldType,
      });

      if (graphState.error) {
        throw new Error(`World graph generation failed: ${graphState.error}`);
      }

      const graphOutput = {
        description: graphState.description ?? input.description,
        background: graphState.background ?? "",
        geography: graphState.geography ?? "",
        cultures: graphState.cultures ?? "",
        magicSystem: graphState.magicSystem ?? "",
        politics: graphState.politics ?? "",
        races: graphState.races ?? "",
        religions: graphState.religions ?? "",
        technology: graphState.technology ?? "",
        history: graphState.history ?? "",
        conflicts: graphState.conflicts ?? "",
        economy: "",
        factions: "",
      };
      const payloadText = JSON.stringify(graphOutput, null, 2);

      return {
        stream: this.createStaticChunkStream(payloadText),
        onDone: async (fullContent: string) => {
          await this.persistGeneratedWorld(input, fullContent);
        },
      };
    }

    const requirements: string[] = [];
    if (input.dimensions.geography) {
      requirements.push("geography：地形、气候、地标（至少 5 项）");
    }
    if (input.dimensions.culture) {
      requirements.push("cultures/politics/races/religions：社会结构、政治秩序、种族关系、宗教观念");
    }
    if (input.dimensions.magicSystem) {
      requirements.push("magicSystem：力量来源、等级体系、限制条件、代价机制");
    }
    if (input.dimensions.technology) {
      requirements.push("technology：技术水平、标志性技术、社会影响");
    }
    if (input.dimensions.history) {
      requirements.push("history：起源、重大事件、当前时代");
    }

    const stream = await llm.stream([
      new SystemMessage(
        `你是小说世界观设定助手。请生成世界观 JSON，只允许包含以下字段：
description, background, geography, cultures, magicSystem, politics, races,
religions, technology, history, conflicts, economy, factions。
所有字段值必须使用简体中文。仅输出 JSON 对象，不要输出解释文字。`,
      ),
      new HumanMessage(
        `世界名=${input.name}
世界类型=${input.worldType}
需求描述=${input.description}
复杂度=${input.complexity}
细化要求=${requirements.join("；")}`,
      ),
    ]);

    return {
      stream: stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string) => {
        await this.persistGeneratedWorld(input, fullContent);
      },
    };
  }

  async createRefineStream(worldId: string, input: RefineWorldInput) {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }

    const mode = input.mode ?? "replace";
    const llm = await getLLM(input.provider ?? "deepseek", {
      model: input.model,
      temperature: input.refinementLevel === "deep" ? 0.8 : 0.5,
    });
    const count = Math.min(Math.max(input.alternativesCount ?? 3, 2), 3);

    const stream = await llm.stream([
      new SystemMessage(
        mode === "alternatives"
          ? "Generate alternatives as JSON array [{title,content}]. Output JSON only."
          : "Refine the text while keeping setting consistency. Output plain text only.",
      ),
      new HumanMessage(
        mode === "alternatives"
          ? `world=${world.name}
field=${input.attribute}
depth=${input.refinementLevel}
count=${count}
current=${input.currentValue}`
          : `world=${world.name}
field=${input.attribute}
depth=${input.refinementLevel}
current=${input.currentValue}`,
      ),
    ]);

    return {
      stream: stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (fullContent: string) => {
        if (mode === "alternatives") {
          return;
        }
        await prisma.world.update({
          where: { id: worldId },
          data: {
            [input.attribute]: fullContent,
            version: { increment: 1 },
          },
        });
        await this.createSnapshot(worldId, `refine-${input.attribute}`);
        this.queueRagUpsert("world", worldId);
      },
    };
  }

  private async buildLayerGeneration(
    llm: Awaited<ReturnType<typeof getLLM>>,
    world: PrismaWorld,
    layerKey: WorldLayerKey,
  ): Promise<Partial<Record<WorldTextField, string>>> {
    const template = getTemplateByKey(world.templateKey);
    const layerFields = LAYER_FIELD_MAP[layerKey];
    let ragContext = "";
    try {
      ragContext = await ragServices.hybridRetrievalService.buildContextBlock(
        `世界分层生成 ${layerKey}\n${world.name}\n${world.description ?? ""}`,
        {
          worldId: world.id,
          ownerTypes: ["world", "world_library_item"],
          finalTopK: 6,
        },
      );
    } catch {
      ragContext = "";
    }
    const result = await llm.invoke([
      new SystemMessage(
        `你是世界观分层构建器。仅生成 layer=${layerKey} 对应字段内容。
必须输出 JSON 对象，且字段只能来自：${layerFields.join(", ")}。
所有字段值必须使用简体中文，不要输出英文句子，不要输出解释文字。`,
      ),
      new HumanMessage(
        `name=${world.name}
worldType=${world.worldType ?? template.worldType}
template=${template.name}
axioms=${world.axioms ?? "none"}
summary=${world.description ?? "none"}
existing=${JSON.stringify({
          background: world.background,
          geography: world.geography,
          magicSystem: world.magicSystem,
          technology: world.technology,
          races: world.races,
          politics: world.politics,
          cultures: world.cultures,
          religions: world.religions,
          history: world.history,
          conflicts: world.conflicts,
        })}
ragContext=${ragContext || "none"}
注意：输入可含英文，但输出字段值必须为简体中文。`,
      ),
    ]);

    const text = String(result.content);
    const fallbackField = layerFields[0];
    let generated: Partial<Record<WorldTextField, string>> = {};

    try {
      const parsed = safeParseJSON<Partial<Record<WorldTextField, unknown>>>(extractJSONObject(text), {});
      for (const field of layerFields) {
        const normalized = normalizeGeneratedLayerFieldValue(parsed[field]);
        if (normalized) {
          generated[field] = normalized;
        }
      }
      if (Object.keys(generated).length === 0) {
        const normalizedObject = normalizeGeneratedLayerFieldValue(parsed);
        if (normalizedObject) {
          generated[fallbackField] = normalizedObject;
        }
      }
    } catch {
      generated = { [fallbackField]: text.trim() };
    }

    if (Object.keys(generated).length === 0) {
      generated = { [fallbackField]: text.trim() };
    }

    return this.localizeLayerGenerationToChineseIfNeeded(llm, layerKey, layerFields, generated);
  }

  private async localizeLayerGenerationToChineseIfNeeded(
    llm: Awaited<ReturnType<typeof getLLM>>,
    layerKey: WorldLayerKey,
    layerFields: WorldTextField[],
    generated: Partial<Record<WorldTextField, string>>,
  ): Promise<Partial<Record<WorldTextField, string>>> {
    const sourcePayload = layerFields.reduce((acc, field) => {
      const value = generated[field]?.trim();
      if (value) {
        acc[field] = value;
      }
      return acc;
    }, {} as Record<string, string>);

    if (Object.keys(sourcePayload).length === 0) {
      return generated;
    }

    const hasEnglishHeavyField = Object.values(sourcePayload).some((value) => needsChineseTextTranslation(value));
    if (!hasEnglishHeavyField) {
      return generated;
    }

    try {
      const result = await llm.invoke([
        new SystemMessage(
          `你是文本本地化助手。将输入 JSON 对象中所有字段值改写为简体中文：
- 保持字段名不变，不新增字段，不删除字段；
- 保留原设定语义与专有名词含义；
- 输出仅为 JSON 对象。`,
        ),
        new HumanMessage(
          `layer=${layerKey}
fields=${layerFields.join(",")}
input=${JSON.stringify(sourcePayload)}`,
        ),
      ]);
      const parsed = safeParseJSON<Partial<Record<WorldTextField, unknown>>>(
        extractJSONObject(String(result.content)),
        {},
      );
      const localized = { ...generated };
      for (const field of layerFields) {
        const value = normalizeGeneratedLayerFieldValue(parsed[field]);
        if (value) {
          localized[field] = value;
        }
      }
      return localized;
    } catch {
      return generated;
    }
  }

  private async translateConceptCardToChinese(
    llm: Awaited<ReturnType<typeof getLLM>>,
    conceptCard: InspirationConceptCard,
  ): Promise<InspirationConceptCard> {
    if (!needsChineseConceptTranslation(conceptCard)) {
      return conceptCard;
    }

    try {
      const result = await llm.invoke([
        new SystemMessage(
          `将输入的概念卡翻译并润色为简体中文，保持 JSON 结构不变：
{
  "worldType":"...",
  "templateKey":"...",
  "coreImagery":["..."],
  "tone":"...",
  "keywords":["..."],
  "summary":"..."
}
仅输出 JSON。`,
        ),
        new HumanMessage(JSON.stringify(conceptCard)),
      ]);
      const parsed = safeParseJSON<Partial<InspirationConceptCard>>(
        extractJSONObject(String(result.content)),
        {},
      );
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

  private createStaticChunkStream(content: string): AsyncIterable<BaseMessageChunk> {
    return {
      async *[Symbol.asyncIterator]() {
        yield { content } as BaseMessageChunk;
      },
    };
  }

  private async persistGeneratedWorld(input: WorldGenerateInput, fullContent: string) {
    const parsed = safeParseJSON<Partial<Record<WorldTextField | "description", string>>>(
      extractJSONObject(fullContent),
      {},
    );
    const world = await prisma.world.create({
      data: {
        name: input.name,
        worldType: input.worldType,
        description: parsed.description ?? input.description,
        background: parsed.background ?? null,
        geography: parsed.geography ?? null,
        cultures: parsed.cultures ?? null,
        magicSystem: parsed.magicSystem ?? null,
        politics: parsed.politics ?? null,
        races: parsed.races ?? null,
        religions: parsed.religions ?? null,
        technology: parsed.technology ?? null,
        conflicts: parsed.conflicts ?? null,
        history: parsed.history ?? null,
        economy: parsed.economy ?? null,
        factions: parsed.factions ?? null,
        templateKey: "custom",
        status: "refining",
        selectedDimensions: JSON.stringify(input.dimensions),
        layerStates: JSON.stringify(normalizeLayerStates(undefined)),
      },
    });
    await this.createSnapshot(world.id, featureFlags.worldGraphEnabled ? "graph-generate" : "legacy-generate");
    this.queueRagUpsert("world", world.id);
  }

  private serializeWorldSnapshot(world: PrismaWorld): string {
    return JSON.stringify({
      id: world.id,
      name: world.name,
      description: world.description,
      worldType: world.worldType,
      templateKey: world.templateKey,
      axioms: world.axioms,
      background: world.background,
      geography: world.geography,
      cultures: world.cultures,
      magicSystem: world.magicSystem,
      politics: world.politics,
      races: world.races,
      religions: world.religions,
      technology: world.technology,
      conflicts: world.conflicts,
      history: world.history,
      economy: world.economy,
      factions: world.factions,
      status: world.status,
      version: world.version,
      selectedDimensions: world.selectedDimensions,
      selectedElements: world.selectedElements,
      layerStates: world.layerStates,
      consistencyReport: world.consistencyReport,
      overviewSummary: world.overviewSummary,
      updatedAt: world.updatedAt,
    });
  }

  private parseMarkdownToWorld(content: string): Partial<CreateWorldInput> {
    const getSection = (heading: string) => {
      const regex = new RegExp(`##\\s*${heading}[\\r\\n]+([\\s\\S]*?)(?=\\n##\\s|$)`, "i");
      return content.match(regex)?.[1]?.trim() || undefined;
    };
    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const axiomsBlock = getSection("Axioms");
    const axioms = axiomsBlock ? JSON.stringify(parseListFromText(axiomsBlock, [])) : undefined;
    return {
      name: title ?? `imported-world-${Date.now()}`,
      description: getSection("Summary"),
      axioms,
      background: getSection("Background"),
      geography: getSection("Geography"),
      magicSystem: getSection("Power/Tech"),
      politics: getSection("Society"),
      cultures: getSection("Culture"),
      history: getSection("History"),
      conflicts: getSection("Conflicts"),
    };
  }
}
