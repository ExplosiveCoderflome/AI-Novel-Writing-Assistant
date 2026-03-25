import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { WorldVisualizationPayload } from "@ai-novel/shared/types/world";
import { prisma } from "../../db/prisma";
import { getLLM } from "../../llm/factory";
import { invokeStructuredLlm } from "../../llm/structuredInvoke";
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
import { worldStructuredDataSchema } from "./worldSchemas";
import { buildWorldVisualizationPayload } from "./worldVisualization";
import {
  type StructureBackfillInput,
  type StructureGenerateInput,
  type StructureUpdateInput,
  buildStructureSectionInstructions,
  buildWorldStructurePromptSource,
  extractJSONArray,
  extractJSONObject,
  mergeWorldStructureSection,
  nowISO,
  safeParseJSON,
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

  const systemPrompt = `你是世界结构化提取器。请根据输入文本提取世界结构，并且只能输出 JSON 对象。
JSON 结构必须为：
{
  "profile": {"summary":"...","identity":"...","tone":"...","themes":["..."],"coreConflict":"..."},
  "rules": {"summary":"...","axioms":[{"id":"rule-1","name":"...","summary":"...","cost":"...","boundary":"...","enforcement":"..."}],"taboo":["..."],"sharedConsequences":["..."]},
  "factions": [{"id":"faction-1","name":"...","position":"...","doctrine":"...","goals":["..."],"methods":["..."],"representativeForceIds":["force-1"]}],
  "forces": [{"id":"force-1","name":"...","type":"...","factionId":"faction-1","summary":"...","baseOfPower":"...","currentObjective":"...","pressure":"...","leader":"...","narrativeRole":"..."}],
  "locations": [{"id":"location-1","name":"...","terrain":"...","summary":"...","narrativeFunction":"...","risk":"...","entryConstraint":"...","exitCost":"...","controllingForceIds":["force-1"]}],
  "relations": {
    "forceRelations": [{"id":"force-relation-1","sourceForceId":"force-1","targetForceId":"force-2","relation":"...","tension":"...","detail":"..."}],
    "locationControls": [{"id":"location-control-1","forceId":"force-1","locationId":"location-1","relation":"...","detail":"..."}]
  }
}
要求：
1. 只能提取文本里明确存在或强可推断的信息。
2. 所有值必须使用简体中文。
3. faction 是抽象阵营、立场或路线；force 是具体组织、圈层、公司、部门或网络。
4. 像“社会压力机制”“行业运作规则”“人际法则”这类世界默认机制必须提取到 rules，不要写进 factions / forces。
5. 不要输出解释，不要输出 Markdown，不要增加额外字段。`;

  const rawStructure = await invokeStructuredLlm({
    label: `world-backfill:${worldId}`,
    provider: options.provider,
    model: options.model,
    temperature: 0.2,
    taskType: "planner",
    systemPrompt,
    userPrompt: buildWorldStructurePromptSource(world),
    schema: worldStructuredDataSchema,
    maxRepairAttempts: 1,
  });
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

  const llm = await getLLM(input.provider ?? "deepseek", {
    model: input.model,
    temperature: 0.4,
    taskType: "planner",
  });
  const result = await llm.invoke([
    new SystemMessage(
      `你是世界结构化补全器。请只补全 section=${input.section} 对应的 JSON，不能输出解释。
${buildStructureSectionInstructions(input.section)}
要求：
1. 不要破坏已有 ID；如果沿用现有实体，请复用当前结构中的 id。
2. 不要编造与现有文本明显冲突的信息。
3. 阵营与势力区块必须同时考虑 factions 和 forces。
4. 如果 section=factions，禁止把社会压力机制、行业规则、人际法则这类世界默认机制写进 factions / forces，它们应属于 rules。
5. 地点区块必须填写 narrativeFunction、risk、entryConstraint、exitCost。
6. 关系区块只允许 forceRelations 和 locationControls。`,
    ),
    new HumanMessage(
      [
        buildWorldStructurePromptSource(world),
        "当前结构：",
        JSON.stringify(currentStructure, null, 2),
        "当前绑定建议：",
        JSON.stringify(currentBindingSupport, null, 2),
      ].join("\n\n"),
    ),
  ]);

  const rawSection = input.section === "locations"
    ? safeParseJSON<unknown>(extractJSONArray(String(result.content)), null)
    : safeParseJSON<unknown>(extractJSONObject(String(result.content)), null);
  if (rawSection == null) {
    throw new Error("AI failed to produce valid structure section JSON.");
  }

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
