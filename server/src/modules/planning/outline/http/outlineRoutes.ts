import { Router } from "express";
import feedbackRoutes from "../feedback/http/feedbackRoutes";
import { z, ZodError } from "zod";
import { outlineRetrySetupSchema } from "@ai-novel/shared/types/outlineOpenBook";
import { OutlineOpenBookError } from "../openBook";
const openBookError = (e: unknown) => e instanceof ZodError ? new OutlineOpenBookError("OUTLINE_OPEN_INVALID", e.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("；"), 422) : e;
import { outlineImportPreviewService, outlineProjectService, outlineProposalService, outlineOpenBookService, outlinePolicyService } from "..";
import { exportOutlineJson, exportOutlineMarkdown } from "../application/OutlineTransferService";

const router = Router();
router.use("/:id/feedback", feedbackRoutes);
router.post("/:id/open-book/preview", async (req, res, next) => { try { res.json({success: true, data: await outlineOpenBookService.preview(String(req.params.id), req.body)}); } catch (e) { next(openBookError(e)); } });
router.post("/:id/open-book", async (req, res, next) => { try { const data = await outlineOpenBookService.confirm(String(req.params.id), req.body); res.status(data.replayed ? 200 : 201).json({success: true, data}); } catch (e) { next(openBookError(e)); } });
router.patch("/:id/book-binding/policy", async (req, res, next) => { try { res.json({success: true, data: await outlinePolicyService.update(String(req.params.id), req.body)}); } catch (e) { next(openBookError(e)); } });
router.get("/:id/book-binding", async (req, res, next) => { try { res.json({success: true, data: await outlineOpenBookService.getBinding(String(req.params.id))}); } catch (e) { next(openBookError(e)); } });
router.post("/:id/book-binding/retry-setup", async (req, res, next) => { try { res.json({success: true, data: await outlineOpenBookService.retrySetup(String(req.params.id), outlineRetrySetupSchema.parse(req.body).expectedPolicyVersion)}); } catch (e) { next(openBookError(e)); } });
const id = z.string().min(1);
const route = (handler: (req: any, res: any) => Promise<unknown>, status = 200) => async (req: any, res: any, next: any) => { try { res.status(status).json({ success: true, data: await handler(req, res) }); } catch (error) { next(error); } };
router.get("/", route(async req => outlineProjectService.list()));
router.post("/", route(async req => outlineProjectService.create(z.object({ title: z.string().min(1).max(200).optional() }).parse(req.body).title), 201));
router.post("/import/preview", route(async req => {
  const body = z.object({ title: z.string().min(1).max(200), text: z.string().min(1), format: z.enum(["markdown", "text"]) }).parse(req.body);
  const preview = await outlineImportPreviewService.preview(String(req.user?.id ?? "anonymous"), body.title, body.text, body.format);
  return { ...preview, document: preview.document, unclassified: preview.unclassified };
}));
router.post("/import/confirm", route(async req => {
  const body = z.object({ token: id, projectId: id.optional(), expectedVersion: z.number().int().optional(), document: z.unknown().optional() }).parse(req.body);
  return outlineImportPreviewService.confirm(String(req.user?.id ?? "anonymous"), body.token, body);
}));
router.post("/import/json", route(async req => {
  const body = z.object({ json: z.string(), projectId: id.optional(), expectedVersion: z.number().int().optional() }).parse(req.body);
  return outlineImportPreviewService.importJson(body.json, body);
}));
router.get("/:id", route(async req => outlineProjectService.get(id.parse(req.params.id))));
router.put("/:id/document", route(async req => {
  const body = z.object({ expectedVersion: z.number().int().min(1), document: z.unknown() }).parse(req.body);
  return outlineProjectService.save(id.parse(req.params.id), body.expectedVersion, body.document);
}));
router.get("/:id/revisions", route(async req => outlineProjectService.listRevisions(id.parse(req.params.id))));
router.get("/:id/revisions/:revisionId", route(async req => outlineProjectService.getRevision(id.parse(req.params.id), id.parse(req.params.revisionId))));
router.get("/:id/diff", route(async req => outlineProjectService.diff(id.parse(req.params.id), Number(req.query.from), Number(req.query.to))));
router.post("/:id/revisions/:revisionId/restore", route(async req => outlineProjectService.restore(id.parse(req.params.id), id.parse(req.params.revisionId), z.object({ expectedVersion: z.number().int() }).parse(req.body).expectedVersion)));
router.patch("/:id", route(async req => {
  const body = z.object({ title: z.string().min(1).max(200), expectedVersion: z.number().int() }).parse(req.body);
  const current = await outlineProjectService.get(id.parse(req.params.id));
  if (!current || current.currentVersion !== body.expectedVersion) throw new Error("OUTLINE_VERSION_CONFLICT");
  if (!current.document) throw new Error("大纲内容不存在");
  const document = { ...current.document, story: { ...current.document.story, title: body.title } };
  return outlineProjectService.save(current.id, body.expectedVersion, document);
}));
router.delete("/:id", route(async req => {
  const result = await outlineProjectService.archive(id.parse(req.params.id)); return result;
}));
router.post("/:id/proposals/generate", route(async req => {
  const body = z.object({ kind: z.enum(["edit", "initial_generation"]), requestText: z.string().min(1), scope: z.string().optional() }).parse(req.body);
  return outlineProposalService.generate(id.parse(req.params.id), body);
}));
router.get("/:id/proposals/:proposalId", route(async req => outlineProposalService.get(id.parse(req.params.id), id.parse(req.params.proposalId))));
router.post("/:id/proposals/:proposalId/apply", route(async req => {
  const body = z.object({ operationIds: z.array(z.string()).optional() }).parse(req.body);
  return outlineProposalService.apply(id.parse(req.params.id), id.parse(req.params.proposalId), body.operationIds ?? []);
}));
router.post("/:id/proposals/:proposalId/reject", route(async req => outlineProposalService.reject(id.parse(req.params.id), id.parse(req.params.proposalId))));
router.get("/:id/export", route(async req => {
  const current = await outlineProjectService.get(id.parse(req.params.id)); if (!current) throw new Error("大纲项目不存在");
  const revision = req.query.revisionId ? await outlineProjectService.getRevision(current.id, id.parse(req.query.revisionId)) : null;
  const document = revision?.document ?? current.document;
  if (!document) throw new Error("大纲内容不存在");
  const format = z.enum(["json", "markdown"]).parse(req.query.format ?? "json");
  return format === "json" ? exportOutlineJson(current.title, revision?.version ?? current.currentVersion, document) : exportOutlineMarkdown(document);
}));

export default router;
