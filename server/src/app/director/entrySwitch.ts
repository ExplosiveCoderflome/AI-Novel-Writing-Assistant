import {Router} from "express";

/** Installed at the HTTP entry only; switching never rewrites historical tasks. */
export function createFrozenDirectorEntry(options: {findTaskNovelId?: (taskId: string) => Promise<string | null>} = {}) {
  const router = Router();
  const frozen = async (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    if (res.locals.directorOpeningAllowed) return next();
    try {
      const novelId = typeof req.body?.payload?.novelId === "string" ? req.body.payload.novelId
        : req.params.taskId && options.findTaskNovelId ? await options.findTaskNovelId(String(req.params.taskId)) : null;
      res.status(409).json({success: false, error: novelId ? "请打开小说导演台，选择创作范围后继续。" : "请从创作入口确认长篇方向，再进入小说导演台。",
        sourceRoute: novelId ? `/lab/director/${encodeURIComponent(novelId)}` : "/create?form=long_novel",
        sourceActionLabel: novelId ? "打开小说导演台" : "开始长篇创作"});
    } catch(error) { next(error); }
  };
  router.post("/tasks", frozen);
  router.post("/tasks/:taskId/commands", frozen);
  router.post("/novels/:novelId/commands", (req,res) => {
    res.status(409).json({success:false,error:"请从小说导演台继续创作。",sourceRoute:`/lab/director/${encodeURIComponent(req.params.novelId)}`});
  });
  return router;
}
