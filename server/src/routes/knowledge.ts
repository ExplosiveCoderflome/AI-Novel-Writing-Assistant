import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { DocumentChapterService } from "../services/knowledge/DocumentChapterService";
import { KnowledgeService } from "../services/knowledge/KnowledgeService";

const router = Router();
const knowledgeService = new KnowledgeService();
const documentChapterService = new DocumentChapterService();

const documentStatusSchema = z.enum(["enabled", "disabled", "archived"]);
const documentKindSchema = z.enum(["user_upload", "analysis_published"]);

const listDocumentsQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  status: documentStatusSchema.optional(),
  kind: documentKindSchema.optional(),
});

const documentParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const documentVersionParamsSchema = z.object({
  id: z.string().trim().min(1),
  versionId: z.string().trim().min(1),
});

const chapterParamsSchema = documentVersionParamsSchema.extend({
  chapterIndex: z.coerce.number().int().min(0),
});

const createDocumentSchema = z.object({
  title: z.string().trim().optional(),
  fileName: z.string().trim().min(1),
  content: z.string().min(1),
});

const createVersionSchema = z.object({
  fileName: z.string().trim().optional(),
  content: z.string().min(1),
});

const activateVersionSchema = z.object({
  versionId: z.string().trim().min(1),
});

const patchChapterSchema = z.object({
  title: z.string().trim().optional(),
  summary: z.string().nullable().optional(),
}).refine((value) => value.title !== undefined || value.summary !== undefined, {
  message: "At least one field must be provided.",
});

const recallTestSchema = z.object({
  query: z.string().trim().min(1),
  limit: z.number().int().min(1).max(10).optional(),
});

const patchDocumentSchema = z.object({
  status: documentStatusSchema,
});

router.use(authMiddleware);

router.get("/documents", validate({ query: listDocumentsQuerySchema }), async (req, res, next) => {
  try {
    const query = listDocumentsQuerySchema.parse(req.query);
    const data = await knowledgeService.listDocuments(query);
    res.status(200).json({
      success: true,
      data,
      message: "Knowledge documents loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/documents", validate({ body: createDocumentSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createDocumentSchema>;
    const data = await knowledgeService.createDocument(body);
    res.status(201).json({
      success: true,
      data,
      message: "Knowledge document created.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/documents/:id", validate({ params: documentParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof documentParamsSchema>;
    const data = await knowledgeService.getDocumentById(id);
    if (!data) {
      res.status(404).json({
        success: false,
        error: "Knowledge document not found.",
      } satisfies ApiResponse<null>);
      return;
    }
    res.status(200).json({
      success: true,
      data,
      message: "Knowledge document loaded.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/documents/:id/versions",
  validate({ params: documentParamsSchema, body: createVersionSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof documentParamsSchema>;
      const data = await knowledgeService.createDocumentVersion(id, req.body as z.infer<typeof createVersionSchema>);
      res.status(201).json({
        success: true,
        data,
        message: "Knowledge document version created.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/documents/:id/activate-version",
  validate({ params: documentParamsSchema, body: activateVersionSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof documentParamsSchema>;
      const body = req.body as z.infer<typeof activateVersionSchema>;
      const data = await knowledgeService.activateVersion(id, body.versionId);
      res.status(200).json({
        success: true,
        data,
        message: "Knowledge document version activated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/documents/:id/versions/:versionId/chapters",
  validate({ params: documentVersionParamsSchema }),
  async (req, res, next) => {
    try {
      const { id, versionId } = req.params as z.infer<typeof documentVersionParamsSchema>;
      const data = await documentChapterService.ensureChaptersForVersion(versionId, id);
      res.status(200).json({
        success: true,
        data,
        message: "Document chapters loaded.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/documents/:id/versions/:versionId/chapters",
  validate({ params: documentVersionParamsSchema }),
  async (req, res, next) => {
    try {
      const { id, versionId } = req.params as z.infer<typeof documentVersionParamsSchema>;
      const data = await documentChapterService.rebuildChaptersForVersion(versionId, id);
      res.status(200).json({
        success: true,
        data,
        message: "Document chapters rebuilt.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/documents/:id/versions/:versionId/chapters/:chapterIndex",
  validate({ params: chapterParamsSchema, body: patchChapterSchema }),
  async (req, res, next) => {
    try {
      const { id, versionId, chapterIndex } = chapterParamsSchema.parse(req.params);
      const body = req.body as z.infer<typeof patchChapterSchema>;
      const data = await documentChapterService.updateChapter(versionId, chapterIndex, body, id);
      res.status(200).json({
        success: true,
        data,
        message: "Document chapter updated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post("/documents/:id/reindex", validate({ params: documentParamsSchema }), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof documentParamsSchema>;
    const data = await knowledgeService.reindexDocument(id);
    res.status(202).json({
      success: true,
      data,
      message: "Knowledge document reindex queued.",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/documents/:id/recall-test",
  validate({ params: documentParamsSchema, body: recallTestSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof documentParamsSchema>;
      const body = req.body as z.infer<typeof recallTestSchema>;
      const data = await knowledgeService.testDocumentRecall(id, body.query, body.limit);
      res.status(200).json({
        success: true,
        data,
        message: "Knowledge document recall test completed.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  "/documents/:id",
  validate({ params: documentParamsSchema, body: patchDocumentSchema }),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof documentParamsSchema>;
      const body = req.body as z.infer<typeof patchDocumentSchema>;
      const data = await knowledgeService.updateDocumentStatus(id, body.status);
      res.status(200).json({
        success: true,
        data,
        message: "Knowledge document updated.",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
