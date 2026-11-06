const {stubDatabaseMethod} = require("./legacyDirector/databasePorts");
const test = require("node:test");
const assert = require("node:assert/strict");
const {createHmac} = require("node:crypto");
const {DingTalkNotifier, signDingTalkWebhook} = require("../dist/services/task/autoDirectorFollowUps/DingTalkNotifier");
const {WeComNotifier} = require("../dist/services/task/autoDirectorFollowUps/WeComNotifier");
const {FeishuChannel, buildFeishuCard} = require("../dist/services/task/autoDirectorFollowUps/channels/feishu");
const {signWeComMarkdownCallback} = require("../dist/services/task/autoDirectorFollowUps/wecomMarkdownCallback");

const config = {webhookUrl: "https://oapi.dingtalk.com/robot/send?access_token=token", secret: "SEC_test", callbackToken: "callback", operatorMapJson: '{"ou_1":"user_1"}', eventTypes: []};
const input = {event: {eventId: "evt_1", summary: "测试通知", eventType: "auto_director.approval_required"}, taskId: "run_1", novelId: "book_1", novelTitle: "测试通知", reasonLabel: null, checkpointSummary: null, stage: "测试通知", availableActions: [
  {kind: "mutation", code: "continue_auto_execution", label: "操作"},
  {kind: "mutation", code: "retry_with_task_model", label: "操作"},
  {kind: "mutation", code: "safe_fix_validation", label: "操作"},
], channelConfig: config, baseUrl: "https://book.example.test"};

test("DingTalk uses official actionCard payload, signed URLs and signed action links", async t => {
  t.mock.method(Date, "now", () => 1730000000000);
  let sent;
  t.mock.method(global, "fetch", async (url, options) => {sent = {url, body: JSON.parse(options.body)}; return {status: 200, text: async () => '{"errcode":0}'};});
  const notifier = new DingTalkNotifier();
  await notifier.deliver(notifier.buildPayload(input), config);
  assert.deepEqual(Object.keys(sent.body).sort(), ["actionCard", "msgtype"]);
  assert.equal(sent.body.msgtype, "actionCard");
  assert.equal(sent.body.actionCard.btns.length, 4);
  const expected = createHmac("sha256", config.secret).update(`${Date.now()}\n${config.secret}`).digest("base64");
  assert.equal(sent.url, `${config.webhookUrl}&timestamp=${Date.now()}&sign=${encodeURIComponent(expected)}`);
  const callback = new URL(sent.body.actionCard.btns[0].actionURL);
  assert.equal(callback.pathname, "/api/auto-director/channel-callbacks/dingtalk/execute");
  const params = Object.fromEntries(callback.searchParams);
  assert.equal(params.actionCode, "continue_auto_execution");
  assert.equal(params.signature, signWeComMarkdownCallback(params, config.callbackToken));
  assert.equal(new URL(signDingTalkWebhook(config.webhookUrl, config.secret, 42)).searchParams.get("timestamp"), "42");
  await notifier.deliver(notifier.buildPayload(input), {...config, secret: ""});
  assert.equal(sent.url, config.webhookUrl);
});

test("WeCom delivers only official markdown fields", async t => {
  let body;
  t.mock.method(global, "fetch", async (_url, options) => {body = JSON.parse(options.body); return {status: 200, text: async () => '{"errcode":0}'};});
  const notifier = new WeComNotifier();
  await notifier.deliver(notifier.buildPayload(input), config);
  assert.deepEqual(Object.keys(body).sort(), ["markdown", "msgtype"]);
  assert.match(body.markdown.content, /continue_auto_execution/);
});

