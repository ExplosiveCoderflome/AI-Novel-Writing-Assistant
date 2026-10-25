import type { CreativeProfile, CreativeProfileStage } from "@ai-novel/shared/types/creativeProfile";
import type { CreativePromptGuidance } from "../../../../prompting/prompts/creativeProfile/creativePromptGuidance";
import {
  readStoredCreativeProfile,
  type CreativeProfileReadResult,
  type StoredCreativeProfileFields,
} from "../domain/creativeProfileCodec";
import { compileCreativeProfileGuidance, keepsWebSerialDefaults } from "./compileCreativeProfileGuidance";

/**
 * 把读取结果转成提示词输入。未设置返回 null，调用方不传，旧提示词逐字不变。
 */
export function toCreativePromptGuidance(
  read: CreativeProfileReadResult,
  stage: CreativeProfileStage,
): CreativePromptGuidance | null {
  const guidance = compileCreativeProfileGuidance(read, stage);
  if (guidance.status === "unset") return null;
  return { keepWebSerialDefaults: keepsWebSerialDefaults(guidance), text: guidance.text };
}

/** 开书入口尚未建书时，直接用用户在请求里明确选择的配置；未选择返回 null。 */
export function creativePromptGuidanceFromProfile(
  profile: CreativeProfile | null | undefined,
  stage: CreativeProfileStage,
): CreativePromptGuidance | null {
  if (!profile) return null;
  return toCreativePromptGuidance({ status: "valid", profile }, stage);
}

export function creativePromptGuidanceFromStored(
  stored: StoredCreativeProfileFields | null | undefined,
  stage: CreativeProfileStage,
): CreativePromptGuidance | null {
  return toCreativePromptGuidance(readStoredCreativeProfile(stored), stage);
}
