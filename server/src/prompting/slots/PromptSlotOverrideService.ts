import { prisma } from "../../db/prisma";
import { findRegisteredPromptAssetById } from "../registry";
import {
  createCustomSlotEntry,
  createOfficialDefaultEntry,
  getSlotDefaultValue,
  getSlotOverrideMode,
  resolvePromptOverlays,
  validateSlotValue,
} from "./slotResolution";
import type {
  PromptSlotDef,
  PromptSlotOverrideMap,
  PromptSlotScope,
  ResolvedSlotOverlays,
} from "./slotTypes";

export type { PromptSlotScope };

export interface PromptSlotOverrideView {
  id: string;
  scope: PromptSlotScope;
  novelId?: string | null;
  promptId: string;
  baseVersion: string;
  slots: PromptSlotOverrideMap;
  createdAt: string;
  updatedAt: string;
}

export interface PromptSlotOverrideFilter {
  promptId: string;
  novelId?: string;
}

export interface PromptSlotOverrideSaveInput {
  scope: PromptSlotScope;
  novelId?: string | null;
  promptId: string;
  slotUpdates: Record<string, unknown>;
}

type PromptSlotOverrideRecord = {
  id: string;
  scope: string;
  novelId: string | null;
  promptId: string;
  baseVersion: string;
  slots: string;
  createdAt: Date;
  updatedAt: Date;
};

export function parsePromptSlotOverrideMap(raw: string): PromptSlotOverrideMap {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as PromptSlotOverrideMap;
    }
  } catch {
    // fall through
  }
  return {};
}

function toView(record: PromptSlotOverrideRecord): PromptSlotOverrideView {
  return {
    id: record.id,
    scope: record.scope as PromptSlotScope,
    novelId: record.novelId,
    promptId: record.promptId,
    baseVersion: record.baseVersion,
    slots: parsePromptSlotOverrideMap(record.slots),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function slotValueEqualsDefault(def: PromptSlotDef, value: string | boolean): boolean {
  const defaultValue = getSlotDefaultValue(def);
  if (typeof defaultValue === "boolean") {
    return value === defaultValue;
  }
  return String(value).trim() === defaultValue.trim();
}

function hasCustomGlobalOverride(slots: PromptSlotOverrideMap, key: string): boolean {
  const entry = slots[key];
  return Boolean(entry && getSlotOverrideMode(entry) === "custom");
}

function isMissingTableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("PromptSlotOverride")
    && (error.message.includes("does not exist")
      || error.message.includes("no such table")
      || error.message.includes("Unknown table"))
  );
}

