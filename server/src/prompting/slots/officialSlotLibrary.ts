import { findRegisteredPromptAssetById } from "../registry";
import {
  getSlotDefaultHash,
  getSlotDefaultValue,
} from "./slotResolution";
import type { PromptSlotDef } from "./slotTypes";

export interface OfficialPromptSlotProfile {
  id: "current";
  label: string;
  description: string;
}

export interface OfficialPromptSlotItem {
  key: string;
  label: string;
  kind: PromptSlotDef["kind"];
  defaultValue: string | boolean;
  defaultHash: string;
  changelog?: string;
}

export interface OfficialPromptSlotLibrary {
  promptId: string;
  promptVersion: string;
  slots: OfficialPromptSlotItem[];
  officialProfiles: OfficialPromptSlotProfile[];
}

export function getOfficialPromptSlotLibrary(promptId: string): OfficialPromptSlotLibrary {
  const asset = findRegisteredPromptAssetById(promptId);
  if (!asset) {
    throw new Error(`提示词未注册：${promptId}`);
  }
  const slots: PromptSlotDef[] = asset.slots ?? [];
  return {
    promptId: asset.id,
    promptVersion: asset.version,
    slots: slots.map((slot) => ({
      key: slot.key,
      label: slot.label,
      kind: slot.kind,
      defaultValue: getSlotDefaultValue(slot),
      defaultHash: getSlotDefaultHash(slot),
      changelog: slot.changelog,
    })),
    officialProfiles: [
      {
        id: "current",
        label: "官方当前版",
        description: "使用代码注册的 PromptAsset.slots 默认值。",
      },
    ],
  };
}
