import type {
  CharacterResourceEvidence,
  CharacterResourceLedgerItem,
  CharacterResourceRiskSignal,
  CharacterResourceSourceRef,
} from "@ai-novel/shared/types/characterResource";

export type CharacterResourceRowLike = {
  id: string;
  novelId: string;
  resourceKey: string;
  name: string;
  summary: string;
  resourceType: string;
  narrativeFunction: string;
  ownerType: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerCharacterId: string | null;
  holderCharacterId: string | null;
  holderCharacterName: string | null;
  status: string;
  readerKnows: boolean;
  holderKnows: boolean;
  knownByCharacterIdsJson: string | null;
  introducedChapterId: string | null;
  introducedChapterOrder: number | null;
  lastTouchedChapterId: string | null;
  lastTouchedChapterOrder: number | null;
  expectedUseStartChapterOrder: number | null;
  expectedUseEndChapterOrder: number | null;
  constraintsJson: string | null;
  riskSignalsJson: string | null;
  sourceRefsJson: string | null;
  evidenceJson: string | null;
  confidence: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export function compactText(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function parseJsonArray<T>(value: string | null | undefined, fallback: T[] = []): T[] {
  if (!value?.trim()) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : fallback;
  } catch {
    return fallback;
  }
}

export function parseStringArray(value: string | null | undefined): string[] {
  return parseJsonArray<unknown>(value, [])
    .map((item) => compactText(String(item ?? "")))
    .filter(Boolean);
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? []);
}

export function normalizeResourceKey(input: {
  novelId?: string;
  name: string;
  holderCharacterId?: string | null;
  ownerName?: string | null;
}): string {
  const base = compactText(input.name)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  const holder = compactText(input.holderCharacterId) || compactText(input.ownerName);
  return [base || "resource", holder ? holder.slice(0, 32) : ""].filter(Boolean).join(":");
}

function coerceResourceType(value: string): CharacterResourceLedgerItem["resourceType"] {
  const allowed = new Set(["physical_item", "clue", "credential", "ability_resource", "relationship_token", "consumable", "hidden_card", "world_resource"]);
  return (allowed.has(value) ? value : "physical_item") as CharacterResourceLedgerItem["resourceType"];
}

function coerceNarrativeFunction(value: string): CharacterResourceLedgerItem["narrativeFunction"] {
  const allowed = new Set(["tool", "clue", "weapon", "proof", "key", "cost", "promise", "hidden_card", "constraint"]);
  return (allowed.has(value) ? value : "tool") as CharacterResourceLedgerItem["narrativeFunction"];
}

function coerceOwnerType(value: string): CharacterResourceLedgerItem["ownerType"] {
  const allowed = new Set(["character", "organization", "location", "world", "unknown"]);
  return (allowed.has(value) ? value : "unknown") as CharacterResourceLedgerItem["ownerType"];
}

function coerceStatus(value: string): CharacterResourceLedgerItem["status"] {
  const allowed = new Set(["available", "hidden", "borrowed", "transferred", "lost", "consumed", "damaged", "destroyed", "stale"]);
  return (allowed.has(value) ? value : "available") as CharacterResourceLedgerItem["status"];
}

export function mapCharacterResourceRow(row: CharacterResourceRowLike): CharacterResourceLedgerItem {
  return {
    id: row.id,
    novelId: row.novelId,
    resourceKey: row.resourceKey,
    name: row.name,
    summary: row.summary,
    resourceType: coerceResourceType(row.resourceType),
    narrativeFunction: coerceNarrativeFunction(row.narrativeFunction),
    ownerType: coerceOwnerType(row.ownerType),
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    ownerCharacterId: row.ownerCharacterId,
    holderCharacterId: row.holderCharacterId,
    holderCharacterName: row.holderCharacterName,
    status: coerceStatus(row.status),
    readerKnows: row.readerKnows,
    holderKnows: row.holderKnows,
    knownByCharacterIds: parseStringArray(row.knownByCharacterIdsJson),
    introducedChapterId: row.introducedChapterId,
    introducedChapterOrder: row.introducedChapterOrder,
    lastTouchedChapterId: row.lastTouchedChapterId,
    lastTouchedChapterOrder: row.lastTouchedChapterOrder,
    expectedUseStartChapterOrder: row.expectedUseStartChapterOrder,
    expectedUseEndChapterOrder: row.expectedUseEndChapterOrder,
    constraints: parseStringArray(row.constraintsJson),
    riskSignals: parseJsonArray<CharacterResourceRiskSignal>(row.riskSignalsJson),
    sourceRefs: parseJsonArray<CharacterResourceSourceRef>(row.sourceRefsJson),
    evidence: parseJsonArray<CharacterResourceEvidence>(row.evidenceJson),
    confidence: row.confidence,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
