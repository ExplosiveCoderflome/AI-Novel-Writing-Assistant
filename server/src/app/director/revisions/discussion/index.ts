import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../../../db/prisma";
import { streamAgentReply } from "../../../../modules/agentConversation";
import { id, addressSchema, ReviewConversation, type ReviewSubject } from "./ReviewConversation";
export type { Address } from "./ReviewConversation";

export function reviewConversationRouter<F extends string, R extends { base: Record<F,string> }>(route: string, subject: ReviewSubject<F,R>) {
  const service = new ReviewConversation(prisma, subject);
  const messageSchema = z.object({ requestText: z.string().trim().min(1).max(4000), requestId: id, parentResultId: id.optional(),
    base: subject.draft, draft: subject.draft }).strict();
  const router = Router();
  router.get(route, async (req, res) => {
    res.json({ success: true, data: await service.history(addressSchema.parse(req.params)) });
  });
  router.post(`${route}/turns`, async (req, res) => {
    const receipt = await service.send(addressSchema.parse(req.params), messageSchema.parse(req.body));
    res.status(202).json({ success: true, data: receipt });
  });
  router.get(`${route}/turns/:id/stream`, async (req, res) => {
    streamAgentReply(res, req.params.id, await service.turnStatus(addressSchema.parse(req.params), req.params.id));
  });
  router.post(`${route}/turns/:id/interrupt`, async (req, res) => {
    await service.interrupt(addressSchema.parse(req.params), req.params.id);
    res.json({ success: true });
  });
  return router;
}
