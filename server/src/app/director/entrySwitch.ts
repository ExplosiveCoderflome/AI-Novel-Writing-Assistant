import {Router} from "express";
import {canExecuteLegacyTask, readNovelDirectorIdentity, canRecoverLegacyPipelineJob} from "../../modules/novel/director-routing";

const isV2 = async (novelId: string) => (await readNovelDirectorIdentity(novelId)).version === "v2";
type EntryOwnership = {
  isV2: typeof isV2;
  canExecuteLegacyTask: typeof canExecuteLegacyTask;
  canRecoverLegacyPipelineJob: typeof canRecoverLegacyPipelineJob;
};
const ownership: EntryOwnership = {isV2, canExecuteLegacyTask, canRecoverLegacyPipelineJob};

type FrozenTask = {lane: string; novelId: string | null; directorVersion?: string | null};
type TaskLookup = {findTask: (taskId: string) => Promise<FrozenTask | null>} & Partial<EntryOwnership>;

function noLegacyCurrent(res: import("express").Response, novelId: string) {
  res.status(200).json({success: true, data: null, sourceRoute: `/lab/director/${encodeURIComponent(novelId)}`});
}

function rejectFrozenWrite(res: import("express").Response, novelId?: string | null, taskId?: string) {
  res.status(409).json({success:false,error:novelId ? "请打开小说导演台，选择创作范围后继续。" : "请从开书页面选择方向并继续。",
    sourceRoute:novelId ? `/lab/director/${encodeURIComponent(novelId)}` : taskId ? `/novels/auto-director?taskId=${encodeURIComponent(taskId)}` : "/novels/auto-director"});
}

/** Freeze alternate legacy orchestration entrances, while retaining the pre-book form and manual lane. */
export function createFrozenWorkflowEntry(options: TaskLookup) {
  const {findTask} = options;
  const {isV2, canExecuteLegacyTask} = {...ownership, ...options};
  const router=Router();
  router.get("/novels/:novelId/auto-director", async (req,res,next) => {
    try {if (await isV2(String(req.params.novelId))) noLegacyCurrent(res,String(req.params.novelId)); else next();} catch(error) {next(error);}
  });
  router.post("/bootstrap",async(req,res,next)=>{
    try {
      const id=typeof req.body?.workflowTaskId === "string" ? req.body.workflowTaskId : undefined;
      const task=id ? await findTask(id) : null;
      if (task?.lane === "auto_director" && req.body?.seedPayload?.directorVersion && (task.directorVersion ?? "v1") !== req.body.seedPayload.directorVersion) {
        rejectFrozenWrite(res, task.novelId, id); return;
      }
      if ((task?.lane === "auto_director" && task.novelId && !await canExecuteLegacyTask(id!)) ||
        (req.body?.lane === "auto_director" && req.body?.novelId && await isV2(req.body.novelId))) {
        rejectFrozenWrite(res,task?.novelId ?? req.body.novelId,id);return;
      }
      next();
    }catch(error){next(error);}
  });
  const freeze: import("express").RequestHandler=async(req,res,next)=>{
    try {
      const task=await findTask(String(req.params.id));
      if(task?.lane === "auto_director" && !await canExecuteLegacyTask(String(req.params.id))) {rejectFrozenWrite(res,task.novelId,String(req.params.id));return;}
      next();
    }catch(error){next(error);}
  };
  for(const action of ["continue","production-experience","repair-chapter-titles"])router.post(`/:id/${action}`,freeze);
  return router;
}

