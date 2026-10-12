import {Router} from "express";
import {z} from "zod";
import {directorV2Available, getNovelDirectorIdentity, switchNovelDirectorVersion} from "./ownership";

export function createDirectorVersionRouter(): Router {
  const router = Router();
  router.get("/director-versions", (_req, res) => {
    const availableVersions = directorV2Available() ? ["v1", "v2"] : ["v1"];
    res.json({success: true, data: {availableVersions, defaultVersion: directorV2Available() ? "v2" : "v1"}});
  });
  router.get("/:novelId/director-version", async (req, res, next) => {
    try {res.json({success: true, data: await getNovelDirectorIdentity(String(req.params.novelId))});} catch (error) {next(error);}
  });
  router.put("/:novelId/director-version", async (req, res, next) => {
    const body = z.object({version: z.enum(["v1", "v2"]), expectedEpoch: z.number().int().nonnegative()}).safeParse(req.body);
    if (!body.success) {res.status(400).json({success: false, error: "请选择导演版本并刷新本书设置。"}); return;}
    try {res.json({success: true, data: await switchNovelDirectorVersion(String(req.params.novelId), body.data.version, body.data.expectedEpoch)});} catch (error) {next(error);}
  });
  return router;
}
