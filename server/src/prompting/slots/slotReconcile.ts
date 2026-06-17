import { prisma } from "../../db/prisma";
import { findRegisteredPromptAssetById } from "../registry";
import { hashSlotDefault } from "./slotResolution";
import { promptSlotOverrideService } from "./PromptSlotOverrideService";
import type { PromptSlotDef, PromptSlotOverrideMap, PromptSlotScope } from "./slotTypes";

export type SlotReconcileState = "unchanged" | "drifted" | "new" | "orphaned";

export interface SlotReconcileItem {
  key: string;
  label: string;
  kind: PromptSlotDef["kind"];
  state: SlotReconcileState;
  defaultCurrent: string | boolean;
  defaultCurrentHash: string;
  overrideValue?: string | boolean;
  overrideBaseHash?: string;
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
    const currentDefault: string | boolean = def.kind === "toggle" ? def.default : def.default;
    const currentDefaultHash = hashSlotDefault(currentDefault);
    const override = overrideSlots[def.key];

    let state: SlotReconcileState;
    if (!override) {
      state = "new";
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
      changelog: def.changelog,
    });
  }

  for (const [key, override] of Object.entries(overrideSlots)) {
    if (!handledKeys.has(key)) {
      items.push({
        key,
        label: key,
        kind: "replace",
        state: "orphaned",
        defaultCurrent: "",
        defaultCurrentHash: "",
        overrideValue: override.value,
        overrideBaseHash: override.baseHash,
      });
    }
  }

  const driftedCount = items.filter((i) => i.state === "drifted").length;
  const newCount = items.filter((i) => i.state === "new").length;
  const orphanedCount = items.filter((i) => i.state === "orphaned").length;

  return {
    promptId,
    scope,
    novelId: novelId ?? null,
    promptVersion,
    overrideBaseVersion: row?.baseVersion,
    items,
    hasUpdates: driftedCount > 0 || orphanedCount > 0,
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
  await promptSlotOverrideService.deleteSlots({
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
    if (!def) continue;
    const currentHash = hashSlotDefault(def.kind === "toggle" ? def.default : def.default);
    newSlots[key] = { ...existing, baseHash: currentHash };
  }

  try {
    await prisma.promptSlotOverride.update({
      where: { id: row.id },
      data: { slots: JSON.stringify(newSlots), baseVersion: asset.version },
    });
  } catch {
    // Table not yet created, ignore
  }
}
