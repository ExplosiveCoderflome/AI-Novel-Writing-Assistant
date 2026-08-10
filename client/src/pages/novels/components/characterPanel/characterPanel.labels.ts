import type {
  CharacterCastRole,
  CharacterGender,
  SupplementalCharacterCandidate,
  SupplementalCharacterGenerationMode,
} from "@ai-novel/shared/types/novel";

export const CAST_ROLE_LABELS: Record<CharacterCastRole, string> = {
  protagonist: "主角",
  antagonist: "主对手",
  ally: "同盟",
  foil: "镜像角色",
  mentor: "导师",
  love_interest: "情感牵引",
  pressure_source: "压力源",
  catalyst: "催化者",
};

export const CHARACTER_GENDER_LABELS: Record<CharacterGender, string> = {
  male: "男",
  female: "女",
  other: "其他",
  unknown: "未知",
};

export const SUPPLEMENTAL_MODE_LABELS: Record<SupplementalCharacterGenerationMode, string> = {
  auto: "AI 判断",
  linked: "关系补位",
  independent: "独立补位",
};

export function getCastRoleLabel(castRole?: CharacterCastRole | "auto" | null): string {
  if (!castRole || castRole === "auto") {
    return "AI 判断";
  }
  return CAST_ROLE_LABELS[castRole] ?? castRole;
}

export function getCharacterGenderLabel(gender?: CharacterGender | null): string {
  if (!gender) {
    return "未知";
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
