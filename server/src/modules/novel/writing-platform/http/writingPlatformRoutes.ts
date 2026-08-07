import type { Router } from "express";
import { z } from "zod";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { writingPlatformRecommendationPrompt } from "../../../../prompting/prompts/novel/writingPlatformRecommendation.prompts";
import { supportsWritingPlatformForm, writingPlatformProfileService } from "..";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
const platformSchema = z.enum(["fanqie_free", "qidian_male", "jinjiang_female", "zhihu_story"]);

export function registerWritingPlatformRoutes(router: Router): void {
  router.post("/:id/writing-platform/recommend", async (req, res, next) => {
    try {
      const { id } = paramsSchema.parse(req.params);
      const novel = await prisma.novel.findUnique({ where: { id } });
      if (!novel) throw new AppError("小说不存在。", 404);
      const result = await runStructuredPrompt({
        asset: writingPlatformRecommendationPrompt,
        promptInput: {
          narrativeForm: novel.narrativeForm,
          title: novel.title,
          description: novel.description ?? undefined,
          targetAudience: novel.targetAudience ?? undefined,
          bookSellingPoint: novel.bookSellingPoint ?? undefined,
          styleTone: novel.styleTone ?? undefined,
        },
        options: { novelId: id, entrypoint: "novel_settings", stage: "writing_platform_recommend", temperature: 0.25 },
      });
      res.json({ success: true, data: result.output });
    } catch (error) { next(error); }
  });

  router.put("/:id/writing-platform", async (req, res, next) => {
    try {
      const { id } = paramsSchema.parse(req.params);
      const platform = platformSchema.parse(req.body?.platform);
      const novel = await prisma.novel.findUnique({ where: { id } });
      if (!novel) throw new AppError("小说不存在。", 404);
      if (novel.writingPlatform === platform && novel.writingPlatformSnapshotJson) {
        res.json({ success: true, data: novel });
        return;
      }
      const activeCount = await prisma.novelWorkflowTask.count({
        where: { novelId: id, status: { in: ["queued", "running", "waiting_approval"] } },
      });
      if (activeCount > 0) throw new AppError("作品正在生成，完成或取消当前任务后再切换目标平台。", 409);
      if (!supportsWritingPlatformForm(platform, novel.narrativeForm)) throw new AppError("所选平台不支持当前作品规模。", 400);
      const snapshot = await writingPlatformProfileService.snapshot(platform, novel.narrativeForm);
      const updated = await prisma.novel.update({
        where: { id },
        data: {
          writingPlatform: platform,
          writingPlatformProfileVersion: snapshot.profileVersion,
          writingPlatformSnapshotJson: JSON.stringify(snapshot),
        },
      });
      res.json({ success: true, data: updated });
    } catch (error) { next(error); }
  });
}
