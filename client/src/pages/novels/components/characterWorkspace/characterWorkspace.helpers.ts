import i18next from "i18next";
import type { Character, CharacterVisibleProfileField } from "@ai-novel/shared/types/novel";
import type { CharacterResourceLedgerItem } from "@ai-novel/shared/types/characterResource";
import { isProtagonistCharacter } from "../characterAssetWorkspace.helpers";

export const VISIBLE_PROFILE_FIELDS: Array<{
  key: CharacterVisibleProfileField;
  label: string;
  placeholder: string;
}> = [
  { key: "appearance", label: i18next.t("dict.gen_17d20844"), placeholder: i18next.t("dict.gen_791666ef") },
  { key: "physique", label: i18next.t("dict.bodystateBase"), placeholder: i18next.t("dict.gen_1290c311") },
  { key: "attireStyle", label: i18next.t("dict.gen_53ee6e58"), placeholder: i18next.t("dict.gen_a298f99f") },
  { key: "signatureDetail", label: i18next.t("dict.gen_6c8bf500"), placeholder: i18next.t("dict.gen_40d9e9a9") },
  { key: "voiceTexture", label: i18next.t("dict.gen_100ce21f"), placeholder: i18next.t("dict.gen_8ba5764f") },
  { key: "presenceImpression", label: i18next.t("dict.gen_48e20549"), placeholder: i18next.t("dict.gen_e7dd4310") },
];

export function getSecretStatus(selectedCharacter?: Character): string {
  if (!selectedCharacter) {
    return i18next.t("common.none");
  }
  if (selectedCharacter.secret?.trim()) {
    return i18next.t("dict.gen_0a76e858");
  }
  const runtimeSignal = `${selectedCharacter.currentState ?? ""} ${selectedCharacter.currentGoal ?? ""}`;
  return /秘密|隐瞒|卧底|伪装/.test(runtimeSignal) ? "已隐藏关键信息" : "暂无显性秘密";
}

export function getEmotionSignal(selectedCharacter?: Character): string {
  const runtimeSignal = `${selectedCharacter?.currentState ?? ""} ${selectedCharacter?.currentGoal ?? ""}`;
  if (/愤|怒|焦虑|崩溃|绝望/.test(runtimeSignal)) {
    return i18next.t("dict.gen_32979568");
  }
  if (/平静|稳|冷静|从容/.test(runtimeSignal)) {
    return i18next.t("dict.gen_42f8a02a");
  }
  return i18next.t("dict.gen_27b34703");
}

export function getResourceDisplayMode(character?: Character): {
  label: string;
  helper: string;
  limit: number;
  shouldShowResource: (item: CharacterResourceLedgerItem) => boolean;
} {
  const roleText = `${character?.role ?? ""} ${character?.castRole ?? ""}`;
  if (isProtagonistCharacter(character)) {
    return {
      label: i18next.t("dict.completeCharacterResources"),
      helper: "主角会完整展示道具、线索、身份凭证、底牌和消耗状态，后续章节会优先参考这些行动边界。",
      limit: 10,
      shouldShowResource: () => true,
    };
  }
  if (/临时|路人|客串|一次性/.test(roleText)) {
    return {
      label: i18next.t("dict.tempResource"),
      helper: "临时角色只展示会跨章复用、牵动冲突、绑定伏笔或被主角带走的资源。",
      limit: 5,
      shouldShowResource: (item) => (
        item.narrativeFunction === "promise"
        || item.narrativeFunction === "hidden_card"
        || item.expectedUseEndChapterOrder != null
        || item.status === "transferred"
      ),
    };
  }
  return {
    label: i18next.t("dict.gen_fa19d6da"),
    helper: "长期角色优先展示会改变行动选择、关系筹码、读者知情或伏笔兑现的资源。",
    limit: 6,
    shouldShowResource: (item) => item.status !== "stale",
  };
}

export function getResourceStatusLabel(status: CharacterResourceLedgerItem["status"]): string {
  const labels: Record<CharacterResourceLedgerItem["status"], string> = {
    available: i18next.t("dict.gen_ad6b7038"),
    hidden: i18next.t("dict.gen_dce5379c"),
    borrowed: i18next.t("dict.gen_5d971fd1"),
    transferred: i18next.t("dict.gen_e1dc6851"),
    lost: i18next.t("dict.lost"),
    consumed: i18next.t("dict.gen_67d4508d"),
    damaged: i18next.t("dict.gen_a6d66917"),
    destroyed: i18next.t("dict.gen_a208527a"),
    stale: i18next.t("dict.gen_8c90bea6"),
  };
  return labels[status] ?? status;
}

export function getResourceFunctionLabel(value: CharacterResourceLedgerItem["narrativeFunction"]): string {
  const labels: Record<CharacterResourceLedgerItem["narrativeFunction"], string> = {
    tool: i18next.t("dict.gen_20dce2c6"),
    clue: i18next.t("dict.gen_ad46a96c"),
    weapon: i18next.t("dict.gen_44a3d9a4"),
    proof: i18next.t("dict.gen_a1619f59"),
    key: i18next.t("dict.gen_02b66eb5"),
    cost: i18next.t("dict.cost"),
    promise: i18next.t("dict.foreshadowing"),
    hidden_card: i18next.t("dict.gen_2fe3dee8"),
    constraint: i18next.t("dict.gen_df9c9706"),
  };
  return labels[value] ?? value;
}
