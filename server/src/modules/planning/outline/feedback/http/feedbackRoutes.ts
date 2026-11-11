import { Router } from "express";
import { outlineFeedbackAnalyzeSchema, outlineFeedbackDecisionSchema } from "@ai-novel/shared/types/outlineFeedback";
import { outlineFeedbackService } from "..";

const router = Router({mergeParams: true});
const route = (handler: (req: any) => Promise<unknown>) => async (req: any, res: any, next: any) => {
  try { res.json({success: true, data: await handler(req)}); } catch (error) { next(error); }
};
router.get("/", route(req => outlineFeedbackService.status(String(req.params.id))));
router.patch("/settings", route(req => outlineFeedbackService.settings(String(req.params.id), req.body)));
router.post("/analyze", route(req => {
  const body = outlineFeedbackAnalyzeSchema.parse(req.body);
  return outlineFeedbackService.enqueue(String(req.params.id), body.chapterId, body.requestKey);
}));
router.get("/proposals", route(async req => (await outlineFeedbackService.status(String(req.params.id))).runs.flatMap(run => run.items.map(item => ({...item, runId: run.id})))));
router.post("/:runId/retry", route(req => outlineFeedbackService.retry(String(req.params.id), String(req.params.runId))));
for (const [action, decision] of [["adopt", "adopted"], ["reject", "rejected"]] as const) {
  router.post(`/:runId/${action}`, route(req => outlineFeedbackService.decide(String(req.params.id), String(req.params.runId), outlineFeedbackDecisionSchema.parse(req.body).operationIds, decision)));
}
export default router;
