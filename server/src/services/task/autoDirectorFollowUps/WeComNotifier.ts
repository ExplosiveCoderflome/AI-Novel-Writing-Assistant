import type {
  AutoDirectorAction,
  AutoDirectorChannelNotificationPayload,
  AutoDirectorEvent,
  AutoDirectorMutationActionCode,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import {
  resolveAutoDirectorBaseUrl,
  type AutoDirectorChannelConfig,
} from "../../settings/AutoDirectorChannelSettingsService";
import { buildWeComMarkdownCallbackParams, signWeComMarkdownCallback } from "./wecomMarkdownCallback";

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

function buildMarkdownLink(label: string, url: string): string {
  return `[${label}](${url})`;
}

function buildMarkdownCallbackLink(input: {
  actionCode: Extract<AutoDirectorMutationActionCode, "continue_auto_execution" | "retry_with_task_model">;
  label: string;
  taskId: string;
  eventId: string;
  callbackToken: string;
  baseUrl: string;
}): string {
  const query = buildWeComMarkdownCallbackParams({
    callbackId: `${input.eventId}:${input.taskId}:${input.actionCode}`,
    eventId: input.eventId,
    taskId: input.taskId,
    actionCode: input.actionCode,
  });
  const signature = signWeComMarkdownCallback({
    callbackId: `${input.eventId}:${input.taskId}:${input.actionCode}`,
    eventId: input.eventId,
    taskId: input.taskId,
    actionCode: input.actionCode,
  }, input.callbackToken);
  query.set("signature", signature);
  return buildMarkdownLink(
    input.label,
    `${input.baseUrl}/api/auto-director/channel-callbacks/wecom/execute?${query.toString()}`,
  );
}

function buildMarkdownContent(input: {
  event: AutoDirectorEvent;
  taskId: string;
  novelTitle: string;
  reasonLabel: string | null;
  checkpointSummary: string | null;
  stage: string | null;
  availableActions: AutoDirectorAction[];
  channelConfig?: AutoDirectorChannelConfig | null;
  baseUrl?: string | null;
}): string {
  const baseUrl = resolveAutoDirectorBaseUrl(input.baseUrl);
  const followUpCenterUrl = `${baseUrl}/auto-director/follow-ups?taskId=${input.taskId}`;
  const detailUrl = `${baseUrl}/tasks?kind=novel_workflow&id=${input.taskId}`;
  const lines = [
    "# 自动导演跟进提醒",
    "",
    `> 小说：${input.novelTitle}`,
    `> 事件：${input.event.summary}`,
  ];

  if (input.reasonLabel?.trim()) {
    lines.push(`> 原因：${input.reasonLabel.trim()}`);
  }
  if (input.stage?.trim()) {
    lines.push(`> 阶段：${input.stage.trim()}`);
  }
  if (input.checkpointSummary?.trim()) {
    lines.push(`> 摘要：${input.checkpointSummary.trim()}`);
  }

  lines.push("", "## 操作");

  if (hasCallbackSupport(input.channelConfig)) {
    for (const action of input.availableActions.filter(isChannelSafeAction)) {
      lines.push(
        `- ${buildMarkdownCallbackLink({
          actionCode: action.code,
          label: action.label,
          taskId: input.taskId,
          eventId: input.event.eventId,
          callbackToken: input.channelConfig?.callbackToken?.trim() || "",
          baseUrl,
        })}`,
      );
    }
  }

  lines.push(`- ${buildMarkdownLink("查看详情", detailUrl)}`);
  lines.push(`- ${buildMarkdownLink("打开跟进中心", followUpCenterUrl)}`);

  return lines.join("\n");
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
    return {
      channelType: "wecom",
      msgtype: "markdown",
      markdown: {
        content: buildMarkdownContent(input),
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
