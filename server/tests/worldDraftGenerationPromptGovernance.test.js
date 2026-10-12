const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(
  path.resolve(__dirname, "../src/services/world/worldDraftGeneration.ts"),
  "utf8",
);

test("world draft generation stays behind the registered prompt runner", () => {
  assert.match(source, /streamStructuredPrompt\(/);
  assert.match(source, /asset: worldDraftGenerationPrompt/);
  assert.doesNotMatch(source, /getLLM\(/);
  assert.doesNotMatch(source, /createWorldBuildingGraph/);
});