export class PromptSlotOverrideService {
  async list(filter: PromptSlotOverrideFilter): Promise<PromptSlotOverrideView[]> {
    const { promptId, novelId } = filter;
    try {
      const rows = await prisma.promptSlotOverride.findMany({
        where: {
          promptId,
          OR: novelId
            ? [
                { scope: "global", novelId: null },
                { scope: "novel", novelId },
              ]
            : [{ scope: "global", novelId: null }],
        },
        orderBy: [{ scope: "asc" }],
      });
      return rows.map(toView);
    } catch (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
  }

  async getOverrideMaps(input: {
    promptId: string;
    novelId?: string;
  }): Promise<{ global: PromptSlotOverrideMap; novel: PromptSlotOverrideMap }> {
    try {
      const rows = await prisma.promptSlotOverride.findMany({
        where: {
          promptId: input.promptId,
          OR: input.novelId
            ? [
                { scope: "global", novelId: null },
                { scope: "novel", novelId: input.novelId },
              ]
            : [{ scope: "global", novelId: null }],
        },
      });
      const global = rows.find((r) => r.scope === "global");
      const novel = input.novelId ? rows.find((r) => r.scope === "novel" && r.novelId === input.novelId) : undefined;
      return {
        global: global ? parsePromptSlotOverrideMap(global.slots) : {},
        novel: novel ? parsePromptSlotOverrideMap(novel.slots) : {},
      };
    } catch (error) {
      if (isMissingTableError(error)) return { global: {}, novel: {} };
      throw error;
    }
  }

  async save(input: PromptSlotOverrideSaveInput): Promise<PromptSlotOverrideView> {
    const { scope, promptId, slotUpdates } = input;
    const novelId = scope === "novel" ? (input.novelId ?? null) : null;

    if (scope !== "global" && scope !== "novel") {
      throw new Error("scope 只能是 global 或 novel。");
    }
    if (scope === "novel" && !novelId) {
      throw new Error("scope=novel 时必须提供 novelId。");
    }

    // Resolve asset to get slot definitions
    const assets = findRegisteredPromptAssetById(promptId);
    if (!assets) {
      throw new Error(`提示词未注册：${promptId}`);
    }
    const slotDefs: PromptSlotDef[] = assets.slots ?? [];
    if (slotDefs.length === 0) {
      throw new Error(`提示词 ${promptId} 没有可编辑的槽位。`);
    }

    if (scope === "novel" && novelId) {
      const novel = await prisma.novel.findUnique({ where: { id: novelId }, select: { id: true } });
      if (!novel) throw new Error(`小说不存在：${novelId}`);
    }

    // Load existing override to merge (only update changed slots)
    let existingSlots: PromptSlotOverrideMap = {};
    let globalSlots: PromptSlotOverrideMap = {};
    try {
      const existing = await prisma.promptSlotOverride.findFirst({
        where: { scope, novelId, promptId },
      });
      if (existing) existingSlots = parsePromptSlotOverrideMap(existing.slots);
      if (scope === "novel") {
        const global = await prisma.promptSlotOverride.findFirst({
          where: { scope: "global", novelId: null, promptId },
        });
        if (global) globalSlots = parsePromptSlotOverrideMap(global.slots);
      }
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
    }

    const newSlots: PromptSlotOverrideMap = { ...existingSlots };

    for (const [key, value] of Object.entries(slotUpdates)) {
      const def = slotDefs.find((d) => d.key === key);
      if (!def) throw new Error(`槽位不存在：${key}`);

      const validationError = validateSlotValue(def, value);
      if (validationError) throw new Error(validationError);

      const typedValue = def.kind === "toggle" ? Boolean(value) : String(value);

      if (slotValueEqualsDefault(def, typedValue)) {
        if (scope === "novel" && hasCustomGlobalOverride(globalSlots, key)) {
          newSlots[key] = createOfficialDefaultEntry(def);
        } else {
          delete newSlots[key];
        }
      } else {
        newSlots[key] = createCustomSlotEntry(def, typedValue);
      }
    }

    const slotsJson = JSON.stringify(newSlots);
    const version = assets.version;

    try {
      const existing = await prisma.promptSlotOverride.findFirst({
        where: { scope, novelId, promptId },
      });

      const row = existing
        ? await prisma.promptSlotOverride.update({
            where: { id: existing.id },
            data: { slots: slotsJson, baseVersion: version },
          })
        : await prisma.promptSlotOverride.create({
            data: {
              scope,
              novelId,
              promptId,
              baseVersion: version,
              slots: slotsJson,
            },
          });
      return toView(row);
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new Error("数据库表尚未就绪，请先运行数据库迁移。");
      }
      throw error;
    }
  }

  async deleteSlots(input: {
    scope: PromptSlotScope;
    novelId?: string | null;
    promptId: string;
    slotKeys?: string[];
  }): Promise<void> {
    const novelId = input.scope === "novel" ? (input.novelId ?? null) : null;
    try {
      const existing = await prisma.promptSlotOverride.findFirst({
        where: { scope: input.scope, novelId, promptId: input.promptId },
      });
      if (!existing) return;

      if (!input.slotKeys || input.slotKeys.length === 0) {
        await prisma.promptSlotOverride.delete({ where: { id: existing.id } });
        return;
      }

      const slots = parsePromptSlotOverrideMap(existing.slots);
      for (const key of input.slotKeys) {
        delete slots[key];
      }
      await prisma.promptSlotOverride.update({
        where: { id: existing.id },
        data: { slots: JSON.stringify(slots) },
      });
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
    }
  }

