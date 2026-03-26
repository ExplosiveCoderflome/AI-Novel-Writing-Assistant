import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessageChunk } from "@langchain/core/messages";
import { featureFlags } from "../../config/featureFlags";
import { prisma } from "../../db/prisma";
import { createWorldBuildingGraph } from "../../graphs/worldBuildingGraph";
import { getLLM } from "../../llm/factory";
import { streamStructuredPrompt, streamTextPrompt } from "../../prompting/core/promptRunner";
import {
  worldDraftGenerationPrompt,
  worldDraftRefineAlternativesPrompt,
  worldDraftRefinePrompt,
} from "../../prompting/prompts/world/worldDraft.prompts";
import {
  applyStructuredWorldToLegacyFields,
  buildWorldBindingSupport,
  buildWorldStructureSeedFromSource,
  WORLD_STRUCTURE_SCHEMA_VERSION,
} from "./worldStructure";
import { normalizeGeneratedWorldPayload } from "./worldPersistence";
import {
  type RefineMode,
  type RefineWorldInput,
  type WorldGenerateInput,
  normalizeLayerStates,
} from "./worldServiceShared";
import type { RagOwnerType } from "../rag/types";

interface WorldDraftCallbacks {
  createSnapshot: (worldId: string, label?: string) => Promise<unknown>;
  queueRagUpsert: (ownerType: RagOwnerType, ownerId: string) => void;
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
  generatedPayload: Record<string, unknown>,
  callbacks: WorldDraftCallbacks,
) {
  const normalized = normalizeGeneratedWorldPayload(generatedPayload, input.description);
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
  if (featureFlags.worldGraphEnabled) {
    const llm = await getLLM(input.provider ?? "deepseek", {
      model: input.model,
      temperature: 0.7,
    });
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
      overviewSummary: graphState.description ?? input.description,
    };
    const payloadText = JSON.stringify(graphOutput, null, 2);

    return {
      stream: createStaticChunkStream(payloadText),
      onDone: async (_fullContent: string) => {
        await persistGeneratedWorld(input, graphOutput, callbacks);
      },
    };
  }

  const streamed = await streamStructuredPrompt({
    asset: worldDraftGenerationPrompt,
    promptInput: {
      name: input.name,
      description: input.description,
      worldType: input.worldType,
      complexity: input.complexity,
      dimensions: input.dimensions,
    },
    options: {
      provider: input.provider ?? "deepseek",
      model: input.model,
      temperature: 0.7,
    },
  });

  return {
    stream: streamed.stream as AsyncIterable<BaseMessageChunk>,
    onDone: async (_fullContent: string) => {
      const completed = await streamed.complete;
      await persistGeneratedWorld(input, completed.output as Record<string, unknown>, callbacks);
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

  const mode: RefineMode = input.mode ?? "replace";
  const count = Math.min(Math.max(input.alternativesCount ?? 3, 2), 3);
  const options = {
    provider: input.provider ?? "deepseek",
    model: input.model,
    temperature: input.refinementLevel === "deep" ? 0.8 : 0.5,
  };

  if (mode === "alternatives") {
    const streamed = await streamStructuredPrompt({
      asset: worldDraftRefineAlternativesPrompt,
      promptInput: {
        worldName: world.name,
        attribute: input.attribute,
        refinementLevel: input.refinementLevel,
        currentValue: input.currentValue,
        count,
      },
      options,
    });

    return {
      stream: streamed.stream as AsyncIterable<BaseMessageChunk>,
      onDone: async (_fullContent: string) => {
        await streamed.complete;
      },
    };
  }

  const streamed = await streamTextPrompt({
    asset: worldDraftRefinePrompt,
    promptInput: {
      worldName: world.name,
      attribute: input.attribute,
      refinementLevel: input.refinementLevel,
      currentValue: input.currentValue,
    },
    options,
  });

  return {
    stream: streamed.stream as AsyncIterable<BaseMessageChunk>,
    onDone: async (fullContent: string) => {
      const completed = await streamed.complete;
      const refinedContent = completed.output.trim() || fullContent;
      await prisma.world.update({
        where: { id: worldId },
        data: {
          [input.attribute]: refinedContent,
          version: { increment: 1 },
        },
      });
      await callbacks.createSnapshot(worldId, `refine-${input.attribute}`);
      callbacks.queueRagUpsert("world", worldId);
    },
  };
}
