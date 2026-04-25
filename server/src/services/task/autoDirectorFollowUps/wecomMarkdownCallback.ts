import { createHmac } from "node:crypto";
import type { AutoDirectorMutationActionCode } from "@ai-novel/shared/types/autoDirectorFollowUp";

export interface WeComMarkdownCallbackInput {
  callbackId: string;
  eventId: string;
  taskId: string;
  actionCode: Extract<AutoDirectorMutationActionCode, "continue_auto_execution" | "retry_with_task_model">;
  userId?: string | null;
}

export function buildWeComMarkdownCallbackParams(input: WeComMarkdownCallbackInput): URLSearchParams {
  const params = new URLSearchParams({
    callbackId: input.callbackId,
    eventId: input.eventId,
    taskId: input.taskId,
    actionCode: input.actionCode,
  });
  if (input.userId?.trim()) {
    params.set("userId", input.userId.trim());
  }
  return params;
}

export function signWeComMarkdownCallback(
  input: WeComMarkdownCallbackInput,
  callbackToken: string,
): string {
  return createHmac("sha256", callbackToken)
    .update(buildWeComMarkdownCallbackParams(input).toString())
    .digest("hex");
}