  async applyOfficialSlots(input: {
    scope: PromptSlotScope;
    novelId?: string | null;
    promptId: string;
    slotKeys: string[];
  }): Promise<void> {
    const { promptId, scope, slotKeys } = input;
    const novelId = scope === "novel" ? (input.novelId ?? null) : null;
    if (scope !== "global" && scope !== "novel") {
      throw new Error("scope 只能是 global 或 novel。");
    }
    if (scope === "novel" && !novelId) {
      throw new Error("scope=novel 时必须提供 novelId。");
    }

    const asset = findRegisteredPromptAssetById(promptId);
    if (!asset) {
      throw new Error(`提示词未注册：${promptId}`);
    }
    const slotDefs: PromptSlotDef[] = asset.slots ?? [];
    const slotDefMap = new Map(slotDefs.map((def) => [def.key, def]));

    if (scope === "novel" && novelId) {
      const novel = await prisma.novel.findUnique({ where: { id: novelId }, select: { id: true } });
      if (!novel) throw new Error(`小说不存在：${novelId}`);
    }

    try {
      const existing = await prisma.promptSlotOverride.findFirst({
        where: { scope, novelId, promptId },
      });
      const global = scope === "novel"
        ? await prisma.promptSlotOverride.findFirst({
            where: { scope: "global", novelId: null, promptId },
          })
        : null;

      const newSlots = existing ? parsePromptSlotOverrideMap(existing.slots) : {};
      const globalSlots = global ? parsePromptSlotOverrideMap(global.slots) : {};

      for (const key of slotKeys) {
        const def = slotDefMap.get(key);
        if (!def) {
          delete newSlots[key];
          continue;
        }
        if (scope === "novel" && hasCustomGlobalOverride(globalSlots, key)) {
          newSlots[key] = createOfficialDefaultEntry(def);
        } else {
          delete newSlots[key];
        }
      }

      if (existing) {
        await prisma.promptSlotOverride.update({
          where: { id: existing.id },
          data: { slots: JSON.stringify(newSlots), baseVersion: asset.version },
        });
        return;
      }

      if (Object.keys(newSlots).length === 0) {
        return;
      }

      await prisma.promptSlotOverride.create({
        data: {
          scope,
          novelId,
          promptId,
          baseVersion: asset.version,
          slots: JSON.stringify(newSlots),
        },
      });
    } catch (error) {
      if (isMissingTableError(error)) {
        throw new Error("数据库表尚未就绪，请先运行数据库迁移。");
      }
      throw error;
    }
  }

  async resolveForRuntime(input: {
    promptId: string;
    novelId?: string;
  }): Promise<ResolvedSlotOverlays> {
    const assets = findRegisteredPromptAssetById(input.promptId);
    if (!assets) {
      return {
        inlineSlots: emptySlots(),
        appendBlocks: [],
        drift: [],
      };
    }
    const slotDefs: PromptSlotDef[] = assets.slots ?? [];
    if (slotDefs.length === 0) {
      return {
        inlineSlots: emptySlots(),
        appendBlocks: [],
        drift: [],
      };
    }

    const maps = await this.getOverrideMaps(input);
    return resolvePromptOverlays({
      slotDefs,
      globalOverrides: maps.global,
      novelOverrides: maps.novel,
    });
  }
}

function emptySlots() {
  return {
    text: () => "",
    choiceCopy: () => "",
    enabled: () => false,
    token: () => "",
    append: () => "",
  };
}

export const promptSlotOverrideService = new PromptSlotOverrideService();
