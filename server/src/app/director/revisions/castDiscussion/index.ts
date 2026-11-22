import { Router } from "express";
import { prisma } from "../../../../db/prisma";
import { streamAgentReply } from "../../../../modules/agentConversation";
import { CastConversation, castAddressSchema, castMessageSchema } from "./CastConversation";

export { confirmedCastForPlanning } from "./planningContext";

export function castConversationRouter(service = new CastConversation(prisma)) {
  const router = Router();
  const route = "/novels/:novelId/runs/:runId/cast-review/:version/characters/:characterId/conversation";
  router.get(route, async (req, res) => {
    res.json({ success: true, data: await service.history(castAddressSchema.parse(req.params)) });
  });
  router.post(`${route}/turns`, async (req, res) => {
    const receipt = await service.send(castAddressSchema.parse(req.params), castMessageSchema.parse(req.body));
    res.status(202).json({ success: true, data: receipt });
  });
  router.get(`${route}/turns/:id/stream`, async (req, res) => {
    streamAgentReply(res, req.params.id, await service.turnStatus(castAddressSchema.parse(req.params), req.params.id));
  });
  router.post(`${route}/turns/:id/interrupt`, async (req, res) => {
    await service.interrupt(castAddressSchema.parse(req.params), req.params.id);
    res.json({ success: true });
  });
  return router;
}
