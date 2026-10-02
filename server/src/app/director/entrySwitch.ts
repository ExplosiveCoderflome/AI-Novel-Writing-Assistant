import {Router} from "express";

/** Installed at the HTTP entry only; switching never rewrites historical tasks. */
export function createFrozenDirectorEntry() {
  const router = Router();
  const frozen = (_req: import("express").Request, res: import("express").Response) => {
    res.status(409).json({success: false, error: "请打开小说导演台，选择创作范围后继续。", sourceRoute: "/novels"});
  };
  router.post("/tasks", frozen);
  router.post("/tasks/:taskId/commands", frozen);
  router.post("/novels/:novelId/commands", (req,res) => {
    res.status(409).json({success:false,error:"请从小说导演台继续创作。",sourceRoute:`/lab/director/${encodeURIComponent(req.params.novelId)}`});
  });
  return router;
}