function mockedSdk() {
  const sockets = [], messages = [], updates = [], dispatchers = [];
  class WSClient {
    constructor(options) {this.options = options; sockets.push(this);}
    async start({eventDispatcher}) {this.dispatcher = eventDispatcher;}
    close() {this.closed = true;}
  }
  class EventDispatcher {
    register(handlers) {this.handlers = handlers; dispatchers.push(this); return this;}
  }
  class Client {
    im = {message: {
      create: async input => {messages.push(input); return {code: 0};},
      patch: async input => {updates.push(input); return {code: 0};},
    }};
  }
  return {sdk: {WSClient, EventDispatcher, Client, Domain: {Feishu: "feishu", Lark: "lark"}}, sockets, messages, updates, dispatchers};
}
const feishuConfig = {enabled: true, appId: "app_1", appSecret: "secret", receiveId: "chat_1", receiveIdType: "chat_id", domain: "feishu", operatorMapJson: '{"ou_1":"user_1"}', eventTypes: []};
function feishuPayload() {
  const payload = new DingTalkNotifier().buildPayload(input);
  payload.channelType = "feishu";
  return payload;
}

test("Feishu builds V2 cards and sends via official SDK without public URLs", async () => {
  const mock = mockedSdk(), channel = new FeishuChannel(mock.sdk, async () => ({code: "executed", message: "操作"}));
  await channel.deliver(feishuPayload(), feishuConfig);
  const card = JSON.parse(mock.messages[0].data.content);
  assert.equal(card.schema, "2.0");
  const buttons = card.body.elements[1].columns.map(column => column.elements[0]);
  assert.deepEqual(buttons.map(button => button.behaviors[0].value.actionCode), ["continue_auto_execution", "retry_with_task_model"]);
  assert.equal(mock.messages[0].params.receive_id_type, "chat_id");
  assert.equal(mock.sockets.length, 1);
  channel.configure({...feishuConfig, receiveId: "other"});
  assert.equal(mock.sockets.length, 1, "target changes do not reconnect");
  channel.configure({...feishuConfig, appSecret: "rotated"});
  assert.equal(mock.sockets[0].closed, true);
  assert.equal(mock.sockets.length, 2);
  channel.configure({...feishuConfig, enabled: false});
  assert.equal(mock.sockets[1].closed, true);
  channel.stop();
});

test("Feishu WS callbacks map operators, acknowledge promptly and update processed cards", async () => {
  const mock = mockedSdk(), calls = [];
  let complete;
  const completed = new Promise(resolve => {complete = resolve;});
  const channel = new FeishuChannel(mock.sdk, async value => {calls.push(value); await completed; return {code: "executed", message: "测试通知"};});
  channel.configure(feishuConfig);
  const event = {operator: {open_id: "ou_1"}, context: {open_message_id: "msg_1"}, action: {value: {taskId: "run_1", eventId: "evt_1", actionCode: "continue_auto_execution"}}};
  const handler = mock.dispatchers[0].handlers["card.action.trigger"];
  assert.equal(handler(event).toast.type, "info");
  assert.equal(mock.updates.length, 0, "ack does not wait for task execution");
  complete();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls[0].source, "feishu");
  assert.equal(calls[0].operatorId, "user_1");
  assert.equal(calls[0].idempotencyKey, "feishu:evt_1:run_1:continue_auto_execution");
  const updated = JSON.parse(mock.updates[0].data.content);
  assert.equal(updated.header.title.content, "操作已处理");
  assert.equal(updated.body.elements.some(element => element.tag === "column_set"), false);
  assert.equal(handler({...event, operator: {open_id: "unknown"}}).toast.type, "error");
  assert.equal(handler({...event, action: {value: {actionCode: "cancel"}}}).toast.type, "error");
  assert.equal(calls.length, 1);
  channel.configure({...feishuConfig, operatorMapJson: "invalid json"});
  assert.equal(handler(event).toast.type, "error");
  assert.equal(calls.length, 1);
  channel.stop();
});

test("Feishu failed actions leave an explanatory processed card", async () => {
  const mock = mockedSdk();
  const channel = new FeishuChannel(mock.sdk, async () => {throw new Error("failed");});
  channel.configure(feishuConfig);
  await channel.handleAction({operator: {open_id: "ou_1"}, context: {open_message_id: "msg_1"}, action: {value: {taskId: "run_1", eventId: "evt_1", actionCode: "retry_with_task_model"}}}, "user_1");
  assert.equal(JSON.parse(mock.updates[0].data.content).header.template, "orange");
  channel.stop();
});


