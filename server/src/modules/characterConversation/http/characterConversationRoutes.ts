import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../../../middleware/auth";
import { validate } from "../../../middleware/validate";
import { characterConversationService } from "../../../services/characterConversation/CharacterConversationService";

const subjectSchema = z.object({
  kind: z.enum(["novel_character", "base_character", "book_analysis_character", "drama_character"]),
  id: z.string().trim().min(1),
  scopeKind: z.enum(["novel", "base_library", "book_analysis", "drama_project"]),
  scopeId: z.string().trim().min(1).nullable().optional(),
  chapterAnchor: z.coerce.number().int().positive().optional(),
});
const sessionSchema = subjectSchema.extend({ sessionId: z.string().trim().min(1) });
const turnSchema = sessionSchema.extend({ message: z.string().trim().min(1).max(800) });

export function parseCharacterConversationSubjectQuery(query: unknown) {
  return subjectSchema.parse(query);
}

const router = Router();
router.use(authMiddleware);

router.get("/context", validate({ query: subjectSchema }), async (req, res, next) => {
  try {
    const data = await characterConversationService.getContext(parseCharacterConversationSubjectQuery(req.query));
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (error) { next(error); }
});
router.get("/sessions/active", validate({ query: subjectSchema }), async (req, res, next) => {
  try {
    const data = await characterConversationService.getActiveSession(parseCharacterConversationSubjectQuery(req.query));
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (error) { next(error); }
});
router.post("/sessions", validate({ body: subjectSchema }), async (req, res, next) => {
  try {
    const data = await characterConversationService.startSession(req.body as z.infer<typeof subjectSchema>);
    res.status(201).json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (error) { next(error); }
});
router.post("/sessions/:sessionId/turns", validate({ params: z.object({ sessionId: z.string().trim().min(1) }), body: subjectSchema.extend({ message: z.string().trim().min(1).max(800) }) }), async (req, res, next) => {
  try {
    const { message, ...subject } = req.body as z.infer<typeof turnSchema>;
    const data = await characterConversationService.sendTurn(subject, String(req.params.sessionId), message);
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (error) { next(error); }
});
router.post("/sessions/:sessionId/influence/activate", validate({ params: z.object({ sessionId: z.string().trim().min(1) }), body: subjectSchema }), async (req, res, next) => {
  try {
    const data = await characterConversationService.activateInfluence(req.body as z.infer<typeof subjectSchema>, String(req.params.sessionId));
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (error) { next(error); }
});
router.post("/sessions/:sessionId/influence/dismiss", validate({ params: z.object({ sessionId: z.string().trim().min(1) }), body: subjectSchema }), async (req, res, next) => {
  try {
    const data = await characterConversationService.dismissInfluence(req.body as z.infer<typeof subjectSchema>, String(req.params.sessionId));
    res.json({ success: true, data } satisfies ApiResponse<typeof data>);
  } catch (error) { next(error); }
});

export default router;
