const test = require("node:test");
const assert = require("node:assert/strict");

// issue #171：chapter_list / volume 走 slim 响应时，服务端必须在返回前先落盘。
// 否则客户端拿到 slim 后重读工作区会读到旧文档，新生成的章节标题会被丢弃。
const {
  shouldPersistBeforeSlimVolumeResponse,
} = require("../dist/modules/novel/planning/http/novelVolumeRoutes.js");

test("chapter_list 与 volume 在 slim 响应前需要先落盘", () => {
  assert.equal(shouldPersistBeforeSlimVolumeResponse({ scope: "chapter_list", slimResponse: true }), true);
  assert.equal(shouldPersistBeforeSlimVolumeResponse({ scope: "volume", slimResponse: true }), true);
});

test("原有需要落盘的 scope 保持不变", () => {
  assert.equal(shouldPersistBeforeSlimVolumeResponse({ scope: "beat_sheet", slimResponse: true }), true);
  assert.equal(shouldPersistBeforeSlimVolumeResponse({ scope: "rebalance", slimResponse: true }), true);
  assert.equal(shouldPersistBeforeSlimVolumeResponse({ scope: "chapter_detail", slimResponse: true }), true);
});

test("其他 scope 与非法输入不触发落盘", () => {
  assert.equal(shouldPersistBeforeSlimVolumeResponse({ scope: "strategy", slimResponse: true }), false);
  assert.equal(shouldPersistBeforeSlimVolumeResponse({ scope: "skeleton", slimResponse: true }), false);
  assert.equal(shouldPersistBeforeSlimVolumeResponse({ scope: "book", slimResponse: true }), false);
  assert.equal(shouldPersistBeforeSlimVolumeResponse({}), false);
  assert.equal(shouldPersistBeforeSlimVolumeResponse(null), false);
  assert.equal(shouldPersistBeforeSlimVolumeResponse(undefined), false);
  assert.equal(shouldPersistBeforeSlimVolumeResponse("chapter_list"), false);
});
