import type { Character, CharacterCastRole, CharacterGender } from "@ai-novel/shared/types/novel";

const CAST_ROLE_LABELS: Record<CharacterCastRole, string> = { protagonist: "protagonist", antagonist: "antagonist", ally: "ally", foil: "mirror character", mentor: "mentor", love_interest: "emotional attraction", pressure_source: "pressure source", catalyst: "catalyst", }; const CHARACTER_GENDER_LABELS: Record<CharacterGender, string> = {
  male: "male",
  female: "female",
  other: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  unknown: "unknown",
};

export function getCastRoleLabel(castRole?: CharacterCastRole | null): string {
  if (!castRole) {
    return "undefined";
  }
  return CAST_ROLE_LABELS[castRole] ?? castRole;
}

export function getCharacterGenderLabel(gender?: CharacterGender | null): string {
  if (!gender) {
    return "unknown";
  }
  return CHARACTER_GENDER_LABELS[gender] ?? gender;
}

export function isProtagonistCharacter(character?: Character | null): boolean {
  if (!character) {
    return false;
  }
  if (character.castRole) {
    return character.castRole === "protagonist";
  }
  const roleText = character.role ?? "";
  return /主角|男主|女主|主人公/.test(roleText);
}
