import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import type { ApiResponse, CreativeHubStreamFrame } from "@ai-novel/shared/types/api";
import type {
  CreativeHubMessage,
  CreativeHubThreadState,
} from "@ai-novel/shared/types/creativeHub";
import { creativeHubLangGraph } from "../creativeHub/CreativeHubLangGraph";
import { creativeHubInterruptLangGraph } from "../creativeHub/CreativeHubInterruptLangGraph";
import {
  toBindings,
} from "../creativeHub/creativeHubRuntimeHelpers";
import { authMiddleware } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { creativeHubService } from "../creativeHub/CreativeHubService";

const router = Router();

const resourceBindingsSchema = z.object({
  novelId: z.string().trim().optional().nullable(),
  chapterId: z.string().trim().optional().nullable(),
  worldId: z.string().trim().optional().nullable(),
  taskId: z.string().trim().optional().nullable(),
  bookAnalysisId: z.string().trim().optional().nullable(),
  formulaId: z.string().trim().optional().nullable(),
  baseCharacterId: z.string().trim().optional().nullable(),
  knowledgeDocumentIds: z.array(z.string().trim().min(1)).optional(),
});

const creativeHubMessageSchema: z.ZodType<CreativeHubMessage> = z.object({
  id: z.string().trim().optional(),
  type: z.enum(["system", "human", "ai", "tool"]),
  content: z.union([z.string(), z.array(z.record(z.string(), z.unknown()))]),
  name: z.string().trim().optional(),
  tool_call_id: z.string().trim().optional(),
  status: z.enum(["success", "error"]).optional(),
  tool_calls: z.array(z.object({
    id: z.string().trim(),
    name: z.string().trim(),
    args: z.record(z.string(), z.unknown()),
    partial_json: z.string().optional(),
  })).optional(),
  additional_kwargs: z.record(z.string(), z.unknown()).optional(),
});

const createThreadSchema = z.object({
  title: z.string().trim().max(120).optional(),
  resourceBindings: resourceBindingsSchema.optional(),
});

const updateThreadSchema = z.object({
  title: z.string().trim().max(120).optional(),
  archived: z.boolean().optional(),
  resourceBindings: resourceBindingsSchema.optional(),
});

const streamRunSchema = z.object({
  messages: z.array(creativeHubMessageSchema).default([]),
  checkpointId: z.string().trim().nullable().optional(),
  resourceBindings: resourceBindingsSchema.optional(),
  provider: z.enum(["deepseek", "siliconflow", "openai", "anthropic", "grok"]).optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(64).max(16384).optional(),
});

const resolveInterruptSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(2000).optional(),
});

router.use(authMiddleware);

