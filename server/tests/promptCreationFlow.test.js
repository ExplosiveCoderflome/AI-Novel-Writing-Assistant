const test = require("node:test");
const assert = require("node:assert/strict");
const { require: loadTypeScript } = require("tsx/cjs/api");
const { stages, stageSteps } = loadTypeScript("../../client/src/pages/promptWorkbench/creationFlow/flowDefinition.ts", __filename);
const { readCreationFlowTemplate } = require("../dist/prompting/workbench/creationFlow");
const { creationTemplateInputs } = require("../dist/prompting/workbench/creationFlow/templateInputs");

test("every creative flow station resolves its connections and reads all official messages without a book", () => {
  assert.equal(stages.length, 5);
  const steps = stages.flatMap(stageSteps);
  const ids = new Set(steps.map(step => step.id));
  assert.equal(ids.size, steps.length);
  const keys = new Set();
  for (const stage of stages) {
    const trunk = new Set(stage.main.map(step => step.id));
    for (const branch of stage.branches ?? []) {
      assert.ok(trunk.has(branch.from));
      if (branch.join) assert.ok(trunk.has(branch.join));
    }
  }
  for (const step of steps) {
    if (step.destination) assert.ok(ids.has(step.destination));
    assert.equal(Boolean(step.templates?.length), step.kind === "ai", step.title);
    for (const [key] of step.templates ?? []) keys.add(key);
  }
  assert.deepEqual(keys, new Set(Object.keys(creationTemplateInputs)));
  for (const key of keys) {
    const { messages, version } = readCreationFlowTemplate(key);
    assert.ok(version, key);
    for (const role of ["system", "human"]) assert.ok(messages.some(m => m.role === role), key);
    for (const message of messages) {
      assert.ok(message.content.trim(), key);
      assert.doesNotMatch(message.content, /\bundefined\b|\[object Object\]/, key);
    }
  }
  const review = readCreationFlowTemplate("novel.chapter.acceptance_assessment");
  const verify = readCreationFlowTemplate("verify-repair");
  assert.equal(verify.id, review.id);
  assert.match(verify.messages.at(-1).content, /局部修文复验清单/);
  assert.ok(verify.messages.length > review.messages.length);
  assert.equal(readCreationFlowTemplate("constructor"), null);
});