export function createFrozenTaskEntry(options: TaskLookup & {findPipelineOwner?: (jobId: string) => Promise<string | null>}) {
  const {findTask, findPipelineOwner} = options;
  const {canExecuteLegacyTask, canRecoverLegacyPipelineJob} = {...ownership, ...options};
  const router=Router();
  const freeze: import("express").RequestHandler=async(req,res,next)=>{
    try {
      const task=req.params.kind === "novel_workflow" ? await findTask(String(req.params.id)) : null;
      if(task?.lane === "auto_director" && !await canExecuteLegacyTask(String(req.params.id))) {rejectFrozenWrite(res,task.novelId,String(req.params.id));return;}
      const novelId=req.params.kind === "novel_pipeline" && findPipelineOwner ? await findPipelineOwner(String(req.params.id)) : null;
      if(novelId && !await canRecoverLegacyPipelineJob(String(req.params.id))) {rejectFrozenWrite(res,novelId);return;}
      next();
    }catch(error){next(error);}
  };
  router.post("/recovery-candidates/:kind/:id/resume",freeze);
  router.post("/recovery-candidates/resume-all",(_req,res)=>{
    res.status(409).json({success:false,error:"请从任务对应的创作页面恢复。",sourceRoute:"/lab/director"});
  });
  for(const action of ["retry","cancel","archive"])router.post(`/:kind/:id/${action}`,freeze);
  return router;
}

/** Notification actions cannot restart a frozen workflow behind the user's source page. */
export function createFrozenFollowUpEntry(options: Partial<EntryOwnership> = {}) {
  const {canExecuteLegacyTask} = {...ownership, ...options};
  const router=Router();
  const reject: import("express").RequestHandler=async(req,res,next)=>{
    try {
      const taskId = req.body?.taskId ?? req.query.taskId ?? /^\/([^/]+)\/actions$/.exec(req.path)?.[1];
      if (typeof taskId === "string" && await canExecuteLegacyTask(taskId)) {next(); return;}
      res.status(409).json({success:false,error:"请从小说对应的导演工作台查看创作范围并继续。",sourceRoute:"/lab/director"});
    } catch(error) {next(error);}
  };
  router.get("/wecom/execute",reject);
  router.use((req,res,next)=>{if(req.method === "POST") {reject(req,res,next);return;}next();});
  return router;
}

/** Installed at the HTTP entry only; switching never rewrites historical tasks. */
export function createFrozenDirectorEntry(options: {findTaskNovelId?: (taskId: string) => Promise<string | null>} & Partial<EntryOwnership> = {}) {
  const {isV2, canExecuteLegacyTask} = {...ownership, ...options};
  const router = Router();
  for (const route of ["/novels/:novelId/current", "/book-automation/:novelId"]) {
    router.get(route, async (req,res,next) => {
      try {if (await isV2(String(req.params.novelId))) noLegacyCurrent(res,String(req.params.novelId)); else next();} catch(error) {next(error);}
    });
  }
  const frozen = async (req: import("express").Request, res: import("express").Response, next: import("express").NextFunction) => {
    if (res.locals.directorOpeningAllowed) return next();
    try {
      const novelId = typeof req.body?.payload?.novelId === "string" ? req.body.payload.novelId
        : req.params.taskId && options.findTaskNovelId ? await options.findTaskNovelId(String(req.params.taskId)) : null;
      if (req.params.taskId && await canExecuteLegacyTask(String(req.params.taskId))) {next(); return;}
      if (novelId && !await isV2(novelId) && !req.params.taskId) {next(); return;}
      if (!novelId && !req.params.taskId && req.body?.payload?.directorVersion !== "v2") {next(); return;}
      res.status(409).json({success: false, error: novelId ? "请打开小说导演台，选择创作范围后继续。" : "请从创作入口确认长篇方向，再进入小说导演台。",
        sourceRoute: novelId ? `/lab/director/${encodeURIComponent(novelId)}` : "/create?form=long_novel",
        sourceActionLabel: novelId ? "打开小说导演台" : "开始长篇创作"});
    } catch(error) { next(error); }
  };
  router.post("/tasks", frozen);
  router.post("/tasks/:taskId/commands", frozen);
  router.post("/novels/:novelId/commands", async (req,res,next) => {
    try {if (await isV2(String(req.params.novelId))) rejectFrozenWrite(res, String(req.params.novelId)); else next();} catch(error) {next(error);}
  });
  return router;
}
