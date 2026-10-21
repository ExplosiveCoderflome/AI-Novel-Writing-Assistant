import {prisma} from "../../../db/prisma";
import {
  DEFAULT_DIRECTOR_CHAPTER_TOKEN_LIMIT,
  directorChapterBudgetSettingsSchema,
  directorChapterTokenLimitSchema,
  type DirectorChapterBudgetSettings,
} from "@ai-novel/shared/types/director/chapterBudget";

const SETTING_KEY = "autoDirector.chapterTokenLimit";

export async function getDirectorChapterBudgetSettings(): Promise<DirectorChapterBudgetSettings> {
  const row = await prisma.appSetting.findUnique({where: {key: SETTING_KEY}});
  const saved = directorChapterTokenLimitSchema.safeParse(Number(row?.value));
  return {tokenLimit: saved.success ? saved.data : DEFAULT_DIRECTOR_CHAPTER_TOKEN_LIMIT};
}

export async function saveDirectorChapterBudgetSettings(input: DirectorChapterBudgetSettings): Promise<DirectorChapterBudgetSettings> {
  const settings = directorChapterBudgetSettingsSchema.parse(input);
  const value = String(settings.tokenLimit);
  await prisma.appSetting.upsert({where: {key: SETTING_KEY}, update: {value}, create: {key: SETTING_KEY, value}});
  return settings;
}
