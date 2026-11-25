import { Router } from "express";
import { z } from "zod";
import { reviewVersion, finalApproval, type FinalFinding } from "@ai-novel/shared/types/director/finalReview/contract";
import {
  proseChanges,
  proseDialogueOutput,
  proseDraftSchema,
  proseReply,
} from "@ai-novel/shared/types/director/proseReview/discussion";
import { AppError } from "../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  proseReviewDialoguePrompt,
  type FinalReviewContext,
} from "../../../prompting/prompts/novel/proseReview/dialogue.prompt";
import { fieldDiscussionRouter } from "../revisions/discussion";
import { readFinalChapter } from "./manuscript";
import { inspectFinalChapter, finalModelOptions } from "./inspection";
import { finalReviewWorkspace, approveFinalManuscript, exportFinalManuscript } from "./delivery";

const base = "/novels/:novelId/final-review";
const chapterPath = base + "/chapters/:chapterId/:sourceHash";
const id = z.string().trim().min(1).max(160);
const chapterAddress = z.object({ novelId: id, chapterId: id, sourceHash: reviewVersion });
const findingAddress = chapterAddress.extend({
  finding: z.union([z.literal("all"), z.coerce.number().int().nonnegative()]),
});
interface Subject {
  base: Record<string, string>;
  chapter: { order: number; title: string; taskSheet: string | null; mustAvoid: string | null };
  finding?: FinalFinding;
  inspectionContext: FinalReviewContext;
}
export function finalReviewRouter() {
  const router = Router();
  router.get(base, async (req, res) => {
    res.json({ success: true, data: await finalReviewWorkspace(id.parse(req.params.novelId)) });
  });
  router.post(chapterPath + "/inspect", async (req, res) => {
    const { novelId, chapterId, sourceHash } = chapterAddress.parse(req.params);
    res.json({ success: true, data: await inspectFinalChapter(novelId, chapterId, sourceHash) });
  });
  router.use(
    fieldDiscussionRouter<string, Subject, z.infer<typeof findingAddress>>(
      chapterPath + "/findings/:finding/conversation",
      findingAddress,
      {
        progress: "正在对照检查意见与本章原文…",
        draft: proseDraftSchema,
        changes: proseChanges,
        reply: proseReply,
        async generate({ chapter, finding, inspectionContext }, editor, context, options) {
          const result = await runStructuredPrompt({
            asset: proseReviewDialoguePrompt,
            promptInput: { ...context, editor, chapter, finding, inspectionContext },
            options,
          });
          const { replyText, changes } = proseDialogueOutput.parse(result.output);
          return {
            replyText,
            changes: changes.map(({ paragraph, value, reason }) => ({ field: String(paragraph), value, reason })),
          };
        },
      },
      (a) => JSON.stringify(["director-final-review", a.novelId, a.chapterId, a.sourceHash, a.finding]),
      async (db, a) => {
        const { book, row, findings, input } = await readFinalChapter(db, a.novelId, a.chapterId, a.sourceHash);
        const finding = a.finding === "all" ? undefined : findings?.[a.finding];
        if (!findings || (a.finding !== "all" && !finding)) throw new AppError("请从本章已完成的检查中选择问题。", 409);
        const { order, title, taskSheet, mustAvoid } = row;
        return {
          resource: {
            base: input.chapter.paragraphs,
            chapter: { order, title, taskSheet, mustAvoid },
            finding,
            inspectionContext: {
              book: input.book,
              previousEnding: input.previousEnding,
              nextOpening: input.nextOpening,
            },
          },
          storyInput: book.description ?? book.title,
          options: finalModelOptions(a.novelId, a.chapterId, book.contract),
        };
      },
    ),
  );
  router.post(base + "/confirm", async (req, res) => {
    res.json({
      success: true,
      data: await approveFinalManuscript(id.parse(req.params.novelId), finalApproval.parse(req.body)),
    });
  });
  router.get(base + "/exports/:version", async (req, res) => {
    const file = await exportFinalManuscript(id.parse(req.params.novelId), reviewVersion.parse(req.params.version));
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.fileName)}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(file.content);
  });
  return router;
}
