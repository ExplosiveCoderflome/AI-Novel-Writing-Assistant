import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { AutoDirectorFollowUpActionExecutor } from "../services/task/autoDirectorFollowUps/AutoDirectorFollowUpActionExecutor";

const router = Router();
const actionExecutor = new AutoDirectorFollowUpActionExecutor();

const dingtalkCallbackBodySchema = z.object({
  userId: z.string().trim().min(1),
  callbackId: z.string().trim().min(1),
  eventId: z.string().trim().min(1),
  taskId: z.string().trim().min(1),
  actionCode: z.enum([
    "continue_auto_execution",
    "retry_with_task_model",
  ]),
});

function resolveMappedOperatorId(channelUserId: string): string {
  const mappingRaw = process.env.AUTO_DIRECTOR_DINGTALK_OPERATOR_MAP_JSON?.trim();
  if (!mappingRaw) {
    throw new AppError("DingTalk operator mapping is not configured.", 503);
  }
  let mapping = null;
  try {
    mapping = JSON.parse(mappingRaw) as Record<string, unknown>;
  } catch {
    throw new AppError("DingTalk operator mapping is invalid.", 500);
  }
  const mapped = mapping[channelUserId];
  if (typeof mapped !== "string" || !mapped.trim()) {
    throw new AppError("DingTalk operator is not mapped.", 403);
  }
  return mapped.trim();
}

function verifyDingTalkToken(token: string | undefined): void {
  const expected = process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN?.trim();
  if (!expected || token?.trim() !== expected) {
    throw new AppError("Invalid DingTalk callback token.", 403);
  }
}

router.use(authMiddleware);

router.post("/dingtalk", validate({ body: dingtalkCallbackBodySchema }), async (req, res, next) => {
  try {
    verifyDingTalkToken(req.header("x-auto-director-dingtalk-token") ?? undefined);
    const body = req.body as z.infer<typeof dingtalkCallbackBodySchema>;
    const operatorId = resolveMappedOperatorId(body.userId);
    const actionResult = await actionExecutor.execute({
      taskId: body.taskId,
      actionCode: body.actionCode,
      source: "dingtalk",
      operatorId,
      idempotencyKey: `dingtalk:${body.callbackId}`,
      metadata: {
        channelUserId: body.userId,
        callbackId: body.callbackId,
        eventId: body.eventId,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        channelType: "dingtalk",
        ...actionResult,
      },
      message: actionResult.message,
    } satisfies ApiResponse<{
      channelType: "dingtalk";
      taskId: string;
      actionCode: string;
      code: string;
      message: string;
      task?: unknown;
    }>);
  } catch (error) {
    next(error);
  }
});

export default router;
