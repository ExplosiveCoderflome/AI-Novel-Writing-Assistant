import { Router } from "express";
import { z } from "zod";
import type { LlmLiveStreamFrame } from "@ai-novel/shared/types/llmLive";
import { validate } from "../../../../middleware/validate";
import { llmLiveBroker } from "../LlmLiveBroker";

const router = Router();

const streamQuerySchema = z.object({
  taskId: z.string().trim().min(1).optional(),
  interactionId: z.string().trim().min(1).optional(),
});

function writeFrame(res: import("express").Response, frame: LlmLiveStreamFrame, eventId?: number): void {
  if (res.writableEnded) {
    return;
  }
  if (eventId != null) {
    res.write("id: " + eventId + "\n");
  }
  res.write("event: llm_live\n");
  res.write("data: " + JSON.stringify(frame) + "\n\n");
}

router.get("/stream", validate({ query: streamQuerySchema }), (req, res) => {
  const query = streamQuerySchema.parse(req.query);
  const filter = {
    taskId: query.taskId,
    interactionId: query.interactionId,
  };
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  writeFrame(res, {
    type: "snapshot",
    sessions: llmLiveBroker.getSnapshots(filter),
  });
  const unsubscribe = llmLiveBroker.subscribe(filter, (event) => {
    writeFrame(res, { type: "event", event }, event.seq);
  });
  const heartbeat = setInterval(() => writeFrame(res, { type: "ping" }), 15_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export default router;
