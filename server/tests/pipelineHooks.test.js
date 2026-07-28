const test = require("node:test");
const assert = require("node:assert/strict");
const { pipelineHookRegistry, PipelineHookRegistry } = require("../dist/services/novel/director/automation/PipelineHookRegistry.js");
const { prisma } = require("../dist/db/prisma.js");

test("PAI Insight 4: Pipeline Hooks System & Proactive Director", async (t) => {
  await t.test("registers and emits hooks asynchronously across multiple handlers", async () => {
    const registry = new PipelineHookRegistry();
    let handler1Called = false;
    let handler2Called = false;

    registry.registerHook("onPostChapterDraft", async (payload) => {
      handler1Called = true;
      assert.equal(payload.novelId, "novel-test-123");
    });

    registry.registerHook("onPostChapterDraft", async (payload) => {
      handler2Called = true;
      assert.equal(payload.chapterId, "chapter-test-456");
    });

    await registry.emitHook("onPostChapterDraft", {
      novelId: "novel-test-123",
      chapterId: "chapter-test-456",
    });

    assert.equal(handler1Called, true);
    assert.equal(handler2Called, true);
  });

  await t.test("isolates handler errors so that failing hooks never throw or interrupt flow", async () => {
    const registry = new PipelineHookRegistry();
    let secondHandlerExecuted = false;

    registry.registerHook("onSessionStart", async () => {
      throw new Error("Simulated failing proactive hook handler");
    });

    registry.registerHook("onSessionStart", async () => {
      secondHandlerExecuted = true;
    });

    // Should complete cleanly without throwing
    await registry.emitHook("onSessionStart", { novelId: "novel-test-fail-isolation" });

    assert.equal(secondHandlerExecuted, true);
  });

  await t.test("clears VideoProject errorMessage proactively on onPostVideoRender hook emission", async () => {
    const novelId = `test-novel-hook-${Date.now()}`;
    const projectId = `test-video-proj-${Date.now()}`;

    // Create mock novel and video project with an existing errorMessage
    await prisma.novel.create({
      data: {
        id: novelId,
        title: "Test Novel for Video Hook",
        description: "Hook test description",
      },
    });

    await prisma.videoProject.create({
      data: {
        id: projectId,
        novelId: novelId,
        title: "Test Project",
        status: "rendering",
        errorMessage: "Old render failure error message",
      },
    });

    try {
      // Emit the onPostVideoRender hook
      await pipelineHookRegistry.emitHook("onPostVideoRender", {
        projectId,
        novelId,
      });

      // Verify in DB that errorMessage was proactively cleared
      const updated = await prisma.videoProject.findUnique({
        where: { id: projectId },
      });

      assert.equal(updated.errorMessage, null);
    } finally {
      await prisma.videoProject.delete({ where: { id: projectId } });
      await prisma.novel.delete({ where: { id: novelId } });
    }
  });
});
