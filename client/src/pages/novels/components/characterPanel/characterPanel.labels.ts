import i18next from "i18next";
import type {
  CharacterCastRole,
  CharacterGender,
  SupplementalCharacterCandidate,
  SupplementalCharacterGenerationMode,
} from "@ai-novel/shared/types/novel";

export const CAST_ROLE_LABELS: Record<CharacterCastRole, string> = {
  protagonist: i18next.t("dict.mainCharacter"),
  antagonist: i18next.t("dict.mainEnemy"),
  ally: i18next.t("dict.gen_9669fc43"),
  foil: i18next.t("dict.gen_d7fc88ac"),
  mentor: i18next.t("dict.gen_d62518be"),
  love_interest: i18next.t("dict.gen_65c52a7e"),
  pressure_source: i18next.t("dict.gen_7aa91c6c"),
  catalyst: i18next.t("dict.gen_f57197c6"),
};

export const CHARACTER_GENDER_LABELS: Record<CharacterGender, string> = {
  male: i18next.t("dict.gen_36a4908a"),
  female: i18next.t("dict.gen_87c835a6"),
  other: i18next.t("dict.gen_0d98c747"),
  unknown: i18next.t("dict.gen_1622dc9b"),
};

export const SUPPLEMENTAL_MODE_LABELS: Record<SupplementalCharacterGenerationMode, string> = {
  auto: "AI 判断",
  linked: i18next.t("dict.gen_898bbf92"),
  independent: i18next.t("dict.gen_db9b906f"),
};

export function getCastRoleLabel(castRole?: CharacterCastRole | "auto" | null): string {
  if (!castRole || castRole === "auto") {
    return i18next.t("dict.aiJudging");
  }
  return CAST_ROLE_LABELS[castRole] ?? castRole;
}

export function getCharacterGenderLabel(gender?: CharacterGender | null): string {
  if (!gender) {
    return i18next.t("dict.gen_1622dc9b");
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
