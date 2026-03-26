import type { World as PrismaWorld } from "@prisma/client";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { worldImportExtractionPrompt } from "../../prompting/prompts/world/world.prompts";
import {
  applyStructuredWorldToLegacyFields,
  buildWorldBindingSupport,
  buildWorldStructureOverview,
  buildWorldStructureSeedFromSource,
  normalizeWorldBindingSupport,
  normalizeWorldStructuredData,
  parseWorldStructurePayload,
  WORLD_STRUCTURE_SCHEMA_VERSION,
} from "./worldStructure";
import { WORLD_LAYER_ORDER } from "./worldTemplates";
import type { RagOwnerType } from "../rag/types";

type LayerStatus = "pending" | "generated" | "confirmed" | "stale";

type LayerStateMap = Record<
  (typeof WORLD_LAYER_ORDER)[number],
  {
    key: (typeof WORLD_LAYER_ORDER)[number];
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
  selectedElements?: string;
}

export interface ImportWorldInput {
  format: "json" | "markdown" | "text";
  content: string;
  name?: string;
  provider?: LLMProvider;
  model?: string;
}

interface WorldTransferCallbacks {
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

function parseListFromText(content: string, fallback: string[]): string[] {
  const parsed = content
    .split(/[\n,，;；]/)
    .map((item) => item.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

function parseMarkdownToWorld(content: string): Partial<CreateWorldInput> {
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

export function serializeWorldSnapshot(world: PrismaWorld): string {
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
    structureJson: world.structureJson,
    bindingSupportJson: world.bindingSupportJson,
    structureSchemaVersion: world.structureSchemaVersion,
    updatedAt: world.updatedAt,
  });
}

export async function exportWorldData(worldId: string, format: "markdown" | "json") {
  const world = await prisma.world.findUnique({ where: { id: worldId } });
  if (!world) {
    throw new Error("World not found.");
  }
  const structuredPayload = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);

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
        structure: structuredPayload.hasStructuredData ? structuredPayload.structure : null,
        bindingSupport: structuredPayload.hasStructuredData ? structuredPayload.bindingSupport : null,
        structureSchemaVersion: world.structureSchemaVersion ?? WORLD_STRUCTURE_SCHEMA_VERSION,
      }, null, 2),
    };
  }

  if (structuredPayload.hasStructuredData) {
    const overview = buildWorldStructureOverview(
      structuredPayload.structure,
      structuredPayload.bindingSupport,
    );
    const markdown = [
      `# ${world.name}`,
      "",
      `> Type: ${world.worldType ?? "N/A"} | Status: ${world.status} | Version: v${world.version}`,
      "",
      "## Summary",
      overview.summary,
      "",
      ...overview.sections.flatMap((section) => [ `## ${section.title}`, section.content || "N/A", "" ]),
      "## Binding Support",
      [
        ...structuredPayload.bindingSupport.recommendedEntryPoints.map((item) => `- 进入点：${item}`),
        ...structuredPayload.bindingSupport.highPressureForces.map((item) => `- 高压势力：${item}`),
        ...structuredPayload.bindingSupport.compatibleConflicts.map((item) => `- 兼容冲突：${item}`),
        ...structuredPayload.bindingSupport.forbiddenCombinations.map((item) => `- 避免组合：${item}`),
      ].join("\n") || "N/A",
      "",
    ].join("\n");

    return {
      format: "markdown" as const,
      fileName: `${world.name}.world.md`,
      content: markdown,
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

export async function importWorldData(
  input: ImportWorldInput,
  callbacks: WorldTransferCallbacks,
) {
  if (!input.content.trim()) {
    throw new Error("Import content is empty.");
  }

  let payload: Partial<CreateWorldInput> = {};
  let importedStructure: ReturnType<typeof normalizeWorldStructuredData> | null = null;
  let importedBindingSupport: ReturnType<typeof normalizeWorldBindingSupport> | null = null;
  if (input.format === "json") {
    const parsed = safeParseJSON<Record<string, unknown>>(input.content, {});
    payload = parsed as Partial<CreateWorldInput>;
    if (parsed.structure) {
      importedStructure = normalizeWorldStructuredData(parsed.structure);
    }
    if (parsed.bindingSupport) {
      importedBindingSupport = normalizeWorldBindingSupport(parsed.bindingSupport);
    }
  } else if (input.format === "markdown") {
    payload = parseMarkdownToWorld(input.content);
  } else {
    const result = await runStructuredPrompt({
      asset: worldImportExtractionPrompt,
      promptInput: {
        content: input.content,
      },
      options: {
        provider: input.provider ?? "deepseek",
        model: input.model,
        temperature: 0.3,
      },
    });
    payload = result.output as Partial<CreateWorldInput>;
  }

  const baseSource = {
    id: "",
    name: payload.name ?? input.name ?? `imported-world-${Date.now()}`,
    worldType: payload.worldType ?? "custom",
    description: payload.description ?? null,
    overviewSummary: null,
    axioms: payload.axioms ?? null,
    background: payload.background ?? null,
    geography: payload.geography ?? null,
    cultures: payload.cultures ?? null,
    magicSystem: payload.magicSystem ?? null,
    politics: payload.politics ?? null,
    races: payload.races ?? null,
    religions: payload.religions ?? null,
    technology: payload.technology ?? null,
    conflicts: payload.conflicts ?? null,
    history: payload.history ?? null,
    economy: payload.economy ?? null,
    factions: payload.factions ?? null,
    selectedElements: payload.selectedElements ?? null,
    structureJson: null,
    bindingSupportJson: null,
    structureSchemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
  };
  const nextStructure = importedStructure ?? buildWorldStructureSeedFromSource(baseSource);
  const nextBindingSupport = importedBindingSupport ?? buildWorldBindingSupport(nextStructure);
  const structuredFields = applyStructuredWorldToLegacyFields(nextStructure, baseSource, nextBindingSupport);

  const world = await prisma.world.create({
    data: {
      name: baseSource.name,
      description: (structuredFields.description as string | null | undefined) ?? payload.description ?? null,
      worldType: payload.worldType ?? "custom",
      templateKey: payload.templateKey ?? "custom",
      axioms: payload.axioms ?? (structuredFields.axioms as string | null | undefined) ?? null,
      background: payload.background,
      geography: payload.geography ?? (structuredFields.geography as string | null | undefined) ?? null,
      cultures: payload.cultures,
      magicSystem: payload.magicSystem,
      politics: payload.politics ?? (structuredFields.politics as string | null | undefined) ?? null,
      races: payload.races,
      religions: payload.religions,
      technology: payload.technology,
      conflicts: payload.conflicts ?? (structuredFields.conflicts as string | null | undefined) ?? null,
      history: payload.history,
      economy: payload.economy,
      factions: payload.factions ?? (structuredFields.factions as string | null | undefined) ?? null,
      status: "draft",
      layerStates: JSON.stringify(normalizeLayerStates(undefined)),
      overviewSummary: (structuredFields.overviewSummary as string | null | undefined) ?? null,
      structureJson: structuredFields.structureJson as string,
      bindingSupportJson: structuredFields.bindingSupportJson as string,
      structureSchemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
    },
  });
  await callbacks.createSnapshot(world.id, "import-initial");
  callbacks.queueRagUpsert("world", world.id);
  return world;
}
