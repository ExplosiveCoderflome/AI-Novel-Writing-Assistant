import type { Router } from "express";
import { getInvocationHistorySettings, saveInvocationHistorySettings, invocationHistorySettingsSchema } from "../../platform/llm/usage";
import { validate } from "../../middleware/validate";

export function registerInvocationHistoryRoutes(router: Router): void {
  router.get("/llm-history", async (_req, res) => {
    res.json({ success: true, data: await getInvocationHistorySettings() });
  });
  router.put("/llm-history", validate({ body: invocationHistorySettingsSchema }), async (req, res) => {
    res.json({ success: true, data: await saveInvocationHistorySettings(req.body) });
  });
}
