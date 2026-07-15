import type { Character, CharacterCastRole, CharacterGender } from "@ai-novel/shared/types/novel";

const CAST_ROLE_LABELS: Record<CharacterCastRole, string> = {
  protagonist: "主角",
  antagonist: "主对手",
  ally: "同盟",
  foil: "镜像角色",
  mentor: "导师",
  love_interest: "情感牵引",
  pressure_source: "压力源",
  catalyst: "催化者",
};

const CHARACTER_GENDER_LABELS: Record<CharacterGender, string> = {
  male: "男",
  female: "女",
  other: "其他",
  unknown: "未知",
};

export function getCastRoleLabel(castRole?: CharacterCastRole | null): string {
  if (!castRole) {
    return "未定义";
  }
  return CAST_ROLE_LABELS[castRole] ?? castRole;
}

export function getCharacterGenderLabel(gender?: CharacterGender | null): string {
  if (!gender) {
    return "未知";
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
