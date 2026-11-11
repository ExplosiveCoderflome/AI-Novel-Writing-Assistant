import {queueManualChapterSync} from "../../../../services/novel/chapterEditor/synchronization/ManualChapterSyncStore";
import {takeManuscriptSnapshot,assertManuscriptSnapshot,readManuscriptState} from "../application/ManuscriptWorkspaceService";
import {validateManuscriptRevisionBase} from "../application/ManuscriptRevisionService";
import { Router, type ErrorRequestHandler } from "express";
import { z } from "zod";
import { AppError } from "../../../../middleware/errorHandler";
import { ManuscriptBaselineService } from "../application/ManuscriptBaselineService";
import { ManuscriptRevisionService } from "../application/ManuscriptRevisionService";
import { ManuscriptStructureService } from "../application/ManuscriptStructureService";
import { ManuscriptTaskService } from "../application/ManuscriptTasks";
import { originalUnitText, ManuscriptWorkspaceService } from "../application/ManuscriptWorkspaceService";
import type { ManuscriptImportRequest, ManuscriptPartitionRequest, ManuscriptSplitRequest, ManuscriptConfirmRequest } from "@ai-novel/shared";
import { prisma } from "../../../../db/prisma";
import { ManuscriptImportService } from "../application/ManuscriptImportService";
import { MAX_RAW_BYTES } from "../domain/source";

const service = new ManuscriptImportService();
const workspaceService = new ManuscriptWorkspaceService();
const key=z.string().min(1).max(160),hash=z.string().min(1).max(128),version=z.number().int().min(0);
const importSchema=z.object({title:z.string().trim().min(1).max(200),narrativeForm:z.literal("long_novel"),pastedText:z.string().optional(),fileBase64:z.string().optional(),fileName:z.string().max(255).optional(),encoding:z.enum(["utf-8","utf-16le","utf-16be","gb18030"]).optional(),requestKey:key}).refine(value=>(value.pastedText!==undefined)!==(value.fileBase64!==undefined),"请选择TXT或粘贴全文，不能同时提交。");
const partitionSchema=z.object({expectedSessionVersion:version,sourceHash:hash,units:z.array(z.object({draftId:key,range:z.object({start:z.number().int().nonnegative(),end:z.number().int().positive()}),role:z.enum(["body","toc","front_matter","back_matter","other_reviewed"]),title:z.string().max(200),confidence:z.number().min(0).max(1).optional(),needsReview:z.boolean()})).max(6000)});
export const manuscriptRouter = Router();

manuscriptRouter.post("/imports", async (req, res, next) => {
  try {
    const body = importSchema.parse(req.body);
    const bytes = typeof body.pastedText === "string" ? Buffer.from(body.pastedText, "utf8") : typeof body.fileBase64 === "string" && isCanonicalBase64(body.fileBase64) ? Buffer.from(body.fileBase64, "base64") : null;
    if (!bytes) throw new Error("MANUSCRIPT_SOURCE_INVALID");
    if (bytes.byteLength > MAX_RAW_BYTES) throw new Error("MANUSCRIPT_SIZE_LIMIT");
    res.status(201).json({ success: true, data: await service.create({ bytes, title: body.title, encoding: body.encoding, fileName: body.fileName, requestKey: body.requestKey }) });
  } catch (error) { next(error); }
});

manuscriptRouter.post("/imports/:sessionId/split", async (req, res, next) => {
  try {
    const body = z.object({expectedSessionVersion:version,sourceHash:hash,mode:z.enum(["rules","manual"])}).parse(req.body);
    res.json({ success: true, data: await service.split(param(req,"sessionId"), body.expectedSessionVersion, body.sourceHash, body.mode) });
  } catch (error) { next(error); }
});

