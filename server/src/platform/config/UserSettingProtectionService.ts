import { prisma } from "../../db/prisma";

export class UserSettingProtectionService {
  /**
   * Ensures a default AppSetting exists without overwriting existing user-configured values.
   * Follows the "Create If Missing, Preserve If Present" paradigm.
   */
  async ensureDefaultAppSetting(key: string, defaultValue: string): Promise<string> {
    const existing = await prisma.appSetting.findUnique({
      where: { key },
    });

    if (existing) {
      return existing.value;
    }

    const created = await prisma.appSetting.create({
      data: {
        key,
        value: defaultValue,
      },
    });

    return created.value;
  }

  /**
   * Batch ensures default settings without touching existing key values.
   */
  async ensureDefaultAppSettings(settings: Record<string, string>): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    for (const [key, defaultValue] of Object.entries(settings)) {
      results[key] = await this.ensureDefaultAppSetting(key, defaultValue);
    }
    return results;
  }

  /**
   * Safely reads an AppSetting with an optional fallback.
   */
  async getAppSetting(key: string, fallbackValue: string = ""): Promise<string> {
    const setting = await prisma.appSetting.findUnique({
      where: { key },
    });
    return setting ? setting.value : fallbackValue;
  }
}

export const userSettingProtectionService = new UserSettingProtectionService();
