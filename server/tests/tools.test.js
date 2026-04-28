const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { listAgentToolDefinitions } = require("../dist/agents/toolRegistry.js");

test("tool registry exposes chapter range and cross-domain tools", () => {
  const tools = listAgentToolDefinitions().map((item) => item.name);
  assert.ok(tools.includes("list_novels"));
  assert.ok(tools.includes("create_novel"));
  assert.ok(tools.includes("select_novel_workspace"));
  assert.ok(tools.includes("list_chapters"));
  assert.ok(tools.includes("get_chapter_by_order"));
  assert.ok(tools.includes("get_chapter_content_by_order"));
  assert.ok(tools.includes("summarize_chapter_range"));
  assert.ok(tools.includes("list_book_analyses"));
  assert.ok(tools.includes("list_knowledge_documents"));
  assert.ok(tools.includes("list_worlds"));
  assert.ok(tools.includes("bind_world_to_novel"));
  assert.ok(tools.includes("unbind_world_from_novel"));
  assert.ok(tools.includes("generate_world_for_novel"));
  assert.ok(tools.includes("generate_novel_characters"));
  assert.ok(tools.includes("generate_story_bible"));
  assert.ok(tools.includes("generate_novel_outline"));
  assert.ok(tools.includes("generate_structured_outline"));
  assert.ok(tools.includes("sync_chapters_from_structured_outline"));
  assert.ok(tools.includes("start_full_novel_pipeline"));
  assert.ok(tools.includes("get_novel_production_status"));
  assert.ok(tools.includes("analyze_director_workspace"));
  assert.ok(tools.includes("get_director_run_status"));
  assert.ok(tools.includes("explain_director_next_action"));
  assert.ok(tools.includes("run_director_next_step"));
  assert.ok(tools.includes("run_director_until_gate"));
  assert.ok(tools.includes("switch_director_policy"));
  assert.ok(tools.includes("evaluate_manual_edit_impact"));
  assert.ok(tools.includes("list_writing_formulas"));
  assert.ok(tools.includes("list_base_characters"));
  assert.ok(tools.includes("list_tasks"));
  assert.ok(tools.includes("get_run_failure_reason"));
  assert.ok(tools.includes("explain_generation_blocker"));
});

test("agent tool definitions keep zod declarations in dedicated schema modules", () => {
  const toolsDir = path.join(__dirname, "..", "src", "agents", "tools");
  const violations = [];

  for (const entry of fs.readdirSync(toolsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith("Tools.ts")) {
      continue;
    }
    const filePath = path.join(toolsDir, entry.name);
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/g);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (
        line.includes('from "zod"')
        || line.includes("from 'zod'")
        || line.includes("z.")
      ) {
        violations.push(`${entry.name}:${index + 1}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
