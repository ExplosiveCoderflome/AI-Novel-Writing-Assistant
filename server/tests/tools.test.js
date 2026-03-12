const test = require("node:test");
const assert = require("node:assert/strict");
const { listAgentToolDefinitions } = require("../dist/agents/toolRegistry.js");

test("tool registry exposes chapter range tools", () => {
  const tools = listAgentToolDefinitions().map((item) => item.name);
  assert.ok(tools.includes("list_chapters"));
  assert.ok(tools.includes("get_chapter_by_order"));
  assert.ok(tools.includes("get_chapter_content_by_order"));
  assert.ok(tools.includes("summarize_chapter_range"));
});
