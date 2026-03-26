import type { WorldVisualizationPayload } from "@ai-novel/shared/types/world";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import {
  applyStructuredWorldToLegacyFields,
  buildWorldBindingSupport,
  buildWorldStructureFromLegacySource,
  buildWorldStructureOverview,
  buildWorldStructureSeedFromSource,
  normalizeWorldBindingSupport,
  normalizeWorldStructuredData,
  parseWorldStructurePayload,
  WORLD_STRUCTURE_SCHEMA_VERSION,
} from "./worldStructure";
import {
  worldStructureBackfillPrompt,
  worldStructureSectionPrompt,
} from "../../prompting/prompts/world/world.prompts";
import { buildWorldVisualizationPayload } from "./worldVisualization";
import {
  type StructureBackfillInput,
  type StructureGenerateInput,
  type StructureUpdateInput,
  buildWorldStructurePromptSource,
  mergeWorldStructureSection,
  nowISO,
} from "./worldServiceShared";

interface WorldStructureCallbacks {
  createSnapshot: (worldId: string, label?: string) => Promise<unknown>;
  queueWorldUpsert: (worldId: string) => void;
}

async function getRequiredWorld(worldId: string) {
  const world = await prisma.world.findUnique({ where: { id: worldId } });
  if (!world) {
    throw new Error("World not found.");
  }
  return world;
}

export async function getWorldOverview(
  worldId: string,
  callbacks: Pick<WorldStructureCallbacks, "queueWorldUpsert">,
) {
  const world = await getRequiredWorld(worldId);
  const structuredPayload = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);
  if (structuredPayload.hasStructuredData) {
    const structuredOverview = buildWorldStructureOverview(
      structuredPayload.structure,
      structuredPayload.bindingSupport,
    );
    return {
      worldId,
      summary: structuredOverview.summary,
      sections: structuredOverview.sections,
    };
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
    callbacks.queueWorldUpsert(worldId);
  }

  return {
    worldId,
    summary,
    sections,
  };
}

export async function getWorldStructure(worldId: string) {
  const world = await getRequiredWorld(worldId);
  const parsed = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);
  if (parsed.hasStructuredData) {
    return {
      worldId,
      hasStructuredData: true,
      structure: parsed.structure,
      bindingSupport: parsed.bindingSupport,
    };
  }

  const seededStructure = buildWorldStructureSeedFromSource(world);
  return {
    worldId,
    hasStructuredData: false,
    structure: seededStructure,
    bindingSupport: buildWorldBindingSupport(seededStructure),
  };
}

export async function updateWorldStructure(
  worldId: string,
  input: StructureUpdateInput,
  callbacks: WorldStructureCallbacks,
) {
  const world = await getRequiredWorld(worldId);

  const nextStructure = normalizeWorldStructuredData(input.structure);
  nextStructure.metadata = {
    ...nextStructure.metadata,
    schemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
  };
  const nextBindingSupport = input.bindingSupport
    ? normalizeWorldBindingSupport(input.bindingSupport)
    : buildWorldBindingSupport(nextStructure);
  const structuredFields = applyStructuredWorldToLegacyFields(nextStructure, world, nextBindingSupport);

  const updated = await prisma.world.update({
    where: { id: worldId },
    data: {
      ...structuredFields,
      version: { increment: 1 },
    },
  });
  await callbacks.createSnapshot(worldId, "structure-saved");
  callbacks.queueWorldUpsert(worldId);
  return {
    world: updated,
    structure: nextStructure,
    bindingSupport: nextBindingSupport,
  };
}

export async function backfillWorldStructure(
  worldId: string,
  options: StructureBackfillInput,
  callbacks: WorldStructureCallbacks,
) {
  const world = await getRequiredWorld(worldId);

  const result = await runStructuredPrompt({
    asset: worldStructureBackfillPrompt,
    promptInput: {
      promptSource: buildWorldStructurePromptSource(world),
    },
    options: {
      provider: options.provider,
      model: options.model,
      temperature: 0.2,
    },
  });
  const rawStructure = result.output;
  const nextStructure = normalizeWorldStructuredData(rawStructure, buildWorldStructureFromLegacySource(world));
  nextStructure.metadata = {
    ...nextStructure.metadata,
    schemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
    seededFrom: "ai-backfill",
    lastBackfilledAt: nowISO(),
  };
  const nextBindingSupport = buildWorldBindingSupport(nextStructure);
  const structuredFields = applyStructuredWorldToLegacyFields(nextStructure, world, nextBindingSupport);

  const updated = await prisma.world.update({
    where: { id: worldId },
    data: {
      ...structuredFields,
      version: { increment: 1 },
    },
  });
  await callbacks.createSnapshot(worldId, "structure-backfill");
  callbacks.queueWorldUpsert(worldId);

  return {
    world: updated,
    structure: nextStructure,
    bindingSupport: nextBindingSupport,
    source: "ai-backfill" as const,
  };
}

export async function generateWorldStructure(
  worldId: string,
  input: StructureGenerateInput,
) {
  const world = await getRequiredWorld(worldId);

  const stored = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);
  const currentStructure = input.structure
    ? normalizeWorldStructuredData(input.structure, stored.structure)
    : (stored.hasStructuredData ? stored.structure : buildWorldStructureSeedFromSource(world));
  const currentBindingSupport = input.bindingSupport
    ? normalizeWorldBindingSupport(input.bindingSupport, stored.bindingSupport)
    : buildWorldBindingSupport(currentStructure);

  const result = await runStructuredPrompt({
    asset: worldStructureSectionPrompt,
    promptInput: {
      section: input.section,
      promptSource: buildWorldStructurePromptSource(world),
      currentStructure,
      currentBindingSupport,
    },
    options: {
      provider: input.provider ?? "deepseek",
      model: input.model,
      temperature: 0.4,
    },
  });
  const rawSection = result.output;

  const mergedStructure = mergeWorldStructureSection(currentStructure, input.section, rawSection);
  mergedStructure.metadata = {
    ...mergedStructure.metadata,
    schemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
    lastGeneratedAt: nowISO(),
    lastSectionGenerated: input.section,
  };
  const nextBindingSupport = buildWorldBindingSupport(mergedStructure);

  return {
    worldId,
    section: input.section,
    structure: mergedStructure,
    bindingSupport: nextBindingSupport,
  };
}

export async function getWorldVisualization(worldId: string): Promise<WorldVisualizationPayload> {
  const world = await getRequiredWorld(worldId);
  return buildWorldVisualizationPayload(world);
}
