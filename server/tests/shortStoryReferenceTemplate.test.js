const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const types = require("../dist/prompting/templates/templateTypes");
const compiler = require("../dist/prompting/templates/templateCompiler");
const source = path.resolve(__dirname, "../src/prompting/templates/templateRuntime.ts");
const moduleFixture = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(source, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: moduleFixture, exports: moduleFixture.exports, require(id) {
  if (id === "./templateTypes") return types;
  if (id === "./templateCompiler") return compiler;
  if (id === "./PromptTemplateOverrideService") return { promptTemplateOverrideService: {
    getActiveCustomTemplate: async () => ({ template: { kind: "chat", messages: [
      { role: "system", content: "按本书写法写正文" }, { role: "human", content: "继续写作" },
    ] } }),
  } };
  throw new Error("Unexpected dependency " + id);
} }, { filename: source });

async function render(withReference) {
  const groups = types.getRequiredTemplateContextGroups("novel.short_story.segment.write");
  const blocks = groups.map((group) => ({ id: group, group, content: group + " 约定", priority: 100, required: true }));
  blocks.push({ id: "foundation", group: "production_foundation", content: "PRODUCTION_FOUNDATION_CONTRACT", priority: 103, required: true });
  if (withReference) blocks.push({ id: "reference", group: "creation_reference", content: "IMMUTABLE_REFERENCE_CONTRACT", priority: 101, required: true });
  const messages = await moduleFixture.exports.resolveAdvancedPromptMessages({
    asset: { id: "novel.short_story.segment.write", contextPolicy: {}, contextRequirements: groups.map((group) => ({ group, required: true })) },
    promptInput: {}, novelId: "fixture",
    context: { blocks, selectedBlockIds: blocks.map((block) => block.id), droppedBlockIds: [], summarizedBlockIds: [], estimatedInputTokens: 100 },
    officialMessages: [],
  });
  return messages.map((message) => String(message.content)).join("\n");
}
test("advanced short-story templates retain confirmed reference context even when not explicitly mentioned", async () => {
  assert.match(await render(true), /IMMUTABLE_REFERENCE_CONTRACT/);
});
test("ordinary short-story templates do not require a missing reference context", async () => {
  assert.doesNotMatch(await render(false), /IMMUTABLE_REFERENCE_CONTRACT/);
});
test("short-story advanced templates preserve the required production foundation", async () => {
  assert.match(await render(true), /PRODUCTION_FOUNDATION_CONTRACT/);
});
