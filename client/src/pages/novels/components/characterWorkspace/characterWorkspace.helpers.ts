import type { Character, CharacterVisibleProfileField } from "@ai-novel/shared/types/novel";
import type { CharacterResourceLedgerItem } from "@ai-novel/shared/types/characterResource";
import { isProtagonistCharacter } from "../characterAssetWorkspace.helpers";

export const VISIBLE_PROFILE_FIELDS: Array<{
  key: CharacterVisibleProfileField;
  label: string;
  placeholder: string;
}> = [
  { key: "appearance", label: "Appearance memory point", placeholder: "Eyebrows, hairstyle, facial expressions and other facial features that can be remembered by readers" },
  { key: "physique", label: "body base", placeholder: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." },
  { key: "attireStyle", label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.", placeholder: "Daily wear, status appearance, class or occupation traces" },
  { key: "signatureDetail", label: "Logo details", placeholder: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." },
  { key: "voiceTexture", label: "tone of voice", placeholder: "Voice, speaking rhythm, sentence patterns, tone of voice" },
  { key: "presenceImpression", label: "First impression", placeholder: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." },
];

export function getSecretStatus(selectedCharacter?: Character): string {
  if (!selectedCharacter) {
    return "None yet";
  }
  if (selectedCharacter.secret?.trim()) {
    return "There is a clear secret";
  }
  const runtimeSignal = `${selectedCharacter.currentState ?? ""} ${selectedCharacter.currentGoal ?? ""}`;
  return /秘密|隐瞒|卧底|伪装/.test(runtimeSignal) ? "Key information has been hidden" : "No explicit secret yet";
}

export function getEmotionSignal(selectedCharacter?: Character): string {
  const runtimeSignal = `${selectedCharacter?.currentState ?? ""} ${selectedCharacter?.currentGoal ?? ""}`;
  if (/愤|怒|焦虑|崩溃|绝望/.test(runtimeSignal)) {
    return "high pressure";
  }
  if (/平静|稳|冷静|从容/.test(runtimeSignal)) {
    return "smooth";
  }
  return "To be seen";
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
      label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      helper: "The protagonist will fully display the props, clues, identity credentials, trump cards and consumption status. Subsequent chapters will give priority to referring to these action boundaries.",
      limit: 10,
      shouldShowResource: () => true,
    };
  }
  if (/临时|路人|客串|一次性/.test(roleText)) {
    return {
      label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
      helper: "Temporary characters only display resources that will be reused across chapters, affect conflicts, bind foreshadowing, or be taken away by the protagonist.",
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
    label: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    helper: "Long-term characters prioritize resources that change action choices, relationship stakes, reader knowledge, or foreshadowing.",
    limit: 6,
    shouldShowResource: (item) => item.status !== "stale",
  };
}

export function getResourceStatusLabel(status: CharacterResourceLedgerItem["status"]): string {
  const labels: Record<CharacterResourceLedgerItem["status"], string> = {
    available: "Available",
    hidden: "hide",
    borrowed: "borrow",
    transferred: "transfer",
    lost: "lost",
    consumed: "Consumed",
    damaged: "damaged",
    destroyed: "destruction",
    stale: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  };
  return labels[status] ?? status;
}

export function getResourceFunctionLabel(value: CharacterResourceLedgerItem["narrativeFunction"]): string {
  const labels: Record<CharacterResourceLedgerItem["narrativeFunction"], string> = {
    tool: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    clue: "clue",
    weapon: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    proof: "evidence",
    key: "key",
    cost: "cost",
    promise: "Foreshadowing",
    hidden_card: "trump card",
    constraint: "limit",
  };
  return labels[value] ?? value;
}
