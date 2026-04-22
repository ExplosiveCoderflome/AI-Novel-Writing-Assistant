import type {
  AutoDirectorAction,
  AutoDirectorChannelAction,
  AutoDirectorChannelNotificationPayload,
  AutoDirectorEvent,
  AutoDirectorMutationActionCode,
} from "@ai-novel/shared/types/autoDirectorFollowUp";

function getBaseUrl(): string {
  return (process.env.APP_BASE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}

function isChannelSafeAction(
  action: AutoDirectorAction,
): action is AutoDirectorAction & {
  kind: "mutation";
  code: "continue_auto_execution" | "retry_with_task_model";
} {
  return action.kind === "mutation"
    && (action.code === "continue_auto_execution" || action.code === "retry_with_task_model");
}

function buildCallbackAction(input: {
  actionCode: Extract<AutoDirectorMutationActionCode, "continue_auto_execution" | "retry_with_task_model">;
  label: string;
  taskId: string;
  eventId: string;
}): AutoDirectorChannelAction {
  const callbackToken = process.env.AUTO_DIRECTOR_DINGTALK_CALLBACK_TOKEN?.trim() || "";
  return {
    actionCode: input.actionCode,
    label: input.label,
    kind: "callback",
    callback: {
      endpoint: `${getBaseUrl()}/api/auto-director/channel-callbacks/dingtalk`,
      token: callbackToken,
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

export class DingTalkNotifier {
  isEnabled(): boolean {
    return Boolean(process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL?.trim());
  }

  getTarget(): string | null {
    return process.env.AUTO_DIRECTOR_DINGTALK_WEBHOOK_URL?.trim() || null;
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
  }): AutoDirectorChannelNotificationPayload {
    const baseUrl = getBaseUrl();
    const followUpCenterUrl = `${baseUrl}/auto-director/follow-ups?taskId=${input.taskId}`;
    const detailUrl = `${baseUrl}/tasks?kind=novel_workflow&id=${input.taskId}`;
    const callbackActions = input.availableActions
      .filter(isChannelSafeAction)
      .map((action) => buildCallbackAction({
        actionCode: action.code,
        label: action.label,
        taskId: input.taskId,
        eventId: input.event.eventId,
      }));

    return {
      channelType: "dingtalk",
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

  async deliver(payload: AutoDirectorChannelNotificationPayload): Promise<{
    target: string | null;
    status: number | null;
    body: string | null;
  }> {
    const target = this.getTarget();
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
