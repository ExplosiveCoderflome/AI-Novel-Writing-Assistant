const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const dbPath = require.resolve("../dist/db/prisma.js");
const prisma = {
  promptTemplateOverride: { findUnique: async () => { throw new Error("unexpected database read"); } },
  $transaction: async () => { throw new Error("unexpected database write"); },
};
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { prisma } };
const { PromptWorkbenchService } = require("../dist/prompting/PromptWorkbenchService.js");
const { promptSlotOverrideService } = require("../dist/prompting/slots/PromptSlotOverrideService.js");
const { promptTemplateOverrideService } = require("../dist/prompting/templates/PromptTemplateOverrideService.js");
const { getRequiredTemplateContextGroups } = require("../dist/prompting/templates/templateTypes.js");
const router = require("../dist/routes/promptWorkbench.js").default;
const { errorHandler } = require("../dist/middleware/errorHandler.js");

test("official templates can be read without a novel or any template database access", async (t) => {
  const lookup = t.mock.method(prisma.promptTemplateOverride, "findUnique", async () => { throw new Error("unexpected database read"); });
  for (const promptId of ["novel.chapter.writer", "novel.short_story.segment.write"]) {
    const view = await promptTemplateOverrideService.get({ promptId });
    assert.equal(view.novelId, "");
    assert.equal(view.mode, "official");
    assert.equal(view.activeVersion, null);
    assert.deepEqual(view.versions, []);
    assert.equal(view.officialTemplate.messages.length, 2);
    assert.ok(view.officialTemplate.messages.every((message) => message.content.length > 0));
  }
  assert.equal(lookup.mock.callCount(), 0);
  await assert.rejects(promptTemplateOverrideService.get({ promptId: "planner.intent.parse" }), /不支持/);
});

test("unbound template draft preview uses declared sample contexts and preserves required-context guards", async (t) => {
  t.mock.method(promptSlotOverrideService, "getOverrideMaps", async () => ({ global: {}, novel: {} }));
  t.mock.method(promptTemplateOverrideService, "getActiveCustomTemplate", async () => { throw new Error("must not read saved template for a draft"); });
  const service = new PromptWorkbenchService({
    novel: { findUnique: async () => { throw new Error("must not query a fictional novel"); } },
    chapter: { findFirst: async () => { throw new Error("must not query a fictional chapter"); } },
  });
  for (const promptId of ["novel.chapter.writer", "novel.short_story.segment.write"]) {
    const catalog = service.listCatalog({ keyword: promptId }).find((item) => item.id === promptId);
    const input = {
      promptKey: catalog.key,
      promptInput: {
        novelTitle: "示例小说", chapterOrder: 1, chapterTitle: "示例章节", mode: "draft",
        targetWordCount: 3000, minWordCount: 2600, maxWordCount: 3400,
        originalIdea: "示例故事", understanding: "信任与悬疑",
        direction: { title: "沉默证词" }, plan: { title: "沉默证词", segments: [] },
        segment: { order: 1, targetWordCount: 2600, progressionBeats: [] },
        previousContinuity: "", previousContentTail: "",
      },
      executionContext: { entrypoint: "manual_test" },
      templateDraft: { kind: "chat", messages: [
        { role: "system", content: "UNBOUND DRAFT: 简洁自然的表达。" },
        { role: "human", content: "完成示例写作任务。" },
      ] },
    };
    const preview = await service.preview(input);
    const official = await promptTemplateOverrideService.get({ promptId });
    const officialPreview = await service.preview({ ...input, templateDraft: official.officialTemplate });
    assert.deepEqual(officialPreview.diagnostics.missingRequiredGroups, []);
    assert.equal(preview.diagnostics.template.mode, "draft");
    assert.ok(preview.messages.some((message) => message.content.includes("UNBOUND DRAFT")));
    assert.ok(preview.diagnostics.notes.some((note) => note.includes("虚构示例")));
    for (const group of getRequiredTemplateContextGroups(promptId)) {
      assert.ok(preview.context.blocks.some((block) => block.group === group), group);
    }
    const refs = await service.contextReferences({ promptId });
    assert.equal(refs.novelId, undefined);
    assert.deepEqual(refs.missingRequiredGroups, []);
    assert.ok(refs.items.some((item) => item.group === "required_context"));

    // Explicit incomplete context must fail, rather than silently substituting sample data.
    await assert.rejects(service.preview({
      ...input,
      executionContext: { entrypoint: "manual_test", metadata: { extraContextBlocks: [] } },
    }), /缺少必需上下文/);
    await assert.rejects(service.preview({
      ...input,
      templateDraft: { kind: "chat", messages: [
        { role: "system", content: "{{context.invalid_reference}}" },
        { role: "human", content: "任务" },
      ] },
    }), /未知 token/);
  }
});

test("HTTP allows novel-free reads but still requires a novel for all template mutations", async (t) => {
  const lookup = t.mock.method(prisma.promptTemplateOverride, "findUnique", async () => { throw new Error("unexpected database read"); });
  const write = t.mock.method(prisma, "$transaction", async () => { throw new Error("unexpected database write"); });
  const app = express();
  app.use(express.json());
  app.use("/prompt-workbench", router);
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/prompt-workbench`;
  try {
    const response = await fetch(`${base}/template-overrides?promptId=novel.chapter.writer`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.mode, "official");
    for (const [method, path, body] of [
      ["PUT", "/template-overrides", { template: { kind: "chat", messages: [{ role: "system", content: "规则" }, { role: "human", content: "任务" }] } }],
      ["POST", "/template-overrides/restore-official", {}],
      ["POST", "/template-overrides/activate-version", { versionId: "version-1" }],
    ]) {
      const rejected = await fetch(base + path, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptId: "novel.chapter.writer", ...body }),
      });
      assert.equal(rejected.status, 400, path);
    }
    assert.equal(lookup.mock.callCount(), 0);
    assert.equal(write.mock.callCount(), 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
