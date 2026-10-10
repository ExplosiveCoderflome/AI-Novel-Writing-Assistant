import type {DirectorCharacterCandidateItem} from "@ai-novel/shared/types/director/characterCandidates";
import type {ChapterArtifactDeltaOutput} from "../../../../prompting/prompts/novel/chapterArtifactDelta.prompts";

// Rewrite structured identity references only; never rewrite prose, facts or quoted evidence.
const identityFields = ["characterName", "sourceCharacterName", "targetCharacterName", "ownerCharacterName", "holderCharacterName", "previousHolderCharacterName", "actorCharacterName", "fromHolderCharacterName", "toHolderCharacterName"];
export function canonicalizeCandidateReferences(output: ChapterArtifactDeltaOutput,
  items: DirectorCharacterCandidateItem[], characters: {id: string; name: string}[]): ChapterArtifactDeltaOutput {
  const mapping = new Map(items.filter(i => i.status === "created" || i.status === "merged")
    .flatMap(i => {const target = characters.find(c => c.id === i.targetId); return target ? [[i.name, target] as const] : [];}));
  const unresolved = new Set(items.filter(i => i.status === "pending" || i.status === "ignored").map(i => i.name));
  const hasUnresolvedIdentity = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const row = value as Record<string, unknown>;
    return identityFields.some(key => typeof row[key] === "string" && unresolved.has(row[key] as string))
      || (row.ownerType === "character" && typeof row.ownerName === "string" && unresolved.has(row.ownerName));
  };
  const visit = (value: unknown): unknown => {
    // Keep the raw extraction in its checkpoint; do not let legacy fuzzy lookup assign an unconfirmed identity.
    if (Array.isArray(value)) return value.filter(item => !hasUnresolvedIdentity(item)).map(visit);
    if (!value || typeof value !== "object") return value;
    const row: Record<string, unknown> = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v)]));
    for (const key of identityFields) {
      const target = typeof row[key] === "string" ? mapping.get(row[key] as string) : undefined;
      if (target) {row[key] = target.name; const idKey = key.slice(0, -4) + "Id"; if (idKey in row) row[idKey] = target.id;}
    }
    if (row.ownerType === "character" && typeof row.ownerName === "string") {
      const target = mapping.get(row.ownerName);
      if (target) row.ownerName = target.name;
    }
    if (Array.isArray(row.knownByCharacterNames)) row.knownByCharacterNames = row.knownByCharacterNames
      .filter(name => typeof name === "string" && !unresolved.has(name)).map(name => mapping.get(name as string)?.name ?? name);
    return row;
  };
  return visit(output) as ChapterArtifactDeltaOutput;
}
