import type {
  CharacterCastRole,
  CharacterGender,
  SupplementalCharacterCandidate,
  SupplementalCharacterGenerationMode,
} from "@ai-novel/shared/types/novel";

export const CAST_ROLE_LABELS: Record<CharacterCastRole, string> = { protagonist: "protagonist", antagonist: "antagonist", ally: "ally", foil: "mirror character", mentor: "mentor", love_interest: "emotional attraction", pressure_source: "pressure source", catalyst: "catalyst", }; export const CHARACTER_GENDER_LABELS: Record<CharacterGender, string> = { male: "male", female: "female", other: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", unknown: "Don't know", }; export const SUPPLEMENTAL_MODE_LABELS: Record<SupplementalCharacterGenerationMode, string> = {
  auto: "AI judgment",
  linked: "Relationship fill-in",
  independent: "Independent fill-in",
};

export function getCastRoleLabel(castRole?: CharacterCastRole | "auto" | null): string {
  if (!castRole || castRole === "auto") {
    return "AI judgment";
  }
  return CAST_ROLE_LABELS[castRole] ?? castRole;
}

export function getCharacterGenderLabel(gender?: CharacterGender | null): string {
  if (!gender) {
    return "unknown";
  }
  return CHARACTER_GENDER_LABELS[gender] ?? gender;
}

export function getSupplementalRelationLabel(
  candidate: SupplementalCharacterCandidate,
  relation: SupplementalCharacterCandidate["relations"][number],
): string {
  if (relation.sourceName === candidate.name) {
    return relation.targetName;
  }
  if (relation.targetName === candidate.name) {
    return relation.sourceName;
  }
  return `${relation.sourceName} -> ${relation.targetName}`;
}
