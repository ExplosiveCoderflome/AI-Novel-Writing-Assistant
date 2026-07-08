import { prisma } from "../../db/prisma";
import { findRegisteredPromptAssetById } from "../registry";
import {
  getSlotDefaultHash,
  getSlotDefaultValue,
  getSlotOverrideMode,
} from "./slotResolution";
import { promptSlotOverrideService } from "./PromptSlotOverrideService";
import type {
  PromptSlotDef,
  PromptSlotOverrideMap,
  PromptSlotOverrideMode,
  PromptSlotScope,
} from "./slotTypes";

export type SlotReconcileState = "unchanged" | "drifted" | "new" | "orphaned";
const KEPT_ORPHANED_SLOT_HASH = "orphaned:kept";

export interface SlotReconcileItem {
  key: string;
  label: string;
  kind: PromptSlotDef["kind"];
  state: SlotReconcileState;
  defaultCurrent: string | boolean;
  defaultCurrentHash: string;
  overrideValue?: string | boolean;
  overrideBaseHash?: string;
  overrideMode?: PromptSlotOverrideMode;
  changelog?: string;
}

export interface SlotReconcileResult {
  promptId: string;
  scope: PromptSlotScope;
  novelId?: string | null;
  promptVersion: string;
  overrideBaseVersion?: string;
  items: SlotReconcileItem[];
  hasUpdates: boolean;
  hasDrift: boolean;
  driftedCount: number;
  newCount: number;
  orphanedCount: number;
}

export async function reconcileSlots(input: {
  promptId: string;
  scope: PromptSlotScope;
  novelId?: string | null;
}): Promise<SlotReconcileResult> {
  const { promptId, scope, novelId } = input;
  const asset = findRegisteredPromptAssetById(promptId);
  const slotDefs: PromptSlotDef[] = asset?.slots ?? [];
  const promptVersion = asset?.version ?? "unknown";

  const views = await promptSlotOverrideService.list({
    promptId,
    novelId: novelId ?? undefined,
  });
  const row = views.find(
    (v) => v.scope === scope && (scope === "global" || v.novelId === novelId),
  );
  const overrideSlots: PromptSlotOverrideMap = row?.slots ?? {};

  const items: SlotReconcileItem[] = [];
  const handledKeys = new Set<string>();

  for (const def of slotDefs) {
    handledKeys.add(def.key);
    const currentDefault = getSlotDefaultValue(def);
    const currentDefaultHash = getSlotDefaultHash(def);
    const override = overrideSlots[def.key];

    let state: SlotReconcileState;
    if (!override) {
      state = "unchanged";
    } else if (override.baseHash !== currentDefaultHash) {
      state = "drifted";
    } else {
      state = "unchanged";
    }

    items.push({
      key: def.key,
      label: def.label,
      kind: def.kind,
      state,
      defaultCurrent: currentDefault,
      defaultCurrentHash: currentDefaultHash,
      overrideValue: override?.value,
      overrideBaseHash: override?.baseHash,
      overrideMode: override ? getSlotOverrideMode(override) : undefined,
      changelog: def.changelog,
    });
  }

  for (const [key, override] of Object.entries(overrideSlots)) {
    if (!handledKeys.has(key)) {
      if (override.baseHash === KEPT_ORPHANED_SLOT_HASH) {
        continue;
      }
      items.push({
        key,
        label: key,
        kind: "replace",
        state: "orphaned",
        defaultCurrent: "",
        defaultCurrentHash: "",
        overrideValue: override.value,
        overrideBaseHash: override.baseHash,
        overrideMode: getSlotOverrideMode(override),
      });
    }
  }

  const driftedCount = items.filter((i) => i.state === "drifted").length;
  const newCount = items.filter((i) => i.state === "new").length;
  const orphanedCount = items.filter((i) => i.state === "orphaned").length;

  const hasUpdates = driftedCount > 0 || newCount > 0 || orphanedCount > 0;

  return {
    promptId,
    scope,
    novelId: novelId ?? null,
    promptVersion,
    overrideBaseVersion: row?.baseVersion,
    items,
    hasUpdates,
    hasDrift: hasUpdates,
    driftedCount,
    newCount,
    orphanedCount,
  };
}

export async function adoptSlots(input: {
  promptId: string;
  scope: PromptSlotScope;
  novelId?: string | null;
  slotKeys: string[];
}): Promise<void> {
  await applyOfficialSlots(input);
}

export async function applyOfficialSlots(input: {
  promptId: string;
  scope: PromptSlotScope;
  novelId?: string | null;
  slotKeys: string[];
}): Promise<void> {
  await promptSlotOverrideService.applyOfficialSlots({
    scope: input.scope,
    novelId: input.novelId,
    promptId: input.promptId,
    slotKeys: input.slotKeys,
  });
}

export async function keepMineSlots(input: {
  promptId: string;
  scope: PromptSlotScope;
  novelId?: string | null;
  slotKeys: string[];
}): Promise<void> {
  const { promptId, scope, novelId } = input;
  const asset = findRegisteredPromptAssetById(promptId);
  if (!asset) return;

  const slotDefs: PromptSlotDef[] = asset.slots ?? [];
  const views = await promptSlotOverrideService.list({
    promptId,
    novelId: novelId ?? undefined,
  });
  const row = views.find(
    (v) => v.scope === scope && (scope === "global" || v.novelId === novelId),
  );
  if (!row) return;

  const newSlots: PromptSlotOverrideMap = { ...row.slots };
  for (const key of input.slotKeys) {
    const existing = newSlots[key];
    if (!existing) continue;
    const def = slotDefs.find((d) => d.key === key);
    if (!def) {
      newSlots[key] = { ...existing, baseHash: KEPT_ORPHANED_SLOT_HASH };
      continue;
    }
    const currentHash = getSlotDefaultHash(def);
    newSlots[key] = { ...existing, baseHash: currentHash };
  }

  try {
    const existingRecord = await prisma.promptSlotOverride.findFirst({
      where: {
        scope,
        novelId: scope === "novel" ? (novelId ?? null) : null,
        promptId,
      },
    });
    if (!existingRecord) return;
    await prisma.promptSlotOverride.update({
      where: { id: existingRecord.id },
      data: { slots: JSON.stringify(newSlots), baseVersion: asset.version },
    });
  } catch {
    // Table not yet created, ignore
  }
}