manuscriptRouter.get("/imports/:sessionId", async (req, res, next) => {
  try {
    const data = await service.get(param(req,"sessionId"));
    const from = Number(req.query.from ?? 0);
    const to = Number(req.query.to ?? from);
    if (req.query.from !== undefined || req.query.to !== undefined) {
      const source = await prisma.manuscriptSource.findUnique({ where: { id: data.sourceId }, select: { sourceText: true } });
      if (!source || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > source.sourceText.length || to - from > 100_000) throw new Error("MANUSCRIPT_RANGE_INVALID");
      res.json({ success: true, data: { ...data, text: source.sourceText.slice(from, to), range: { start: from, end: to } } });
      return;
    }
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

manuscriptRouter.put("/imports/:sessionId/partition", async (req, res, next) => {
  try {
    const body = partitionSchema.parse(req.body);
    res.json({ success: true, data: await service.partition(param(req,"sessionId"), body.expectedSessionVersion, body.sourceHash, body.units) });
  } catch (error) { next(error); }
});

manuscriptRouter.post("/imports/:sessionId/confirm", async (req, res, next) => {
  try {
    const body = z.object({expectedSessionVersion:version,sourceHash:hash,coverageHash:hash,title:z.string().trim().min(1).max(200),requestKey:key}).parse(req.body);
    res.status(201).json({ success: true, data: await service.confirm(param(req,"sessionId"), body.expectedSessionVersion, body.sourceHash, body.coverageHash, body.title, body.requestKey) });
  } catch (error) { next(error); }
});

manuscriptRouter.get("/by-novel/:novelId/workspace", async(req,res,next)=>{try{res.json({success:true,data:await workspaceService.byNovel(param(req,"novelId"),typeof req.query.unitId==="string"?req.query.unitId:undefined)});}catch(error){next(error);}});
manuscriptRouter.get("/:projectId/workspace", async(req,res,next)=>{try{res.json({success:true,data:await workspaceService.get(param(req,"projectId"),typeof req.query.unitId==="string"?req.query.unitId:undefined)});}catch(error){next(error);}});

manuscriptRouter.get("/:projectId/sources/:sourceId/text", async (req, res, next) => {
  try {
    const source = await prisma.manuscriptSource.findFirst({ where: { id: param(req,"sourceId"), projectId: param(req,"projectId") } });
    const from = Number(req.query.from ?? 0); const to = Number(req.query.to ?? source?.charCount);
    if (!source || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > source.charCount || to - from > 100_000) throw new Error("MANUSCRIPT_RANGE_INVALID");
    res.json({ success: true, data: { sourceId: source.id, sourceHash: source.sourceHash, range: { start: from, end: to }, text: source.sourceText.slice(from, to) } });
  } catch (error) { next(error); }
});

manuscriptRouter.get("/:projectId/sources/:sourceId/download", async (req, res, next) => {
  try {
    const source = await prisma.manuscriptSource.findFirst({ where: { id: param(req,"sourceId"), projectId: param(req,"projectId") } });
    if (!source) throw new Error("MANUSCRIPT_NOT_FOUND");
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="manuscript.txt"; filename*=UTF-8''${encodeURIComponent(source.originalFileName ?? "manuscript.txt")}`);
    res.send(Buffer.from(source.rawBytes));
  } catch (error) { next(error); }
});

manuscriptRouter.get("/:projectId/chapters/:chapterId/source", async (req, res, next) => {
  try {
    const unit = await prisma.manuscriptUnit.findFirst({ where: { projectId: param(req,"projectId"), chapterId: param(req,"chapterId"), status: "active" }, include: { source: true } });
    if (!unit?.source) throw new Error("MANUSCRIPT_NOT_FOUND");
    const ranges=JSON.parse(unit.sourceRangesJson);
    res.json({ success: true, data: { sourceId: unit.sourceId, ranges, text: originalUnitText(unit.source.sourceText,unit.sourceRangesJson) } });
  } catch (error) { next(error); }
});

manuscriptRouter.get("/:projectId/novel-export", async (req, res, next) => {
  try {
    const project = await prisma.manuscriptProject.findUnique({ where: { id: param(req,"projectId") }, include: { units: { where: { status: "active" }, orderBy: { displayOrder: "asc" } } } });
    if (!project?.novelId) throw new Error("MANUSCRIPT_NOT_FOUND");
    const chapters = await prisma.chapter.findMany({ where: { novelId: project.novelId, id: { in: project.units.map(unit => unit.chapterId).filter((id): id is string => Boolean(id)) } }, orderBy: { order: "asc" } });
    const text = project.units.map(unit => chapters.find(chapter => chapter.id === unit.chapterId)?.content ?? "").join("");
    res.type("text/plain; charset=utf-8").send(text);
  } catch (error) { next(error); }
});

function isCanonicalBase64(value: string): boolean { return value.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value); }


const baselineService=new ManuscriptBaselineService(),revisionService=new ManuscriptRevisionService(),structureService=new ManuscriptStructureService(),tasks=new ManuscriptTaskService();
const modelSchema=z.object({provider:z.string().max(80).optional(),model:z.string().max(160).optional(),temperature:z.number().min(0).max(2).optional(),maxRequests:z.number().int().min(1).max(4000).optional()});
const revisionBaseSchema=z.object({expectedStructureVersion:version,baseUnitRevision:version,baseContentHash:hash,baselineOutlineRevisionId:key.nullable(),baseWorkingOutlineRevisionId:key.nullable(),requestKey:key});
const baselinePreviewSchema=modelSchema.extend({sourceHash:hash,expectedStructureVersion:version,sourceType:z.enum(["author_provided","inferred_from_manuscript"]).optional(),outlineProjectId:key.optional(),outlineRevisionId:key.optional()});
function param(req:import("express").Request,key:string){return z.string().min(1).parse(req.params[key]);}
function command(path:string,run:(projectId:string,req:import("express").Request)=>Promise<unknown>){manuscriptRouter.post(path,async(req,res,next)=>{try{res.json({success:true,data:await run(param(req,"projectId"),req)});}catch(error){next(error);}});}
command("/:projectId/outline-baseline/preview",(id,req)=>baselineService.preview(id,baselinePreviewSchema.extend({requestKey:key}).parse(req.body)));
command("/:projectId/outline-baseline/confirm",(id,req)=>baselineService.confirm(id,z.object({proposalId:key,candidateRevisionId:key,sourceHash:hash,coverageHash:hash,expectedStructureVersion:version,requestKey:key}).parse(req.body)));
manuscriptRouter.get("/:projectId/proposals/:proposalId",async(req,res,next)=>{try{res.json({success:true,data:await workspaceService.proposal(param(req,"projectId"),param(req,"proposalId"))});}catch(error){next(error);}});
command("/:projectId/units/:unitId/diagnoses",(id,req)=>revisionService.diagnose(id,param(req,"unitId"),revisionBaseSchema.merge(modelSchema).parse(req.body)));
command("/:projectId/units/:unitId/revision-previews",(id,req)=>revisionService.rewrite(id,param(req,"unitId"),revisionBaseSchema.merge(modelSchema).extend({operation:z.enum(["polish","expand","compress","emotion","conflict","custom"]),instruction:z.string().max(5000),selection:z.object({from:version,to:version,text:z.string().max(12000)}).optional()}).parse(req.body)));
command("/:projectId/units/:unitId/manual-save",(id,req)=>revisionService.manualSave(id,param(req,"unitId"),revisionBaseSchema.extend({content:z.string().max(3000000)}).parse(req.body)));
command("/:projectId/units/:unitId/restore-original-preview",(id,req)=>revisionService.restore(id,param(req,"unitId"),revisionBaseSchema.parse(req.body)));
command("/:projectId/proposals/:proposalId/apply",async(id,req)=>{const row=await prisma.manuscriptRevisionProposal.findFirst({where:{id:param(req,"proposalId"),projectId:id},select:{kind:true}});if(!row)throw Error("MANUSCRIPT_NOT_FOUND");if(row.kind==="structure")return structureService.apply(id,param(req,"proposalId"),z.object({expectedStructureVersion:version,confirmImpact:z.literal(true),requestKey:key}).strict().parse(req.body));return revisionService.apply(id,param(req,"proposalId"),revisionBaseSchema.extend({candidateId:key}).parse(req.body));});
command("/:projectId/proposals/:proposalId/reject",(id,req)=>revisionService.reject(id,param(req,"proposalId")));
const structureOperationSchema=z.discriminatedUnion("kind",[z.object({kind:z.literal("insert_unit"),afterUnitId:key.nullable().optional(),beforeUnitId:key.nullable().optional(),title:z.string().trim().min(1).max(200),purpose:z.string().max(5000).optional(),content:z.string().max(3000000).optional()}),z.object({kind:z.literal("deactivate_unit"),unitId:key,expectedUnitRevision:version.optional()}),z.object({kind:z.literal("restore_unit"),unitId:key,afterUnitId:key.nullable().optional()}),z.object({kind:z.literal("merge_units"),unitIds:z.array(key).min(2).max(3000),title:z.string().trim().min(1).max(200)})]);
command("/:projectId/structure-previews",(id,req)=>structureService.preview(id,z.object({expectedStructureVersion:version,unitId:key.optional(),operations:z.array(structureOperationSchema).min(1).max(20),requestKey:key}).parse(req.body)));
command("/:projectId/changes/:proposalId/undo",(id,req)=>revisionService.undo(id,param(req,"proposalId"),z.object({expectedStructureVersion:version,expectedAfterHash:hash,requestKey:key}).parse(req.body)));
command("/:projectId/units/:unitId/sync/retry",(id,req)=>prisma.$transaction(async tx=>{const input=revisionBaseSchema.parse(req.body),unitId=param(req,"unitId"),snapshot=await takeManuscriptSnapshot(tx,id,unitId);validateManuscriptRevisionBase(snapshot,input);await assertManuscriptSnapshot(tx,id,snapshot);const s=await readManuscriptState(tx,id,unitId);if(s.unit?.status!=="active")throw Error("UNIT_INACTIVE");await queueManualChapterSync(tx,s.chapter!);return {status:"pending"};}));
command("/:projectId/tasks/:taskId/cancel",(id,req)=>tasks.cancel(id,param(req,"taskId")));
command("/:projectId/tasks/:taskId/retry",(id,req)=>tasks.retry(id,param(req,"taskId"),z.object({maxRequests:z.number().int().min(1).max(4000).optional()}).parse(req.body).maxRequests).then(()=>workspaceService.proposal(id,param(req,"taskId"))));

export const manuscriptErrorHandler:ErrorRequestHandler=(error,req,res,next)=>{
 if(error instanceof z.ZodError||error instanceof AppError)return next(error);
 const code=error instanceof Error?error.message:"";
 const messages:Record<string,string>={MANUSCRIPT_UNIT_INVALID:"章节不属于当前目录或位置已变化，请重新核对。",MANUSCRIPT_MERGE_NON_ADJACENT:"只可合并当前工作目录中相邻的章节。",BASELINE_ALREADY_CONFIRMED:"原稿大纲基线已固定；后续请编辑独立工作大纲。",MANUSCRIPT_CHAPTER_TOO_LONG:"整章超过当前修订预算，请在编辑区选中片段后生成；不会截断或改写长章其余内容。",MANUSCRIPT_CANDIDATE_INVALID:"候选不属于本次提案，请重新核对。",PARTITION_INVALID_ROLE:"请选择每个原文区域的用途。",PARTITION_DRAFT_ID_INVALID:"分章单元标识重复，请重新识别或拆分。",PARTITION_UNIT_INVALID:"请核对分章标题与确认状态。",MANUSCRIPT_NOT_FOUND:"找不到本书所属的原稿或修订记录。",MANUSCRIPT_SOURCE_INVALID:"原稿来源无效，请重新选择TXT或粘贴完整原稿。",MANUSCRIPT_EMPTY:"文件没有可导入正文。",MANUSCRIPT_SIZE_LIMIT:"原稿文件超过20 MiB上限，请缩小文件后重试。",MANUSCRIPT_CHARACTER_LIMIT:"原稿超过300万字符上限，未截断或保存部分原文。",MANUSCRIPT_RANGE_INVALID:"原文定位范围无效，请重新选择。",MANUSCRIPT_REQUEST_INVALID:"请核对作品名与本次请求。",ENCODING_CONFIRM_REQUIRED:"当前编码无法完整解码，请选择正确编码；不会保存乱码。",PARTITION_INCOMPLETE:"分章存在空白、重叠、未确认区域或没有正文章，请核对完整覆盖。",PARTITION_SURROGATE_SPLIT:"切分点位于一个完整字符内部，请移动到相邻字符。",IMPORT_VERSION_CONFLICT:"原稿分章版本有更新，请重新读取后确认。",IMPORT_ALREADY_CONFIRMED:"这份原稿已创建修订副本，请进入原书。",REQUEST_KEY_CONFLICT:"本次请求与先前确认内容不一致，请重新核对。",REVISION_BASE_STALE:"本章、前文或工作大纲有更新，候选只供对照，请重新生成。",UNIT_INACTIVE:"本章已停用，请先从结构修订恢复。",BASELINE_REQUIRED:"请先确认原稿大纲基线，再生成语义修订。",TASK_CANCELLED:"本次任务已取消，晚到结果不会改动正文。",STRUCTURE_IMPACT_CONFIRM_REQUIRED:"请核对章节结构的影响后明确确认。",MANUSCRIPT_DIRECTOR_BLOCKED:"原稿修订不会启动自动导演。请在原稿修订页逐章预览和采纳。",MANUSCRIPT_CORE_FACT_CONFIRM_REQUIRED:"核心情节变化请先在工作大纲提出并确认，不通过局部修文自动扩散。"};
 if(messages[code])return res.status(code.includes("NOT_FOUND")?404:["REVISION_BASE_STALE","IMPORT_VERSION_CONFLICT","IMPORT_ALREADY_CONFIRMED","REQUEST_KEY_CONFLICT","UNIT_INACTIVE","TASK_CANCELLED","MANUSCRIPT_DIRECTOR_BLOCKED"].includes(code)?409:422).json({success:false,error:messages[code],code});
 next(error);
};

manuscriptRouter.use(manuscriptErrorHandler);
