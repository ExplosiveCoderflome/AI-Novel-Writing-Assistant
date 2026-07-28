import { prisma } from "../../db/prisma";
import { userSettingProtectionService } from "../config/UserSettingProtectionService";
import {
  BUILTIN_CREATOR_PRESETS,
  type CreatorProfileStoreInput,
  type PresetKey,
  type TelosCreatorProfile,
} from "./creatorProfileTypes";

export class CreatorProfileService {
  private static readonly PROFILE_SETTING_KEY = "creator.profile";

  /**
   * Retrieves the current active TELOS Creator Profile from AppSetting.
   */
  async getProfile(): Promise<CreatorProfileStoreInput> {
    const raw = await userSettingProtectionService.getAppSetting(CreatorProfileService.PROFILE_SETTING_KEY, "");
    if (!raw) {
      return {
        creatorName: "Default Creator",
        activePreset: null,
        profile: {},
      };
    }

    try {
      const parsed = JSON.parse(raw);
      return {
        creatorName: parsed.creatorName ?? "Default Creator",
        activePreset: parsed.activePreset ?? null,
        profile: parsed.profile ?? {},
      };
    } catch {
      return {
        creatorName: "Default Creator",
        activePreset: null,
        profile: {},
      };
    }
  }

  /**
   * Saves or updates the TELOS Creator Profile non-destructively.
   */
  async saveProfile(input: CreatorProfileStoreInput): Promise<CreatorProfileStoreInput> {
    const payload: CreatorProfileStoreInput = {
      creatorName: input.creatorName ?? "Default Creator",
      activePreset: input.activePreset ?? null,
      profile: input.profile,
    };

    await prisma.appSetting.upsert({
      where: { key: CreatorProfileService.PROFILE_SETTING_KEY },
      create: {
        key: CreatorProfileService.PROFILE_SETTING_KEY,
        value: JSON.stringify(payload),
      },
      update: {
        value: JSON.stringify(payload),
      },
    });

    return payload;
  }

  /**
   * Loads a built-in aesthetic preset (修仙/悬疑/赛博/都市) into the Creator Profile.
   */
  async loadPresetProfile(presetKey: PresetKey): Promise<CreatorProfileStoreInput> {
    const preset = BUILTIN_CREATOR_PRESETS[presetKey];
    if (!preset) {
      throw new Error(`未知的预设类型: ${presetKey}`);
    }

    const payload: CreatorProfileStoreInput = {
      creatorName: "Default Creator",
      activePreset: presetKey,
      profile: preset.profile,
    };

    return this.saveProfile(payload);
  }

  /**
   * Formats the TELOS Creator Profile into a standardized Context Block to be injected into Prompt assembly.
   */
  async getFormattedCreatorProfileContext(): Promise<string> {
    const data = await this.getProfile();
    const p = data.profile;

    const lines: string[] = [];

    if (p.narrativeTone) {
      lines.push(`- 创作者口吻风味：${p.narrativeTone}`);
    }
    if (p.writingStrategies && p.writingStrategies.length > 0) {
      lines.push(`- 常用写作策略：${p.writingStrategies.join("；")}`);
    }
    if (p.learnedTaboos && p.learnedTaboos.length > 0) {
      lines.push(`- 禁用忌讳 (LEARNED Taboos)：${p.learnedTaboos.join("；")}`);
    }
    if (p.mission) {
      lines.push(`- 核心立意与使命：${p.mission}`);
    }

    if (lines.length === 0) {
      return "";
    }

    return `=== [CREATOR TELOS PROFILE - Personal Style & Learned Taboos] ===\n${lines.join("\n")}`;
  }

  /**
   * Parses natural language Q&A interview text into structured TelosCreatorProfile fields.
   */
  parseInterviewInput(qaText: string): TelosCreatorProfile {
    const result: TelosCreatorProfile = {
      learnedTaboos: [],
      writingStrategies: [],
    };

    if (!qaText) return result;

    // Line-by-line extraction logic for taboos & tone
    const lines = qaText.split("\n").map((l) => l.trim()).filter(Boolean);

    for (const line of lines) {
      if (line.includes("讨厌") || line.includes("严禁") || line.includes("避免") || line.includes("少用")) {
        result.learnedTaboos!.push(line.replace(/^(讨厌|严禁|避免|少用|忌讳)[:：\s]*/, ""));
      } else if (line.includes("风格") || line.includes("感觉") || line.includes("口吻")) {
        result.narrativeTone = line.replace(/^(风格|感觉|口吻)[:：\s]*/, "");
      } else if (line.includes("策略") || line.includes("开头") || line.includes("习惯")) {
        result.writingStrategies!.push(line);
      }
    }

    if (result.learnedTaboos!.length === 0) delete result.learnedTaboos;
    if (result.writingStrategies!.length === 0) delete result.writingStrategies;

    return result;
  }
}

export const creatorProfileService = new CreatorProfileService();
