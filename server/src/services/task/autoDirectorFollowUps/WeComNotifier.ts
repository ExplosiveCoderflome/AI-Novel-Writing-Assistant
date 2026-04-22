import type {
  AutoDirectorAction,
  AutoDirectorChannelAction,
  AutoDirectorChannelNotificationPayload,
  AutoDirectorEvent,
  AutoDirectorMutationActionCode,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import {
  resolveAutoDirectorBaseUrl,
  type AutoDirectorChannelConfig,
} from "../../settings/AutoDirectorChannelSettingsService";

function isChannelSafeAction(
  action: AutoDirectorAction,
): action is AutoDirectorAction & {
  kind: "mutation";
  code: "continue_auto_execution" | "retry_with_task_model";
} {
  return action.kind === "mutation"
    && (action.code === "continue_auto_execution" || action.code === "retry_with_task_model");
}

function hasCallbackSupport(config?: AutoDirectorChannelConfig | null): boolean {
  return Boolean(config?.callbackToken.trim() && config?.operatorMapJson.trim());
}

function buildCallbackAction(input: {
  actionCode: Extract<AutoDirectorMutationActionCode, "continue_auto_execution" | "retry_with_task_model">;
  label: string;
  taskId: string;
  eventId: string;
  callbackToken: string;
  baseUrl: string;
}): AutoDirectorChannelAction {
  return {
    actionCode: input.actionCode,
    label: input.label,
    kind: "callback",
    callback: {
      endpoint: `${input.baseUrl}/api/auto-director/channel-callbacks/wecom`,
      token: input.callbackToken,
      callbackId: `${input.eventId}:${input.taskId}:${input.actionCode}`,
    },
  };
}

function buildLinkAction(input: {
  actionCode: "open_detail" | "open_follow_up_center";
  label: string;
  url: string;
}): AutoDirectorChannelAction {
  return {
    actionCode: input.actionCode,
    label: input.label,
    kind: "link",
    url: input.url,
  };
}

export class WeComNotifier {
  isEnabled(config?: AutoDirectorChannelConfig | null): boolean {
    return Boolean(config?.webhookUrl.trim());
  }

  getTarget(config?: AutoDirectorChannelConfig | null): string | null {
    return config?.webhookUrl.trim() || null;
  }

  buildPayload(input: {
    event: AutoDirectorEvent;
    taskId: string;
    novelId: string | null;
    novelTitle: string;
    reasonLabel: string | null;
    checkpointSummary: string | null;
    stage: string | null;
    availableActions: AutoDirectorAction[];
    channelConfig?: AutoDirectorChannelConfig | null;
    baseUrl?: string | null;
  }): AutoDirectorChannelNotificationPayload {
    const baseUrl = resolveAutoDirectorBaseUrl(input.baseUrl);
    const followUpCenterUrl = `${baseUrl}/auto-director/follow-ups?taskId=${input.taskId}`;
    const detailUrl = `${baseUrl}/tasks?kind=novel_workflow&id=${input.taskId}`;
    const callbackActions = hasCallbackSupport(input.channelConfig)
      ? input.availableActions
        .filter(isChannelSafeAction)
        .map((action) => buildCallbackAction({
          actionCode: action.code,
          label: action.label,
          taskId: input.taskId,
          eventId: input.event.eventId,
          callbackToken: input.channelConfig?.callbackToken?.trim() || "",
          baseUrl,
        }))
      : [];

    return {
      channelType: "wecom",
      event: input.event,
      card: {
        title: "自动导演跟进提醒",
        summary: input.event.summary,
        reasonLabel: input.reasonLabel,
        stage: input.stage,
        checkpointSummary: input.checkpointSummary,
        actions: [
          ...callbackActions,
          buildLinkAction({
            actionCode: "open_detail",
            label: "查看详情",
            url: detailUrl,
          }),
          buildLinkAction({
            actionCode: "open_follow_up_center",
            label: "打开跟进中心",
            url: followUpCenterUrl,
          }),
        ],
      },
      task: {
        taskId: input.taskId,
        novelId: input.novelId,
        novelTitle: input.novelTitle,
        followUpCenterUrl,
        detailUrl,
      },
    };
  }

  async deliver(
    payload: AutoDirectorChannelNotificationPayload,
    config?: AutoDirectorChannelConfig | null,
  ): Promise<{
    target: string | null;
    status: number | null;
    body: string | null;
  }> {
    const target = this.getTarget(config);
    if (!target) {
      return {
        target: null,
        status: null,
        body: null,
      };
    }
    const response = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    return {
      target,
      status: response.status,
      body: await response.text().catch(() => null),
    };
  }
}
