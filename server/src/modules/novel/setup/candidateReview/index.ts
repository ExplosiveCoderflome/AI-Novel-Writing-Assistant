import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../../../db/prisma";
import { streamAgentReply } from "../../../agentConversation";
import { CandidateConversation, candidateApplyBody } from "./CandidateConversation";

const id = z.string().trim().min(1).max(160);
const sendBody = z.object({
  requestId: id, requestText: z.string().trim().min(1).max(4000), parentResultId: id.optional(),
  revision: z.number().int().nonnegative(),
}).strict();
const route = "/tasks/:taskId/batches/:batchId/candidates/:candidateId/conversation";
export function candidateConversationRouter(service = new CandidateConversation(prisma)) {
  const router = Router();
  router.get(route, async (req, res) => {
    res.json({ success: true, data: await service.history(req.params) });
  });
  router.post(`${route}/turns`, async (req, res) => {
    res.status(202).json({ success: true, data: await service.send(req.params, sendBody.parse(req.body)) });
  });
  router.get(`${route}/turns/:id/stream`, async (req, res) => {
    streamAgentReply(res, req.params.id, await service.streamStatus(req.params, req.params.id));
  });
  router.post(`${route}/turns/:id/interrupt`, async (req, res) => {
    await service.interrupt(req.params, req.params.id);
    res.json({ success: true });
  });
  router.post(`${route}/proposals/:id/apply`, async (req, res) => {
    res.json({ success: true, data: await service.apply(req.params, req.params.id, candidateApplyBody.parse(req.body).fields) });
  });
  return router;
}
