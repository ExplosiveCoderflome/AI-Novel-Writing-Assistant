import { parseJsonStringArray } from "../../novelP0Utils";

function normalizeRuntimeName(value: string | null | undefined): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function resolveChapterResourceCharacterIds(input: {
  plan: { participantsJson?: string | null } | null | undefined;
  characters: Array<{ id: string; name: string }>;
}): string[] {
  const participantNames = new Set(
    parseJsonStringArray(input.plan?.participantsJson ?? null).map(normalizeRuntimeName).filter(Boolean),
  );
  if (participantNames.size === 0) {
    return [];
  }
  return input.characters
    .filter((character) => participantNames.has(normalizeRuntimeName(character.name)))
    .map((character) => character.id)
    .filter(Boolean);
}
