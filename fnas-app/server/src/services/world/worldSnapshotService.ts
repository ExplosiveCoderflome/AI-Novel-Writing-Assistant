import { prisma } from "../../db/prisma";
import {
  buildFieldDiff,
  safeParseJSON,
  type WorldTextField,
} from "./worldServiceShared";
import { serializeWorldSnapshot } from "./worldTransfer";
import { WORLD_STRUCTURE_SCHEMA_VERSION } from "./worldStructure";

interface WorldSnapshotCallbacks {
  queueWorldUpsert: (worldId: string) => void;
}

export async function listWorldSnapshots(worldId: string) {
  return prisma.worldSnapshot.findMany({
    where: { worldId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createWorldSnapshot(worldId: string, label?: string) {
  const world = await prisma.world.findUnique({ where: { id: worldId } });
  if (!world) {
    throw new Error("World not found.");
  }
  return prisma.worldSnapshot.create({
    data: {
      worldId,
      label: label ?? null,
      data: serializeWorldSnapshot(world),
    },
  });
}

export async function restoreWorldSnapshot(
  worldId: string,
  snapshotId: string,
  callbacks: WorldSnapshotCallbacks,
) {
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
      structureJson: (parsed.structureJson as string | null | undefined) ?? null,
      bindingSupportJson: (parsed.bindingSupportJson as string | null | undefined) ?? null,
      structureSchemaVersion: Number(parsed.structureSchemaVersion ?? WORLD_STRUCTURE_SCHEMA_VERSION),
      version: { increment: 1 },
    },
  });
  await createWorldSnapshot(worldId, `restore-from-${snapshotId.slice(0, 8)}`);
  callbacks.queueWorldUpsert(worldId);
  return updated;
}

export async function diffWorldSnapshots(worldId: string, fromId: string, toId: string) {
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
