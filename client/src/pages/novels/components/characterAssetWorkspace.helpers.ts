import i18next from "i18next";
import type { Character, CharacterCastRole, CharacterGender } from "@ai-novel/shared/types/novel";

const CAST_ROLE_LABELS: Record<CharacterCastRole, string> = {
  protagonist: i18next.t("gen.pages.novels.components.characterAssetWorkspace.helpers.mainCharacter"),
  antagonist: i18next.t("gen.pages.novels.components.characterAssetWorkspace.helpers.mainEnemy"),
  ally: i18next.t("gen.pages.novels.components.characterAssetWorkspace.helpers.gen_9669fc43"),
  foil: i18next.t("gen.pages.novels.components.characterAssetWorkspace.helpers.gen_d7fc88ac"),
  mentor: i18next.t("gen.pages.novels.components.characterAssetWorkspace.helpers.gen_d62518be"),
  love_interest: i18next.t("gen.pages.novels.components.characterAssetWorkspace.helpers.gen_65c52a7e"),
  pressure_source: i18next.t("gen.pages.novels.components.characterAssetWorkspace.helpers.gen_7aa91c6c"),
  catalyst: i18next.t("gen.pages.novels.components.characterAssetWorkspace.helpers.gen_f57197c6"),
};

const CHARACTER_GENDER_LABELS: Record<CharacterGender, string> = {
  male: i18next.t("gen.pages.novels.components.characterAssetWorkspace.helpers.gen_36a4908a"),
  female: i18next.t("gen.pages.novels.components.characterAssetWorkspace.helpers.gen_87c835a6"),
  other: i18next.t("gen.pages.novels.components.characterAssetWorkspace.helpers.gen_0d98c747"),
  unknown: i18next.t("gen.pages.novels.components.characterAssetWorkspace.helpers.gen_1622dc9b"),
};

export function getCastRoleLabel(castRole?: CharacterCastRole | null): string {
  if (!castRole) {
    return i18next.t("gen.pages.novels.components.characterAssetWorkspace.helpers.gen_cebc6bbb");
  }
  return CAST_ROLE_LABELS[castRole] ?? castRole;
}

export function getCharacterGenderLabel(gender?: CharacterGender | null): string {
  if (!gender) {
    return i18next.t("gen.pages.novels.components.characterAssetWorkspace.helpers.gen_1622dc9b");
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
