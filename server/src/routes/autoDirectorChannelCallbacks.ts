import { Router } from "express";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import { validate } from "../middleware/validate";
import { AutoDirectorFollowUpActionExecutor } from "../services/task/autoDirectorFollowUps/AutoDirectorFollowUpActionExecutor";
import { getAutoDirectorChannelSettings } from "../services/settings/AutoDirectorChannelSettingsService";

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

const wecomCallbackBodySchema = dingtalkCallbackBodySchema;

function resolveMappedOperatorId(mappingRaw: string, channelUserId: string, channelLabel: string): string {
  if (!mappingRaw) {
    throw new AppError(`${channelLabel} operator mapping is not configured.`, 503);
  }
  let mapping = null;
  try {
    mapping = JSON.parse(mappingRaw) as Record<string, unknown>;
  } catch {
    throw new AppError(`${channelLabel} operator mapping is invalid.`, 500);
  }
  const mapped = mapping[channelUserId];
  if (typeof mapped !== "string" || !mapped.trim()) {
    throw new AppError(`${channelLabel} operator is not mapped.`, 403);
  }
  return mapped.trim();
}

function verifyChannelToken(expected: string, token: string | undefined, channelLabel: string): void {
  if (!expected || token?.trim() !== expected) {
    throw new AppError(`Invalid ${channelLabel} callback token.`, 403);
  }
}

router.use(authMiddleware);

router.post("/dingtalk", validate({ body: dingtalkCallbackBodySchema }), async (req, res, next) => {
  try {
    const settings = await getAutoDirectorChannelSettings();
    verifyChannelToken(
      settings.dingtalk.callbackToken,
      req.header("x-auto-director-dingtalk-token") ?? undefined,
      "DingTalk",
    );
    const body = req.body as z.infer<typeof dingtalkCallbackBodySchema>;
    const operatorId = resolveMappedOperatorId(
      settings.dingtalk.operatorMapJson,
      body.userId,
      "DingTalk",
    );
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

router.post("/wecom", validate({ body: wecomCallbackBodySchema }), async (req, res, next) => {
  try {
    const settings = await getAutoDirectorChannelSettings();
    verifyChannelToken(
      settings.wecom.callbackToken,
      req.header("x-auto-director-wecom-token") ?? undefined,
      "WeCom",
    );
    const body = req.body as z.infer<typeof wecomCallbackBodySchema>;
    const operatorId = resolveMappedOperatorId(
      settings.wecom.operatorMapJson,
      body.userId,
      "WeCom",
    );
    const actionResult = await actionExecutor.execute({
      taskId: body.taskId,
      actionCode: body.actionCode,
      source: "wecom",
      operatorId,
      idempotencyKey: `wecom:${body.callbackId}`,
      metadata: {
        channelUserId: body.userId,
        callbackId: body.callbackId,
        eventId: body.eventId,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        channelType: "wecom",
        ...actionResult,
      },
      message: actionResult.message,
    } satisfies ApiResponse<{
      channelType: "wecom";
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
