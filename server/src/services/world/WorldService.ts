import type { Prisma } from "@prisma/client";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  WorldConsistencyReport,
  WorldLayerKey,
  WorldStructuredData,
  WorldStructureSectionKey,
  WorldVisualizationPayload,
} from "@ai-novel/shared/types/world";
import { prisma } from "../../db/prisma";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { worldAxiomSuggestionPrompt } from "../../prompting/prompts/world/world.prompts";
import { getTemplateByKey, LAYER_FIELD_MAP, WORLD_LAYER_ORDER, WORLD_TEMPLATES } from "./worldTemplates";
import { buildConsistencySummary, localizeConsistencyIssue } from "./worldConsistency";
import {
  applyStructuredWorldToLegacyFields,
  buildStructuredRulesFromAxiomTexts,
  buildWorldBindingSupport,
  buildWorldStructureFromLegacySource,
  buildWorldStructureOverview,
  buildWorldStructureSeedFromSource,
  normalizeWorldBindingSupport,
  normalizeWorldStructuredData,
  parseWorldStructurePayload,
  WORLD_STRUCTURE_SCHEMA_VERSION,
} from "./worldStructure";
import { buildWorldVisualizationPayload } from "./worldVisualization";
import { applyGeneratedWorldFields, buildWorldBlueprintPromptBlock } from "./worldGenerationBlueprint";
import { createWorldDraftGenerateStream, createWorldDraftRefineStream } from "./worldDraftGeneration";
import { analyzeWorldInspiration } from "./worldInspirationService";
import {
  answerWorldDeepeningQuestions,
  checkWorldConsistency,
  createWorldDeepeningQuestions,
  updateWorldConsistencyIssueStatus,
} from "./worldImprovementService";
import { buildWorldLayerGeneration } from "./worldLayerGeneration";
import {
  createWorldSnapshot,
  diffWorldSnapshots,
  listWorldSnapshots,
  restoreWorldSnapshot,
} from "./worldSnapshotService";
import {
  backfillWorldStructure,
  generateWorldStructure,
  getWorldOverview,
  getWorldStructure,
  getWorldVisualization,
  updateWorldStructure,
} from "./worldStructureWorkspace";
import {
  type CreateWorldInput,
  type DeepeningAnswerInput,
  type ImportWorldInput,
  type InspirationInput,
  type LayerGenerateInput,
  type LayerUpdateInput,
  type LibraryUseInput,
  type RefineWorldInput,
  type StructureBackfillInput,
  type StructureGenerateInput,
  type StructureUpdateInput,
  type WorldGenerateInput,
  type WorldTextField,
  extractJSONArray,
  markDownstreamStale,
  normalizeAxiomList,
  normalizeLayerStates,
  nowISO,
  safeParseJSON,
  uniqueKnowledgeDocumentIds,
} from "./worldServiceShared";
import { exportWorldData, importWorldData } from "./worldTransfer";
import { ragServices } from "../rag";
import type { RagOwnerType } from "../rag/types";

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

  async analyzeInspiration(input: InspirationInput, onProgress?: (message: string) => void) {
    return analyzeWorldInspiration(input, onProgress);
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

    const seededStructure = input.structure
      ? normalizeWorldStructuredData(input.structure)
      : buildWorldStructureSeedFromSource({
        id: "",
        name: input.name,
        worldType: input.worldType ?? null,
        description: input.description ?? null,
        overviewSummary: null,
        axioms: input.axioms ?? null,
        background: input.background ?? null,
        geography: input.geography ?? null,
        cultures: input.cultures ?? null,
        magicSystem: input.magicSystem ?? null,
        politics: input.politics ?? null,
        races: input.races ?? null,
        religions: input.religions ?? null,
        technology: input.technology ?? null,
        conflicts: input.conflicts ?? null,
        history: input.history ?? null,
        economy: input.economy ?? null,
        factions: input.factions ?? null,
        selectedElements: input.selectedElements ?? null,
        structureJson: null,
        bindingSupportJson: null,
        structureSchemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
      });
    const bindingSupport = input.bindingSupport
      ? normalizeWorldBindingSupport(input.bindingSupport)
      : buildWorldBindingSupport(seededStructure);
    const structuredFields = applyStructuredWorldToLegacyFields(seededStructure, input, bindingSupport);

    const world = await prisma.world.create({
      data: {
        name: input.name,
        description: (structuredFields.description as string | null | undefined) ?? input.description,
        worldType: input.worldType,
        templateKey: input.templateKey ?? "custom",
        axioms: input.axioms ?? (structuredFields.axioms as string | null | undefined) ?? null,
        background: input.background,
        geography: input.geography ?? (structuredFields.geography as string | null | undefined) ?? null,
        cultures: input.cultures,
        magicSystem: input.magicSystem,
        politics: input.politics ?? (structuredFields.politics as string | null | undefined) ?? null,
        races: input.races,
        religions: input.religions,
        technology: input.technology,
        conflicts: input.conflicts ?? (structuredFields.conflicts as string | null | undefined) ?? null,
        history: input.history,
        economy: input.economy,
        factions: input.factions ?? (structuredFields.factions as string | null | undefined) ?? null,
        selectedDimensions: input.selectedDimensions,
        selectedElements: input.selectedElements,
        status: "draft",
        layerStates: JSON.stringify(normalizeLayerStates(undefined)),
        overviewSummary: (structuredFields.overviewSummary as string | null | undefined) ?? null,
        structureJson: structuredFields.structureJson as string,
        bindingSupportJson: structuredFields.bindingSupportJson as string,
        structureSchemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
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
    const { structure: _structure, bindingSupport: _bindingSupport, ...legacyInput } = input;

    const states = normalizeLayerStates(world.layerStates);
    for (const layer of WORLD_LAYER_ORDER) {
      const watched = LAYER_FIELD_MAP[layer];
      if (watched.some((field) => typeof legacyInput[field] === "string")) {
        states[layer] = { ...states[layer], status: "generated", updatedAt: nowISO() };
        markDownstreamStale(states, layer);
      }
    }

    let structuredUpdate: Record<string, unknown> = {};
    if (input.structure || input.bindingSupport) {
      const { structure: currentStructure, bindingSupport: currentBindingSupport } = parseWorldStructurePayload(
        world.structureJson,
        world.bindingSupportJson,
      );
      const nextStructure = input.structure
        ? normalizeWorldStructuredData(input.structure, currentStructure)
        : currentStructure;
      const nextBindingSupport = input.bindingSupport
        ? normalizeWorldBindingSupport(input.bindingSupport, currentBindingSupport)
        : buildWorldBindingSupport(nextStructure);
      structuredUpdate = applyStructuredWorldToLegacyFields(nextStructure, world, nextBindingSupport);
    }

    const updated = await prisma.world.update({
      where: { id },
      data: {
        ...legacyInput,
        ...structuredUpdate,
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

    const template = getTemplateByKey(world.templateKey);
    const blueprintPromptBlock = buildWorldBlueprintPromptBlock(world);
    const result = await runStructuredPrompt({
      asset: worldAxiomSuggestionPrompt,
      promptInput: {
        worldName: world.name,
        worldType: world.worldType ?? "未知",
        templateName: template.name,
        templateDescription: template.description,
        description: world.description ?? "无",
        blueprintPromptBlock,
      },
      options: {
        provider: options.provider ?? "deepseek",
        model: options.model,
        temperature: 0.5,
      },
    });
    const axioms = normalizeAxiomList(result.output);
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
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }

    const parsed = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);
    const nextStructure = {
      ...parsed.structure,
      rules: {
        ...parsed.structure.rules,
        axioms: buildStructuredRulesFromAxiomTexts(axioms),
      },
      metadata: {
        ...parsed.structure.metadata,
        lastGeneratedAt: nowISO(),
      },
    };
    const nextBindingSupport = buildWorldBindingSupport(nextStructure);
    const structuredFields = applyStructuredWorldToLegacyFields(nextStructure, world, nextBindingSupport);

    const updated = await prisma.world.update({
      where: { id: worldId },
      data: {
        ...structuredFields,
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
    const generated = await buildWorldLayerGeneration({
      provider: input.provider ?? "deepseek",
      model: input.model,
      temperature: input.temperature ?? 0.7,
    }, world, layerKey);

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

    const generatedByLayer = WORLD_LAYER_ORDER.reduce((acc, layerKey) => {
      acc[layerKey] = {};
      return acc;
    }, {} as Record<WorldLayerKey, Partial<Record<WorldTextField, string>>>);
    const mergedGenerated: Partial<Record<WorldTextField, string>> = {};

    let workingWorld = world;
    for (const layerKey of WORLD_LAYER_ORDER) {
      const generatedLayer = await buildWorldLayerGeneration({
        provider: input.provider ?? "deepseek",
        model: input.model,
        temperature: input.temperature ?? 0.7,
      }, workingWorld, layerKey);
      generatedByLayer[layerKey] = generatedLayer;
      Object.assign(mergedGenerated, generatedLayer);
      workingWorld = applyGeneratedWorldFields(workingWorld, generatedLayer);
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
    return createWorldDeepeningQuestions(worldId, options);
  }

  async answerDeepeningQuestions(worldId: string, answers: DeepeningAnswerInput[]) {
    return answerWorldDeepeningQuestions(worldId, answers, {
      createSnapshot: (id, label) => this.createSnapshot(id, label),
      queueWorldUpsert: (id) => this.queueRagUpsert("world", id),
    });
  }

  async checkConsistency(
    worldId: string,
    options: { provider?: LLMProvider; model?: string } = {},
  ): Promise<WorldConsistencyReport> {
    return checkWorldConsistency(worldId, options, {
      createSnapshot: (id, label) => this.createSnapshot(id, label),
      queueWorldUpsert: (id) => this.queueRagUpsert("world", id),
    });
  }

  async updateConsistencyIssueStatus(
    worldId: string,
    issueId: string,
    status: "open" | "resolved" | "ignored",
  ) {
    return updateWorldConsistencyIssueStatus(worldId, issueId, status);
  }

  async getOverview(worldId: string) {
    return getWorldOverview(worldId, {
      queueWorldUpsert: (id) => this.queueRagUpsert("world", id),
    });
  }

  async getStructure(worldId: string) {
    return getWorldStructure(worldId);
  }

  async updateStructure(worldId: string, input: StructureUpdateInput) {
    return updateWorldStructure(worldId, input, {
      createSnapshot: (id, label) => this.createSnapshot(id, label),
      queueWorldUpsert: (id) => this.queueRagUpsert("world", id),
    });
  }

  async backfillStructure(worldId: string, options: StructureBackfillInput) {
    return backfillWorldStructure(worldId, options, {
      createSnapshot: (id, label) => this.createSnapshot(id, label),
      queueWorldUpsert: (id) => this.queueRagUpsert("world", id),
    });
  }

  async generateStructure(worldId: string, input: StructureGenerateInput) {
    return generateWorldStructure(worldId, input);
  }

  async getVisualization(worldId: string): Promise<WorldVisualizationPayload> {
    return getWorldVisualization(worldId);
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

    if (input.worldId && input.targetCollection) {
      const world = await prisma.world.findUnique({ where: { id: input.worldId } });
      if (!world) {
        throw new Error("Target world not found.");
      }
      const parsed = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);
      const baseStructure = parsed.hasStructuredData ? parsed.structure : buildWorldStructureSeedFromSource(world);
      const nextStructure = normalizeWorldStructuredData({
        ...baseStructure,
        forces: input.targetCollection === "forces"
          ? [
            ...baseStructure.forces,
            {
              id: `force-library-${item.id}`,
              name: item.name,
              type: item.category,
              factionId: null,
              summary: item.description ?? "",
              baseOfPower: "",
              currentObjective: "",
              pressure: "",
              leader: null,
              narrativeRole: "素材库注入",
            },
          ]
          : baseStructure.forces,
        locations: input.targetCollection === "locations"
          ? [
            ...baseStructure.locations,
            {
              id: `location-library-${item.id}`,
              name: item.name,
              terrain: item.category,
              summary: item.description ?? "",
              narrativeFunction: "素材库注入",
              risk: "",
              entryConstraint: "",
              exitCost: "",
              controllingForceIds: [],
            },
          ]
          : baseStructure.locations,
      }, baseStructure);
      const nextBindingSupport = buildWorldBindingSupport(nextStructure);
      const structuredFields = applyStructuredWorldToLegacyFields(nextStructure, world, nextBindingSupport);
      await prisma.world.update({
        where: { id: input.worldId },
        data: structuredFields,
      });
      await this.createSnapshot(input.worldId, `library-use-${item.name}`);
      this.queueRagUpsert("world", input.worldId);
      return {
        itemId,
        injected: true,
        worldId: input.worldId,
        targetCollection: input.targetCollection,
      };
    }

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
      return { itemId, injected: true, worldId: input.worldId, targetCollection: null };
    }
    return { itemId, injected: false, worldId: null, targetCollection: null };
  }

  async listSnapshots(worldId: string) {
    return listWorldSnapshots(worldId);
  }

  async createSnapshot(worldId: string, label?: string) {
    return createWorldSnapshot(worldId, label);
  }

  async restoreSnapshot(worldId: string, snapshotId: string) {
    return restoreWorldSnapshot(worldId, snapshotId, {
      queueWorldUpsert: (id) => this.queueRagUpsert("world", id),
    });
  }

  async diffSnapshots(worldId: string, fromId: string, toId: string) {
    return diffWorldSnapshots(worldId, fromId, toId);
  }

  async exportWorld(worldId: string, format: "markdown" | "json") {
    return exportWorldData(worldId, format);
  }

  async importWorld(input: ImportWorldInput) {
    return importWorldData(input, {
      createSnapshot: (worldId, label) => this.createSnapshot(worldId, label),
      queueRagUpsert: (ownerType, ownerId) => this.queueRagUpsert(ownerType, ownerId),
    });
  }

  async createWorldGenerateStream(input: WorldGenerateInput) {
    return createWorldDraftGenerateStream(input, {
      createSnapshot: (worldId, label) => this.createSnapshot(worldId, label),
      queueRagUpsert: (ownerType, ownerId) => this.queueRagUpsert(ownerType, ownerId),
    });
  }

  async createRefineStream(worldId: string, input: RefineWorldInput) {
    return createWorldDraftRefineStream(worldId, input, {
      createSnapshot: (id, label) => this.createSnapshot(id, label),
      queueRagUpsert: (ownerType, ownerId) => this.queueRagUpsert(ownerType, ownerId),
    });
  }
}
