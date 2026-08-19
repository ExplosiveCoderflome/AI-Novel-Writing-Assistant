const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { llmLiveBroker } = require("../../dist/platform/llm/live/LlmLiveBroker.js");

test("llmLiveRoutes 提供 SSE 框架格式的快照与事件分发", (t, done) => {
  const session = llmLiveBroker.begin({
    label: "测试创作会话",
    mode: "text",
    taskId: "route-test-task-1",
    provider: "openai",
    model: "gpt-4o",
  });

  const writtenChunks = [];
  const req = new EventEmitter();
  req.query = { taskId: "route-test-task-1" };

  const res = {
    writableEnded: false,
    setHeader: () => {},
    flushHeaders: () => {},
    write: (chunk) => {
      writtenChunks.push(chunk);
    },
  };

  const llmLiveRoutes = require("../../dist/platform/llm/live/http/llmLiveRoutes.js").default;
  const routeLayer = llmLiveRoutes.stack.find((layer) => layer.route && layer.route.path === "/stream");

  assert.ok(routeLayer, "应包含 /stream 路由层");

  // 执行路由处理程序
  routeLayer.route.stack[routeLayer.route.stack.length - 1].handle(req, res);

  // 1. 验证首帧已下发 snapshot
  assert.ok(writtenChunks.length >= 1, "应至少包含 1 个下发帧");
  const fullInitial = writtenChunks.join("");
  assert.match(fullInitial, /event: llm_live/);
  assert.match(fullInitial, /route-test-task-1/);
  assert.match(fullInitial, /"type":"snapshot"/);

  // 2. 模拟增量 delta 事件
  session.delta("第一段测试输出");
  session.complete();

  const fullAfterDelta = writtenChunks.join("");
  assert.match(fullAfterDelta, /"type":"output_delta"/);
  assert.match(fullAfterDelta, /第一段测试输出/);

  // 3. 模拟断开连接
  req.emit("close");
  done();
});
