const {stubDatabaseMethod} = require("./legacyDirector/databasePorts");
const test = require("node:test");
const assert = require("node:assert/strict");
const {createApp} = require("../dist/app");
const {prisma} = require("../dist/db/prisma");
const production = require("../dist/app/director/services");
const {AutoDirectorFollowUpActionExecutor} = require("../dist/services/task/autoDirectorFollowUps/AutoDirectorFollowUpActionExecutor");
const {signWeComMarkdownCallback} = require("../dist/services/task/autoDirectorFollowUps/wecomMarkdownCallback");

test("native V2 callbacks traverse entry guard and shared executor into V2 commands", async t => {
  stubDatabaseMethod(t, prisma.novelWorkflowTask, "findUnique", async () => null);
  stubDatabaseMethod(t, prisma.directorNextRun, "findUnique", async ({where}) => where.id === "run_1" ? {id: "run_1", novelId: "book_1", contractJson: '{"executionEpoch":0}'} : null);
  stubDatabaseMethod(t, prisma.novel, "findUnique", async () => ({directorVersion: "v2", directorEpoch: 0}));
  stubDatabaseMethod(t, prisma.directorNextCommand, "findUnique", async () => null);
  stubDatabaseMethod(t, prisma.autoDirectorFollowUpActionLog, "findUnique", async () => null);
  const logs = [];
  stubDatabaseMethod(t, prisma.autoDirectorFollowUpActionLog, "create", async ({data}) => {logs.push(data); return data;});
  stubDatabaseMethod(t, prisma.appSetting, "findMany", async () => [
    {key: "autoDirector.channels.dingtalk.callbackToken", value: "token"},
    {key: "autoDirector.channels.dingtalk.operatorMapJson", value: '{"ding_1":"user_1"}'},
    {key: "autoDirector.channels.wecom.callbackToken", value: "wecom-token"},
  ]);
  const commands = [];
  t.mock.method(production, "getDirectorProductionServices", () => ({http: {
    runRepository: {getControl: async () => ({status: "paused", version: 7})},
    commandService: {execute: async command => {commands.push(command); return {runId: "run_1", replayed: false};}},
  }}));
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/auto-director/channel-callbacks`;
  const response = await fetch(`${baseUrl}/dingtalk`, {method: "POST", headers: {"Content-Type": "application/json", "x-auto-director-dingtalk-token": "token"},
    body: JSON.stringify({taskId: "run_1", actionCode: "continue_auto_execution", eventId: "evt_1", callbackId: "cb_1", userId: "ding_1"})});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.code, "executed");
  const params = {taskId: "run_1", actionCode: "retry_with_task_model", eventId: "evt_2", callbackId: "cb_2"};
  const query = new URLSearchParams({...params, signature: signWeComMarkdownCallback(params, "wecom-token")});
  const retry = await fetch(`${baseUrl}/wecom/execute?${query}`);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).data.code, "executed");
  const dingParams = {...params, callbackId: "cb_3"};
  const dingQuery = new URLSearchParams({...dingParams, signature: signWeComMarkdownCallback(dingParams, "token")});
  const dingLink = await fetch(`${baseUrl}/dingtalk/execute?${dingQuery}`);
  assert.equal(dingLink.status, 200);
  assert.equal((await dingLink.json()).data.code, "executed");
  dingQuery.set("signature", "invalid");
  assert.equal((await fetch(`${baseUrl}/dingtalk/execute?${dingQuery}`)).status, 403);
  assert.deepEqual(commands, [
    {type: "resume", runId: "run_1", expectedVersion: 7, idempotencyKey: "dingtalk:cb_1"},
    {type: "resume", runId: "run_1", expectedVersion: 7, idempotencyKey: "wecom:cb_2"},
    {type: "resume", runId: "run_1", expectedVersion: 7, idempotencyKey: "dingtalk:cb_3"},
  ]);
  assert.equal(logs[0].sourceUser, "user_1");
  assert.equal(logs[1].sourceChannel, "wecom");
});

test("V2 follow-up chooses gate confirmation or queued retry and replays saved commands", async t => {
  stubDatabaseMethod(t, prisma.novelWorkflowTask, "findUnique", async () => null);
  stubDatabaseMethod(t, prisma.directorNextRun, "findUnique", async () => ({id: "run_2", novelId: "book_2", contractJson: '{"executionEpoch":0}'}));
  stubDatabaseMethod(t, prisma.novel, "findUnique", async () => ({directorVersion: "v2", directorEpoch: 0}));
  let existing = null, status = "waiting_gate";
  stubDatabaseMethod(t, prisma.directorNextCommand, "findUnique", async () => existing);
  stubDatabaseMethod(t, prisma.autoDirectorFollowUpActionLog, "findUnique", async () => null);
  stubDatabaseMethod(t, prisma.autoDirectorFollowUpActionLog, "create", async () => ({}));
  const commands = [];
  t.mock.method(production, "getDirectorProductionServices", () => ({http: {
    runRepository: {getControl: async () => ({status, version: 3})},
    commandService: {execute: async command => {commands.push(command); return {runId: "run_2", replayed: Boolean(existing)};}},
  }}));
  const executor = new AutoDirectorFollowUpActionExecutor();
  const input = {taskId: "run_2", actionCode: "continue_auto_execution", source: "feishu", operatorId: "user_1", idempotencyKey: "feishu:evt_1:run_2:continue_auto_execution"};
  assert.equal((await executor.execute(input)).code, "executed");
  assert.equal(commands[0].type, "resolve_gate");
  assert.equal(commands[0].decision, "confirm");
  status = "queued";
  assert.equal((await executor.execute({...input, actionCode: "retry_with_task_model", idempotencyKey: "queued"})).code, "executed");
  assert.equal(commands[1].type, "retry_start");
  status = "running";
  existing = {id: "cmd_1", runId: "run_2", type: "resolve_gate", payloadJson: JSON.stringify(commands[0]), resultJson: '{"runId":"run_2"}'};
  assert.equal((await executor.execute(input)).code, "already_processed");
  assert.deepEqual(commands[2], commands[0]);
  existing = null;
  assert.equal((await executor.execute({...input, idempotencyKey: "changed"})).code, "state_changed");
  assert.equal(commands.length, 3);
});

test("stale V1 workflow IDs retain their ownership rejection", async t => {
  stubDatabaseMethod(t, prisma.novelWorkflowTask, "findUnique", async () => ({id: "old_v1", novelId: "book", directorVersion: "v1", directorEpoch: 0}));
  stubDatabaseMethod(t, prisma.novel, "findUnique", async () => ({directorVersion: "v2", directorEpoch: 1}));
  stubDatabaseMethod(t, prisma.directorNextRun, "findUnique", async () => null);
  await assert.rejects(() => new AutoDirectorFollowUpActionExecutor().execute({taskId: "old_v1", actionCode: "continue_auto_execution", source: "dingtalk", idempotencyKey: "old"}), error => error.statusCode === 409);
});
