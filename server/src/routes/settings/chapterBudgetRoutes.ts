import type {Router} from "express";
import {directorChapterBudgetSettingsSchema} from "@ai-novel/shared/types/director/chapterBudget";
import {validate} from "../../middleware/validate";
import {getDirectorChapterBudgetSettings, saveDirectorChapterBudgetSettings} from "../../services/settings/chapterBudget";

export function registerChapterBudgetSettingsRoutes(router: Router): void {
  router.get("/auto-director/chapter-budget", async (_req, res, next) => {
    try {res.json({success: true, data: await getDirectorChapterBudgetSettings()});}
    catch (error) {next(error);}
  });
  router.put("/auto-director/chapter-budget", validate({body: directorChapterBudgetSettingsSchema}), async (req, res, next) => {
    try {res.json({success: true, data: await saveDirectorChapterBudgetSettings(req.body), message: "单章 AI 用量上限已保存，将用于新任务。"});}
    catch (error) {next(error);}
  });
}