test("saved Feishu settings start, rotate and stop the subscribed long connection", async t => {
  const {prisma} = require("../dist/db/prisma");
  const {saveAutoDirectorChannelSettings} = require("../dist/services/settings/AutoDirectorChannelSettingsService");
  const entries = new Map();
  stubDatabaseMethod(t, prisma.appSetting, "findMany", async () => [...entries].map(([key, value]) => ({key, value})));
  stubDatabaseMethod(t, prisma.appSetting, "upsert", async ({where, update}) => {entries.set(where.key, update.value); return {key: where.key, value: update.value};});
  const mock = mockedSdk(), channel = new FeishuChannel(mock.sdk);
  t.after(() => channel.stop());
  await channel.start();
  assert.equal(mock.sockets.length, 0);
  await saveAutoDirectorChannelSettings({feishu: feishuConfig});
  assert.equal(mock.sockets.length, 1);
  await saveAutoDirectorChannelSettings({feishu: {appSecret: "rotated"}});
  assert.equal(mock.sockets[0].closed, true);
  assert.equal(mock.sockets.length, 2);
  await saveAutoDirectorChannelSettings({feishu: {enabled: false}});
  assert.equal(mock.sockets[1].closed, true);
  channel.stop();
  await saveAutoDirectorChannelSettings({feishu: {enabled: true}});
  assert.equal(mock.sockets.length, 2, "shutdown unsubscribes settings changes");
});


test("auto-director events send subscribed Feishu cards and record delivery once", async t => {
  const {prisma} = require("../dist/db/prisma");
  const {feishuChannel} = require("../dist/services/task/autoDirectorFollowUps/channels/feishu");
  const {AutoDirectorFollowUpNotificationService} = require("../dist/services/task/autoDirectorFollowUps/AutoDirectorFollowUpNotificationService");
  const rows = [{key: "autoDirector.channels.dingtalk.webhookUrl", value: ""}, {key: "autoDirector.channels.wecom.webhookUrl", value: ""},
    ...Object.entries({...feishuConfig, eventTypes: "auto_director.approval_required"}).map(([key, value]) => ({key: `autoDirector.channels.feishu.${key}`, value: String(value)}))];
  stubDatabaseMethod(t, prisma.appSetting, "findMany", async () => rows);
  const logs = [], sent = [];
  stubDatabaseMethod(t, prisma.autoDirectorFollowUpNotificationLog, "findFirst", async () => logs[0] || null);
  stubDatabaseMethod(t, prisma.autoDirectorFollowUpNotificationLog, "create", async ({data}) => {logs.push(data); return data;});
  t.mock.method(feishuChannel, "deliver", async (payload, config) => {sent.push({payload, config}); return {status: 200, body: "ok", target: config.receiveId};});
  const service = new AutoDirectorFollowUpNotificationService();
  const after = {id: "task_1", novelId: "book_1", novel: {title: "测试小说"}, status: "waiting_approval", currentStage: "章节执行",
    checkpointType: "chapter_batch_ready", checkpointSummary: "准备继续", pendingManualRecovery: false, updatedAt: new Date("2026-11-06T01:00:00Z")};
  await service.handleTaskTransition({before: null, after});
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.channelType, "feishu");
  assert.equal(sent[0].payload.card.actions[0].actionCode, "continue_auto_execution");
  assert.equal(logs[0].status, "delivered");
  assert.equal(logs[0].channelType, "feishu");
  await service.handleTaskTransition({before: null, after});
  assert.equal(sent.length, 1, "delivered event is deduplicated");
  logs.length = 0;
  rows.find(row => row.key.endsWith("feishu.eventTypes")).value = "auto_director.completed";
  await service.handleTaskTransition({before: null, after});
  assert.equal(sent.length, 1, "unsubscribed event is skipped");
});


test("official robots returning HTTP 200 with API errors are failed deliveries", async t => {
  t.mock.method(global, "fetch", async () => ({status: 200, text: async () => '{"errcode":310000,"errmsg":"invalid signature"}'}));
  for (const notifier of [new DingTalkNotifier(), new WeComNotifier()]) {
    assert.equal((await notifier.deliver(notifier.buildPayload(input), config)).status, 502);
  }
});
