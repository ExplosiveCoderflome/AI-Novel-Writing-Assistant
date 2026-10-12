const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  filterCreativeHubActions,
  isCreativeHubToolAllowed,
} = require("../dist/creativeHub/creativeHubToolPolicy.js");

function call(tool, suffix) {
  return {
    tool,
    idempotencyKey: `creative-hub-policy-${suffix}`,
    input: {},
    reason: "test",
  };
}

test("Creative Hub keeps read and inspect tools but blocks mutate and run tools", () => {
  assert.equal(isCreativeHubToolAllowed("list_novels"), true);
  assert.equal(isCreativeHubToolAllowed("analyze_director_workspace"), true);
  assert.equal(isCreativeHubToolAllowed("create_novel"), false);
  assert.equal(isCreativeHubToolAllowed("start_full_novel_pipeline"), false);
});

test("Creative Hub filters mixed plans and removes empty actions", () => {
  const result = filterCreativeHubActions([
    {
      agent: "NovelAgent",
      reasoning: "mixed",
      calls: [call("list_novels", "read"), call("create_novel", "write")],
    },
    {
      agent: "WriteAgent",
      reasoning: "write only",
      calls: [call("save_chapter_draft", "draft")],
    },
  ]);

  assert.deepEqual(result.allowedActions.map((action) => action.calls.map((item) => item.tool)), []);
  assert.deepEqual(result.blockedTools.sort(), ["create_novel", "save_chapter_draft"]);
});

test("Creative Hub approval graph checks old write approvals before resolving them", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "../src/creativeHub/CreativeHubInterruptLangGraph.ts"),
    "utf8",
  );
  const guard = source.indexOf('if (state.action === "approve")');
  const resolve = source.indexOf("this.approvals.resolve(");
  assert.ok(guard >= 0 && resolve > guard);
  assert.match(source, /filterCreativeHubActions\(payload\.plannedActions\)/);
});
