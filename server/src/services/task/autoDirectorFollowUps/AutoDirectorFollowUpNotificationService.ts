import type {
  AutoDirectorAction,
  AutoDirectorChannelNotificationPayload,
  AutoDirectorEventType,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import { prisma } from "../../../db/prisma";
import { DingTalkNotifier } from "./DingTalkNotifier";
import {
  buildAutoDirectorEvent,
  detectAutoDirectorEventType,
  deriveAutoDirectorFollowUpState,
  type AutoDirectorEventWorkflowSnapshot,
} from "./autoDirectorFollowUpEventBuilder";
import { resolveAutoDirectorFollowUpReason } from "./autoDirectorFollowUpReasonResolver";

function isMissingTableError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "P2021";
}

function isDbUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? (error as { code?: string }).code : undefined;
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  return code === "P1001" || /can't reach database server/i.test(message);
}

function parseExecutionScopeLabel(seedPayloadJson: string | null | undefined): string | null {
  if (!seedPayloadJson?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(seedPayloadJson) as {
      autoExecution?: {
        scopeLabel?: unknown;
      };
    };
    return typeof parsed.autoExecution?.scopeLabel === "string" && parsed.autoExecution.scopeLabel.trim()
      ? parsed.autoExecution.scopeLabel.trim()
      : null;
  } catch {
    return null;
  }
}

export class AutoDirectorFollowUpNotificationService {
  private readonly dingTalkNotifier = new DingTalkNotifier();

  async handleTaskTransition(input: {
    before: AutoDirectorEventWorkflowSnapshot | null;
    after: AutoDirectorEventWorkflowSnapshot | null;
  }): Promise<void> {
    if (!input.after?.id) {
      return;
    }
    const before = deriveAutoDirectorFollowUpState(input.before);
    const after = deriveAutoDirectorFollowUpState(input.after);
    const eventType = detectAutoDirectorEventType({
      before,
      after,
      afterStatus: input.after.status ?? null,
    });
    if (!after || !eventType || eventType === "auto_director.progress_changed") {
      return;
    }

    const occurredAt = input.after.updatedAt ?? new Date();
    const event = buildAutoDirectorEvent({
      eventType,
      after,
      occurredAt,
    });
    await this.notifyDingTalk({
      event,
      after: input.after,
    });
  }

  private resolveAvailableActions(input: AutoDirectorEventWorkflowSnapshot): AutoDirectorAction[] {
    const resolved = resolveAutoDirectorFollowUpReason({
      status: input.status,
      checkpointType: input.checkpointType,
      pendingManualRecovery: input.pendingManualRecovery,
      executionScopeLabel: parseExecutionScopeLabel(input.seedPayloadJson),
    });
    return resolved?.availableActions ?? [];
  }

  private async notifyDingTalk(input: {
    event: ReturnType<typeof buildAutoDirectorEvent>;
    after: AutoDirectorEventWorkflowSnapshot;
  }) {
    if (!this.dingTalkNotifier.isEnabled()) {
      return;
    }
    const reasonResolved = resolveAutoDirectorFollowUpReason({
      status: input.after.status,
      checkpointType: input.after.checkpointType,
      pendingManualRecovery: input.after.pendingManualRecovery,
      executionScopeLabel: parseExecutionScopeLabel(input.after.seedPayloadJson),
    });
    const payload = this.dingTalkNotifier.buildPayload({
      event: input.event,
      taskId: input.after.id,
      novelId: input.after.novelId,
      novelTitle: input.after.novel?.title?.trim() || input.after.id,
      reasonLabel: reasonResolved?.reasonLabel ?? null,
      checkpointSummary: input.after.checkpointSummary ?? null,
      stage: input.after.currentStage,
      availableActions: this.resolveAvailableActions(input.after),
    });

    let responseStatus = null;
    let responseBody = null;
    let deliveredAt = null;
    let status: "delivered" | "failed" = "failed";
    let target: string | null = null;

    try {
      const delivered = await this.dingTalkNotifier.deliver(payload);
      target = delivered.target;
      responseStatus = delivered.status;
      responseBody = delivered.body;
      if (typeof delivered.status === "number" && delivered.status >= 200 && delivered.status < 300) {
        status = "delivered";
        deliveredAt = new Date();
      }
    } catch (error) {
      responseBody = error instanceof Error ? error.message : "delivery_failed";
    }

    await this.recordNotificationLog({
      eventId: input.event.eventId,
      eventType: input.event.eventType,
      taskId: input.after.id,
      channelType: "dingtalk",
      target,
      payload,
      responseBody,
      responseStatus,
      deliveredAt,
      status,
    });
  }

  private async recordNotificationLog(input: {
    eventId: string;
    eventType: AutoDirectorEventType;
    taskId: string;
    channelType: "dingtalk";
    target: string | null;
    payload: AutoDirectorChannelNotificationPayload;
    responseBody: string | null;
    responseStatus: number | null;
    deliveredAt: Date | null;
    status: "delivered" | "failed";
  }) {
    try {
      await prisma.autoDirectorFollowUpNotificationLog.create({
        data: {
          eventId: input.eventId,
          eventType: input.eventType,
          taskId: input.taskId,
          channelType: input.channelType,
          target: input.target,
          requestPayload: JSON.stringify(input.payload),
          responseBody: input.responseBody,
          responseStatus: input.responseStatus,
          attemptCount: 1,
          deliveredAt: input.deliveredAt,
          status: input.status,
        },
      });
    } catch (error) {
      if (isMissingTableError(error) || isDbUnavailableError(error)) {
        return;
      }
      throw error;
    }
  }
}
