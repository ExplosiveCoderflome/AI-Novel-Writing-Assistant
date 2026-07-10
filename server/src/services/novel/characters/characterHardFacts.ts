import type { CharacterHardFacts } from "@ai-novel/shared/types/novel";
import type {
  ChapterCharacterPendingReviewField,
  GenerationContextPackage,
} from "@ai-novel/shared/types/chapterRuntime";

export interface PendingCharacterHardFactReview {
  currentState?: string | null;
  currentGoal?: string | null;
  pendingReviewFields: ChapterCharacterPendingReviewField[];
}

export type PendingCharacterHardFactReviewMap = Map<string, PendingCharacterHardFactReview>;

export function normalizeCharacterProhibitions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const items: string[] = [];
  for (const item of value) {
    const text = typeof item === "string" ? item.replace(/\s+/g, " ").trim() : "";
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    items.push(text);
  }
  return items.slice(0, 8);
}

export function parseCharacterProhibitionsJson(value: string | null | undefined): string[] {
  const text = value?.trim();
  if (!text) {
    return [];
  }
  try {
    return normalizeCharacterProhibitions(JSON.parse(text));
  } catch {
    return [];
  }
}

export function serializeCharacterProhibitions(value: unknown): string {
  return JSON.stringify(normalizeCharacterProhibitions(value));
}

export function mergeCharacterProhibitions(existing: unknown, incoming: unknown): string[] {
  return normalizeCharacterProhibitions([
    ...normalizeCharacterProhibitions(existing),
    ...normalizeCharacterProhibitions(incoming),
  ]);
}

function compactText(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, " ").trim() ?? "";
  return text || null;
}

export function hasCharacterHardFacts(value: CharacterHardFacts | null | undefined): boolean {
  if (!value) {
    return false;
  }
  return Boolean(
    compactText(value.identityLabel)
    || compactText(value.factionLabel)
    || compactText(value.stanceLabel)
    || compactText(value.powerLevel)
    || compactText(value.realm)
    || compactText(value.currentLocation)
    || compactText(value.availability)
    || normalizeCharacterProhibitions(value.prohibitions).length > 0,
  );
}

export function buildRuntimeCharacterHardFacts(
  character: GenerationContextPackage["characterRoster"][number],
  pendingReview?: PendingCharacterHardFactReview | null,
): GenerationContextPackage["characterHardFacts"][number] {
  const pendingFields = new Set(pendingReview?.pendingReviewFields ?? []);
  return {
    characterId: character.id,
    name: character.name,
    role: character.role ?? null,
    identityLabel: compactText(character.identityLabel),
    factionLabel: compactText(character.factionLabel),
    stanceLabel: compactText(character.stanceLabel),
    powerLevel: compactText(character.powerLevel),
    realm: compactText(character.realm),
    currentLocation: compactText(character.currentLocation),
    availability: compactText(character.availability),
    currentState: pendingFields.has("currentState")
      ? compactText(pendingReview?.currentState) ?? compactText(character.currentState)
      : compactText(character.currentState),
    currentGoal: pendingFields.has("currentGoal")
      ? compactText(pendingReview?.currentGoal) ?? compactText(character.currentGoal)
      : compactText(character.currentGoal),
    prohibitions: normalizeCharacterProhibitions(character.prohibitions),
    pendingReviewFields: pendingReview?.pendingReviewFields ?? [],
  };
}

export function buildRuntimeCharacterHardFactsList(
  characters: GenerationContextPackage["characterRoster"],
  pendingReviewByCharacterId: PendingCharacterHardFactReviewMap = new Map(),
): GenerationContextPackage["characterHardFacts"] {
  return characters
    .map((character) => buildRuntimeCharacterHardFacts(
      character,
      pendingReviewByCharacterId.get(character.id),
    ))
    .filter((item) => (
      Boolean(item.identityLabel)
      || Boolean(item.factionLabel)
      || Boolean(item.stanceLabel)
      || Boolean(item.powerLevel)
      || Boolean(item.realm)
      || Boolean(item.currentLocation)
      || Boolean(item.availability)
      || Boolean(item.currentState)
      || Boolean(item.currentGoal)
      || item.prohibitions.length > 0
    ));
}
