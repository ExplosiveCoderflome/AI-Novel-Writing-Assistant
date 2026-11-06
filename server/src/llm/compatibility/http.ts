import type { Router } from "express";
import { z } from "zod";
import { llmProviderSchema } from "../providerSchema";
import { resolveLLMClientOptions } from "../factory";
import { capabilityProfileSchema } from "./profile";
import { loadCapability, saveCapability } from "./store";
import { autoProbeEnabled, setAutoProbe, probeStatus, startProbe } from "./probe";
import { validate } from "../../middleware/validate";

const params = z.object({ provider: llmProviderSchema });
const body = z.object({ model: z.string().trim().min(1), baseURL: z.string().url().optional(), allowNetwork: z.literal(true) });
export function registerModelCompatibilityRoutes(router: Router): void {
  router.get("/model-compat/:provider", validate({ params }), async (req, res, next) => {
    try {
      const provider = params.parse(req.params).provider;
      const resolved = await resolveLLMClientOptions(provider);
      const identity = { provider, model: resolved.model, baseURL: resolved.baseURL };
      res.json({ success: true, data: { profile: await loadCapability(identity), status: await probeStatus(identity), autoProbe: await autoProbeEnabled(provider) } });
    } catch (error) { next(error); }
  });
  router.post("/model-compat/:provider/probe", validate({ params, body }), async (req, res, next) => {
    try {
      const provider = params.parse(req.params).provider;
      const input = body.parse(req.body);
      const resolved = await resolveLLMClientOptions(provider, { model: input.model, baseURL: input.baseURL });
      await startProbe({ provider, model: resolved.model, baseURL: resolved.baseURL }, input.allowNetwork);
      res.status(202).json({ success: true, data: { state: "running" } });
    } catch (error) { next(error); }
  });
  router.put("/model-compat/:provider", validate({ params, body: z.object({ autoProbe: z.boolean().optional(), override: capabilityProfileSchema.optional() }) }), async (req, res, next) => {
    try {
      const provider = params.parse(req.params).provider;
      const resolved = await resolveLLMClientOptions(provider);
      if (req.body.autoProbe !== undefined) {
        await setAutoProbe(provider, req.body.autoProbe);
        if (req.body.autoProbe) await startProbe({ provider, model: resolved.model, baseURL: resolved.baseURL }, true);
      }
      if (req.body.override) await saveCapability({ provider, model: resolved.model, baseURL: resolved.baseURL }, { ...req.body.override, source: "user_override" });
      res.json({ success: true });
    } catch (error) { next(error); }
  });
}
