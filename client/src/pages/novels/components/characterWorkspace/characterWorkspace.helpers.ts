import type { Character, CharacterVisibleProfileField } from "@ai-novel/shared/types/novel";
import type { CharacterResourceLedgerItem } from "@ai-novel/shared/types/characterResource";
import { isProtagonistCharacter } from "../characterAssetWorkspace.helpers";

export const VISIBLE_PROFILE_FIELDS: Array<{
  key: CharacterVisibleProfileField;
  label: string;
  placeholder: string;
}> = [
  { key: "appearance", label: "样貌记忆点", placeholder: "眉眼、发型、表情习惯等能被读者记住的样貌特征" },
  { key: "physique", label: "体态基底", placeholder: "年龄感、身形、行动姿态、身体状态基底" },
  { key: "attireStyle", label: "常见穿着", placeholder: "日常穿着、身份外观、阶层或职业痕迹" },
  { key: "signatureDetail", label: "标志细节", placeholder: "标志物、动作、微习惯、气味或反复可用的细节" },
  { key: "voiceTexture", label: "声音口吻", placeholder: "声线、说话节奏、句式习惯、口吻" },
  { key: "presenceImpression", label: "登场印象", placeholder: "首次或常规登场时给读者的直观感受" },
];

export function getSecretStatus(selectedCharacter?: Character): string {
  if (!selectedCharacter) {
    return "暂无";
  }
  if (selectedCharacter.secret?.trim()) {
    return "存在明确秘密";
  }
  const runtimeSignal = `${selectedCharacter.currentState ?? ""} ${selectedCharacter.currentGoal ?? ""}`;
  return /秘密|隐瞒|卧底|伪装/.test(runtimeSignal) ? "已隐藏关键信息" : "暂无显性秘密";
}

export function getEmotionSignal(selectedCharacter?: Character): string {
  const runtimeSignal = `${selectedCharacter?.currentState ?? ""} ${selectedCharacter?.currentGoal ?? ""}`;
  if (/愤|怒|焦虑|崩溃|绝望/.test(runtimeSignal)) {
    return "高压";
  }
  if (/平静|稳|冷静|从容/.test(runtimeSignal)) {
    return "平稳";
  }
  return "待观察";
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
      label: "主角完整资源",
      helper: "主角会完整展示道具、线索、身份凭证、底牌和消耗状态，后续章节会优先参考这些行动边界。",
      limit: 10,
      shouldShowResource: () => true,
    };
  }
  if (/临时|路人|客串|一次性/.test(roleText)) {
    return {
      label: "临时角色资源",
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
    label: "长期角色关键资源",
    helper: "长期角色优先展示会改变行动选择、关系筹码、读者知情或伏笔兑现的资源。",
    limit: 6,
    shouldShowResource: (item) => item.status !== "stale",
  };
}

export function getResourceStatusLabel(status: CharacterResourceLedgerItem["status"]): string {
  const labels: Record<CharacterResourceLedgerItem["status"], string> = {
    available: "可用",
    hidden: "隐藏",
    borrowed: "借用",
    transferred: "转交",
    lost: "丢失",
    consumed: "已消耗",
    damaged: "受损",
    destroyed: "毁坏",
    stale: "淡出",
  };
  return labels[status] ?? status;
}

export function getResourceFunctionLabel(value: CharacterResourceLedgerItem["narrativeFunction"]): string {
  const labels: Record<CharacterResourceLedgerItem["narrativeFunction"], string> = {
    tool: "工具",
    clue: "线索",
    weapon: "武器",
    proof: "证据",
    key: "钥匙",
    cost: "代价",
    promise: "伏笔",
    hidden_card: "底牌",
    constraint: "限制",
  };
  return labels[value] ?? value;
}
