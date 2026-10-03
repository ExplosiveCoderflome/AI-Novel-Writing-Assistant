import { Router } from "express";
import { prisma } from "../../../db/prisma";
import { scheduleOpeningCommand } from "./execution";
import { prepareOpeningRetry } from "./recovery";
export { executeOpeningCommand } from "./execution";
export { prepareOpeningRetry } from "./recovery";

const candidateCommands = new Set(["refine_candidates", "patch_candidate", "refine_titles", "confirm_candidate"]);
export function createOriginalOpeningEntry(deps: {
  readTask: (id: string) => Promise<{novelId: string | null} | null>;
  schedule: (id: string) => void;
} = {readTask: id => prisma.novelWorkflowTask.findUnique({where:{id},select:{novelId:true}}), schedule: scheduleOpeningCommand}) {
  const router = Router();
  router.post("/tasks/:taskId/opening-retry", async (req,res,next) => {
    try {
      const command = await prepareOpeningRetry(String(req.params.taskId));
      res.status(202).json({success:true,data:command});
      deps.schedule(command.commandId);
    } catch(error) {next(error);}
  });
  router.use(async (req,res,next) => {
    if (req.method !== "POST") return next();
    const match = /^\/tasks\/([^/]+)\/commands$/.exec(req.path);
    const generate = req.path === "/tasks" && req.body?.taskType === "generate_candidates";
    const commandType = req.body?.commandType;
    if (!generate && !(match && candidateCommands.has(commandType))) return next();
    try {
      const taskId = match ? decodeURIComponent(match[1]) : req.body?.payload?.workflowTaskId;
      const task = typeof taskId === "string" ? await deps.readTask(taskId) : null;
      if (match && !task) return next();
      if (task?.novelId && !(commandType === "confirm_candidate" && task.novelId === `director-opening-book-${taskId}`)) return next();
      res.locals.directorOpeningAllowed = true;
      const originalJson = res.json.bind(res);
      res.json = body => {
        const result = originalJson(body);
        if (res.statusCode === 202 && body?.success && typeof body?.data?.commandId === "string") deps.schedule(body.data.commandId);
        return result;
      };
      next();
    } catch(error) { next(error); }
  });
  return router;
}
