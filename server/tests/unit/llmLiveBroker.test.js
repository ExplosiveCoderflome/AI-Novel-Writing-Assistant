const test = require("node:test");
const assert = require("node:assert/strict");

const { LlmLiveBroker } = require("../../dist/platform/llm/live/LlmLiveBroker.js");

test("LLM 实况会话按任务发布片段并保留最新快照", () => {
  const broker = new LlmLiveBroker();
  const taskOneEvents = [];
  const taskTwoEvents = [];
  const stopOne = broker.subscribe({ taskId: "task-1" }, (event) => taskOneEvents.push(event));
  const stopTwo = broker.subscribe({ taskId: "task-2" }, (event) => taskTwoEvents.push(event));

  const session = broker.begin({
    label: "章节正文",
    mode: "text",
    taskId: "task-1",
    provider: "deepseek",
    model: "deepseek-chat",
  });
  session.phase("streaming", "模型正在返回内容");
  session.delta("第一段");
  session.delta("第二段");
  session.complete();

  stopOne();
  stopTwo();

  assert.equal(taskTwoEvents.length, 0);
  assert.deepEqual(
    taskOneEvents.map((event) => event.type),
    ["session_started", "phase_changed", "output_delta", "output_delta", "phase_changed", "session_completed"],
  );
  assert.deepEqual(
    taskOneEvents.map((event) => event.seq),
    [1, 2, 3, 4, 5, 6],
  );
  const [snapshot] = broker.getSnapshots({ taskId: "task-1" });
  assert.equal(snapshot.preview, "第一段第二段");
  assert.equal(snapshot.totalChars, 6);
  assert.equal(snapshot.phase, "completed");
  assert.equal(snapshot.context.provider, "deepseek");
  assert.equal(snapshot.context.model, "deepseek-chat");
});

test("LLM 实况会话在失败时记录 errorMessage 错误堆栈", () => {
  const broker = new LlmLiveBroker();
  const events = [];
  broker.subscribe({}, (e) => events.push(e));

  const session = broker.begin({
    label: "角色大纲生成",
    mode: "structured",
    taskId: "task-err-1",
  });
  session.phase("validating", "正在检查 JSON 格式");
  session.fail(new Error("JSON 格式校验不匹配"));

  const [snapshot] = broker.getSnapshots({ taskId: "task-err-1" });
  assert.equal(snapshot.phase, "failed");
  assert.equal(snapshot.phaseMessage, "JSON 格式校验不匹配");
  assert.match(snapshot.errorMessage, /JSON 格式校验不匹配/);

  const failEvent = events.find((e) => e.type === "session_failed");
  assert.ok(failEvent);
  assert.equal(failEvent.message, "JSON 格式校验不匹配");
});

test("LLM 实况会话能正确截断超过 16,000 字符的预览文本", () => {
  const broker = new LlmLiveBroker();
  const session = broker.begin({
    label: "长文本测试",
    mode: "text",
    taskId: "task-long",
  });

  const chunk = "A".repeat(10_000);
  session.delta(chunk);
  session.delta(chunk);

  const [snapshot] = broker.getSnapshots({ taskId: "task-long" });
  assert.equal(snapshot.totalChars, 20_000);
  assert.equal(snapshot.preview.length, 16_000);
});
