import * as lark from "@larksuiteoapi/node-sdk";
import { z } from "zod";
import type { AutoDirectorActionRequest, AutoDirectorChannelNotificationPayload } from "@ai-novel/shared/types/autoDirectorFollowUp";
import { getAutoDirectorChannelSettings, onAutoDirectorChannelSettingsChanged, type FeishuChannelConfig } from "../../../../settings/AutoDirectorChannelSettingsService";

const actionSchema = z.object({
  taskId: z.string().min(1), eventId: z.string().min(1),
  actionCode: z.enum(["continue_auto_execution", "retry_with_task_model"]),
});
type CardActionEvent = {
  operator: {open_id: string; user_id?: string};
  action: {value: unknown};
  context: {open_message_id: string};
};

type ExecuteAction = (input: AutoDirectorActionRequest) => Promise<{code: string; message: string}>;
const executeAction: ExecuteAction = input => {
  const {AutoDirectorFollowUpActionExecutor} = require("../../AutoDirectorFollowUpActionExecutor") as typeof import("../../AutoDirectorFollowUpActionExecutor");
  return new AutoDirectorFollowUpActionExecutor().execute(input);
};

export function buildFeishuCard(payload: AutoDirectorChannelNotificationPayload) {
  const card = payload.card!;
  return {
    schema: "2.0",
    config: {update_multi: true},
    header: {title: {tag: "plain_text", content: card.title}, template: "blue"},
    body: {elements: [
      {tag: "markdown", content: [payload.task?.novelTitle, card.summary, card.reasonLabel, card.stage, card.checkpointSummary].filter(Boolean).join("\n\n")},
      {tag: "column_set", columns: card.actions.filter(action => action.kind === "callback").map(action => ({
        tag: "column", width: "weighted", weight: 1,
        elements: [{tag: "button", text: {tag: "plain_text", content: action.label}, type: "primary",
          behaviors: [{type: "callback", value: {taskId: payload.task!.taskId, eventId: payload.event!.eventId, actionCode: action.actionCode}}]},
        ],
      }))},
    ].filter(element => element.tag !== "column_set" || element.columns!.length > 0)},
  };
}

function processedCard(message: string, success: boolean) {
  return {schema: "2.0", header: {title: {tag: "plain_text", content: success ? "操作已处理" : "操作未完成"}, template: success ? "green" : "orange"},
    body: {elements: [{tag: "markdown", content: message}]}};
}

export class FeishuChannel {
  private ws: lark.WSClient | null = null;
  private client: lark.Client | null = null;
  private config: FeishuChannelConfig | null = null;
  private connectionKey = "";
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly sdk = lark, private readonly execute = executeAction) {}

  async start(): Promise<void> {
    if (this.unsubscribe) return;
    this.unsubscribe = onAutoDirectorChannelSettingsChanged(settings => this.configure(settings.feishu));
    const settings = await getAutoDirectorChannelSettings();
    if (this.unsubscribe !== null) this.configure(settings.feishu);
  }

  configure(config: FeishuChannelConfig): void {
    this.config = config;
    const key = JSON.stringify([config.enabled, config.appId, config.appSecret, config.domain]);
    if (key === this.connectionKey) return;
    this.stopConnection();
    this.connectionKey = key;
    if (!config.enabled || !config.appId || !config.appSecret) return;
    const credentials = {appId: config.appId, appSecret: config.appSecret, domain: config.domain === "lark" ? this.sdk.Domain.Lark : this.sdk.Domain.Feishu};
    this.client = new this.sdk.Client(credentials);
    const client = this.client;
    // Capture the connection's app credentials; never update an old card through a replacement app.
    const dispatcher = new this.sdk.EventDispatcher({}).register({
      "card.action.trigger": (event: CardActionEvent) => {
        const parsed = actionSchema.safeParse(event.action.value);
        if (!parsed.success) return {toast: {type: "error", content: "操作参数无效，请打开小说工作台。"}};
        let mapping: Record<string, unknown>;
        try {
          mapping = JSON.parse(this.config!.operatorMapJson || "{}");
        } catch {
          return {toast: {type: "error", content: "用户映射格式无效，请检查渠道设置中的 JSON。"}};
        }
        const operatorId = mapping?.[event.operator.open_id] || (event.operator.user_id ? mapping?.[event.operator.user_id] : undefined);
        if (typeof operatorId !== "string" || !operatorId.trim()) return {toast: {type: "error", content: "请在渠道设置中配置此用户的映射。"}};
        void this.handleAction(event, operatorId.trim(), client).catch(() => {
          console.warn("[feishu] card action or card update failed; inspect the task on its source page.");
        });
        return {toast: {type: "info", content: "正在处理，请等待卡片更新。"}};
      },
    });
    this.ws = new this.sdk.WSClient(credentials);
    void this.ws.start({eventDispatcher: dispatcher}).catch(() => {
      console.warn("[feishu] long connection failed; check app credentials and callback configuration.");
    });
  }

  async handleAction(event: CardActionEvent, operatorId: string, client = this.client!): Promise<void> {
    const value = actionSchema.parse(event.action.value);
    let result: {code: string; message: string};
    try {
      result = await this.execute({taskId: value.taskId, actionCode: value.actionCode, source: "feishu", operatorId,
        idempotencyKey: `feishu:${value.eventId}:${value.taskId}:${value.actionCode}`,
        metadata: {eventId: value.eventId, channelUserId: event.operator.open_id}});
    } catch {
      result = {code: "failed", message: "操作未完成，请打开小说工作台查看任务状态。"};
    }
    const response = await client.im.message.patch({path: {message_id: event.context.open_message_id}, data: {
      content: JSON.stringify(processedCard(result.message, result.code === "executed" || result.code === "already_processed")),
    }});
    if (response.code !== 0) throw new Error(`Feishu card update failed: ${response.code}`);
  }

  async deliver(payload: AutoDirectorChannelNotificationPayload, config: FeishuChannelConfig) {
    this.configure(config);
    if (!this.client || !config.receiveId) throw new Error("Feishu channel is not configured.");
    const response = await this.client.im.message.create({params: {receive_id_type: config.receiveIdType}, data: {
      receive_id: config.receiveId, msg_type: "interactive", content: JSON.stringify(buildFeishuCard(payload)),
    }});
    return {target: config.receiveId, status: response.code === 0 ? 200 : 502, body: JSON.stringify(response)};
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stopConnection();
    this.connectionKey = "";
  }

  private stopConnection(): void {
    this.ws?.close({force: true});
    this.ws = null;
    this.client = null;
  }
}

export const feishuChannel = new FeishuChannel();