function writeCreativeHubFrame(res: Response, frame: CreativeHubStreamFrame): void {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(frame)}\n\n`);
}

function initCreativeHubSSE(res: Response): () => void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  const heartbeat = setInterval(() => {
    writeCreativeHubFrame(res, { event: "metadata", data: { ping: true } });
  }, 15000);
  return () => clearInterval(heartbeat);
}

async function buildSeedMessages(
  threadId: string,
  checkpointId: string | null,
  incomingMessages: CreativeHubMessage[],
): Promise<CreativeHubMessage[]> {
  const baseMessages = checkpointId
    ? (await creativeHubService.getCheckpointHistoryItem(threadId, checkpointId))?.messages
    : (await creativeHubService.getThreadState(threadId)).messages;

  if (!baseMessages || baseMessages.length === 0) {
    return incomingMessages;
  }
  if (incomingMessages.length === 0) {
    return baseMessages;
  }

  const normalizeMessage = (message: CreativeHubMessage) => JSON.stringify(message);
  const baseSerialized = baseMessages.map(normalizeMessage);
  const incomingSerialized = incomingMessages.map(normalizeMessage);

  const incomingStartsWithBase = baseSerialized.length <= incomingSerialized.length
    && baseSerialized.every((message, index) => incomingSerialized[index] === message);
  if (incomingStartsWithBase) {
    return incomingMessages;
  }

  const baseStartsWithIncoming = incomingSerialized.length <= baseSerialized.length
    && incomingSerialized.every((message, index) => baseSerialized[index] === message);
  if (baseStartsWithIncoming) {
    return baseMessages;
  }

  let overlap = 0;
  const maxOverlap = Math.min(baseSerialized.length, incomingSerialized.length);
  for (let size = maxOverlap; size > 0; size -= 1) {
    const baseSuffix = baseSerialized.slice(-size);
    const incomingPrefix = incomingSerialized.slice(0, size);
    if (JSON.stringify(baseSuffix) === JSON.stringify(incomingPrefix)) {
      overlap = size;
      break;
    }
  }

  return [...baseMessages, ...incomingMessages.slice(overlap)];
}

async function buildStateResponse(threadId: string): Promise<CreativeHubThreadState> {
  return creativeHubService.getThreadState(threadId);
}

router.get("/threads", async (_req, res, next) => {
  try {
    const data = await creativeHubService.listThreads();
    res.status(200).json({
      success: true,
      data,
      message: "创作中枢线程列表加载成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/threads", validate({ body: createThreadSchema }), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createThreadSchema>;
    const data = await creativeHubService.createThread({
      title: body.title,
      resourceBindings: body.resourceBindings,
    });
    res.status(201).json({
      success: true,
      data,
      message: "创作中枢线程已创建。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.patch("/threads/:threadId", validate({
  params: z.object({ threadId: z.string().trim().min(1) }),
  body: updateThreadSchema,
}), async (req, res, next) => {
  try {
    const { threadId } = req.params as { threadId: string };
    const body = req.body as z.infer<typeof updateThreadSchema>;
    const data = await creativeHubService.updateThread(threadId, body);
    res.status(200).json({
      success: true,
      data,
      message: "创作中枢线程已更新。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.delete("/threads/:threadId", validate({
  params: z.object({ threadId: z.string().trim().min(1) }),
}), async (req, res, next) => {
  try {
    const { threadId } = req.params as { threadId: string };
    await creativeHubService.deleteThread(threadId);
    res.status(200).json({
      success: true,
      data: null,
      message: "创作中枢线程已删除。",
    } satisfies ApiResponse<null>);
  } catch (error) {
    next(error);
  }
});

router.get("/threads/:threadId/state", validate({
  params: z.object({ threadId: z.string().trim().min(1) }),
}), async (req, res, next) => {
  try {
    const { threadId } = req.params as { threadId: string };
    const data = await buildStateResponse(threadId);
    res.status(200).json({
      success: true,
      data,
      message: "创作中枢线程状态加载成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.get("/threads/:threadId/history", validate({
  params: z.object({ threadId: z.string().trim().min(1) }),
}), async (req, res, next) => {
  try {
    const { threadId } = req.params as { threadId: string };
    const data = await creativeHubService.getThreadHistory(threadId);
    res.status(200).json({
      success: true,
      data,
      message: "创作中枢线程历史加载成功。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

router.post("/threads/:threadId/generate-title", validate({
  params: z.object({ threadId: z.string().trim().min(1) }),
}), async (req, res, next) => {
  try {
    const { threadId } = req.params as { threadId: string };
    const title = await creativeHubService.generateTitle(threadId);
    res.status(200).json({
      success: true,
      data: { title },
      message: "创作中枢线程标题已生成。",
    } satisfies ApiResponse<{ title: string }>);
  } catch (error) {
    next(error);
  }
});

router.post("/threads/:threadId/runs/stream", validate({
  params: z.object({ threadId: z.string().trim().min(1) }),
  body: streamRunSchema,
}), async (req, res, next) => {
  try {
    const { threadId } = req.params as { threadId: string };
    const body = req.body as z.infer<typeof streamRunSchema>;
    const disposeHeartbeat = initCreativeHubSSE(res);
    const threadState = await creativeHubService.getThreadState(threadId);
    const parentCheckpointId = body.checkpointId ?? threadState.currentCheckpointId ?? null;
    const resourceBindings = toBindings(body.resourceBindings);
    const seedMessages = await buildSeedMessages(threadId, parentCheckpointId, body.messages);

    try {
      await creativeHubLangGraph.runThread({
        threadId,
        messages: seedMessages,
        resourceBindings,
        parentCheckpointId,
        runSettings: {
          provider: body.provider,
          model: body.model,
          temperature: body.temperature,
          maxTokens: body.maxTokens,
        },
      }, (frame) => {
        writeCreativeHubFrame(res, frame);
      });
    } catch (error) {
      writeCreativeHubFrame(res, {
        event: "creative_hub/error",
        data: { message: error instanceof Error ? error.message : "创作中枢运行失败。" },
      });
    } finally {
      disposeHeartbeat();
      if (!res.writableEnded) {
        res.end();
      }
    }
  } catch (error) {
    next(error);
  }
});

router.post("/threads/:threadId/interrupts/:interruptId", validate({
  params: z.object({
    threadId: z.string().trim().min(1),
    interruptId: z.string().trim().min(1),
  }),
  body: resolveInterruptSchema,
}), async (req, res, next) => {
  try {
    const { threadId, interruptId } = req.params as { threadId: string; interruptId: string };
    const body = req.body as z.infer<typeof resolveInterruptSchema>;
    await creativeHubInterruptLangGraph.resolveInterrupt({
      threadId,
      interruptId,
      action: body.action,
      note: body.note,
    }, () => undefined);
    const data = await buildStateResponse(threadId);
    res.status(200).json({
      success: true,
      data,
      message: body.action === "approve" ? "审批已通过，线程已更新。" : "审批已拒绝，线程已更新。",
    } satisfies ApiResponse<typeof data>);
  } catch (error) {
    next(error);
  }
});

export default router;
