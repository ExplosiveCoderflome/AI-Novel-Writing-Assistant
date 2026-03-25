import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessageChunk } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { featureFlags } from "../../config/featureFlags";
import { prisma } from "../../db/prisma";
import { createWorldBuildingGraph } from "../../graphs/worldBuildingGraph";
import { getLLM } from "../../llm/factory";
import {
  applyStructuredWorldToLegacyFields,
  buildWorldBindingSupport,
  buildWorldStructureSeedFromSource,
  WORLD_STRUCTURE_SCHEMA_VERSION,
} from "./worldStructure";
import { normalizeGeneratedWorldPayload } from "./worldPersistence";
import { WORLD_LAYER_ORDER } from "./worldTemplates";
import type { RagOwnerType } from "../rag/types";

type WorldTextField =
  | "description"
  | "background"
  | "geography"
  | "cultures"
  | "magicSystem"
  | "politics"
  | "races"
  | "religions"
  | "technology"
  | "conflicts"
  | "history"
  | "economy"
  | "factions";

type RefineMode = "replace" | "alternatives";
type LayerStatus = "pending" | "generated" | "confirmed" | "stale";

type LayerStateMap = Record<
  (typeof WORLD_LAYER_ORDER)[number],
  {
    key: (typeof WORLD_LAYER_ORDER)[number];
    status: LayerStatus;
    updatedAt: string;
  }
>;

export interface WorldGenerateInput {
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

export interface RefineWorldInput {
  attribute: WorldTextField;
  currentValue: string;
  refinementLevel: "light" | "deep";
  mode?: RefineMode;
  alternativesCount?: number;
  provider?: LLMProvider;
  model?: string;
}

interface WorldDraftCallbacks {
  createSnapshot: (worldId: string, label?: string) => Promise<unknown>;
  queueRagUpsert: (ownerType: RagOwnerType, ownerId: string) => void;
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
      status: existing?.status === "generated"
        || existing?.status === "confirmed"
        || existing?.status === "stale"
        || existing?.status === "pending"
        ? existing.status
        : "pending",
      updatedAt: existing?.updatedAt ?? fallback[key].updatedAt,
    };
  }
  return fallback;
}

function createStaticChunkStream(content: string): AsyncIterable<BaseMessageChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      yield { content } as BaseMessageChunk;
    },
  };
}

async function persistGeneratedWorld(
  input: WorldGenerateInput,
  fullContent: string,
  callbacks: WorldDraftCallbacks,
) {
  const parsed = safeParseJSON<Record<string, unknown>>(
    extractJSONObject(fullContent),
    {},
  );
  const normalized = normalizeGeneratedWorldPayload(parsed, input.description);
  const seededStructure = buildWorldStructureSeedFromSource({
    id: "",
    name: input.name,
    worldType: input.worldType,
    description: normalized.description,
    overviewSummary: normalized.overviewSummary,
    axioms: null,
    background: normalized.background,
    geography: normalized.geography,
    cultures: normalized.cultures,
    magicSystem: normalized.magicSystem,
    politics: normalized.politics,
    races: normalized.races,
    religions: normalized.religions,
    technology: normalized.technology,
    conflicts: normalized.conflicts,
    history: normalized.history,
    economy: normalized.economy,
    factions: normalized.factions,
    selectedElements: null,
    structureJson: null,
    bindingSupportJson: null,
    structureSchemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
  });
  const bindingSupport = buildWorldBindingSupport(seededStructure);
  const structuredFields = applyStructuredWorldToLegacyFields(seededStructure, {
    description: normalized.description,
    overviewSummary: normalized.overviewSummary,
    axioms: null,
    geography: normalized.geography,
    politics: normalized.politics,
    conflicts: normalized.conflicts,
    factions: normalized.factions,
  }, bindingSupport);
  const world = await prisma.world.create({
    data: {
      name: input.name,
      worldType: input.worldType,
      description: (structuredFields.description as string | null | undefined) ?? normalized.description,
      background: normalized.background,
      geography: (structuredFields.geography as string | null | undefined) ?? normalized.geography,
      cultures: normalized.cultures,
      magicSystem: normalized.magicSystem,
      politics: (structuredFields.politics as string | null | undefined) ?? normalized.politics,
      races: normalized.races,
      religions: normalized.religions,
      technology: normalized.technology,
      conflicts: (structuredFields.conflicts as string | null | undefined) ?? normalized.conflicts,
      history: normalized.history,
      economy: normalized.economy,
      factions: (structuredFields.factions as string | null | undefined) ?? normalized.factions,
      templateKey: "custom",
      status: "refining",
      selectedDimensions: normalized.selectedDimensions ?? JSON.stringify(input.dimensions),
      layerStates: normalized.layerStates ?? JSON.stringify(normalizeLayerStates(undefined)),
      consistencyReport: normalized.consistencyReport,
      overviewSummary: (structuredFields.overviewSummary as string | null | undefined) ?? normalized.overviewSummary,
      structureJson: structuredFields.structureJson as string,
      bindingSupportJson: structuredFields.bindingSupportJson as string,
      structureSchemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
    },
  });
  await callbacks.createSnapshot(world.id, featureFlags.worldGraphEnabled ? "graph-generate" : "legacy-generate");
  callbacks.queueRagUpsert("world", world.id);
}

export async function createWorldDraftGenerateStream(
  input: WorldGenerateInput,
  callbacks: WorldDraftCallbacks,
) {
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
      stream: createStaticChunkStream(payloadText),
      onDone: async (fullContent: string) => {
        await persistGeneratedWorld(input, fullContent, callbacks);
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
      await persistGeneratedWorld(input, fullContent, callbacks);
    },
  };
}

export async function createWorldDraftRefineStream(
  worldId: string,
  input: RefineWorldInput,
  callbacks: WorldDraftCallbacks,
) {
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
      await callbacks.createSnapshot(worldId, `refine-${input.attribute}`);
      callbacks.queueRagUpsert("world", worldId);
    },
  };
}
