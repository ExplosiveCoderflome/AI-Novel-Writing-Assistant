const assert = require("node:assert/strict");
const { prisma } = require("../../../dist/db/prisma");
const { GenerationContextAssembler } = require("../../../dist/services/novel/runtime/GenerationContextAssembler");
const { NovelCorePipelineService } = require("../../../dist/services/novel/novelCorePipelineService");
const { ChapterWritingGraph } = require("../../../dist/services/novel/chapterWritingGraph");
const { ChapterArtifactSyncService } = require("../../../dist/services/novel/runtime/ChapterArtifactSyncService");
const { chapterLifecycleService } = require("../../../dist/services/novel/runtime/lifecycle");
const { chosen, declined, fieldsRead } = require("./model");

const draft = (order) =>
  "　　钟楼响了第" +
  order +
  "声。" +
  "学徒翻过收据，重新核对邮戳上的日期。".repeat(130) +
  "\r\n\r\n　她停下脚步。\r\n";
// Exercise the writer and durable chapter sync with a repeatable stream and a successful audit outcome.
function installWritingJob(t, observed) {
  const assembler = new GenerationContextAssembler();
  const artifacts = new ChapterArtifactSyncService();
  const graph = new ChapterWritingGraph({
    enforceOpeningDiversity: async (_book, _order, _title, content) => ({
      content,
      rewritten: false,
      maxSimilarity: 0,
    }),
    saveDraftAndArtifacts: artifacts.saveDraftAndArtifacts.bind(artifacts),
    logInfo: () => {},
    logWarn: () => {},
  });
  t.mock.method(require("../../../dist/prompting/core/promptRunner"), "streamTextPrompt", async (call) => {
    const { asset, promptInput } = call;
    const { messages } = require("../../../dist/prompting/core/promptRunner").preparePromptExecution(call);
    assert.equal(asset.id, "novel.chapter.writer");
    assert.equal(promptInput.mode, "draft");
    if (promptInput.chapterOrder === 3) {
      fieldsRead(messages, chosen.turn);
      fieldsRead(messages, chosen.task);
    }
    if (promptInput.chapterOrder === 4) fieldsRead(messages, chosen.prose);
    const content = draft(promptInput.chapterOrder);
    return {
      stream: (async function* () {
        yield { content };
      })(),
      complete: Promise.resolve({ output: content }),
    };
  });
  t.mock.method(NovelCorePipelineService.prototype, "startPipelineJob", async (novelId, options) => {
    const { startOrder, endOrder, directorNext } = options;
    for (let order = startOrder; order <= endOrder; order++) {
      const row = await prisma.chapter.findFirstOrThrow({ where: { novelId, order } });
      const assembled = await assembler.assemble(novelId, row.id, {});
      const context = assembled.contextPackage;
      if (order === 3) {
        fieldsRead(assembled.chapter.sceneCards, chosen.turn);
        assert.ok(!assembled.chapter.mustAvoid.includes(declined));
      }
      if (order === 4) {
        assert.equal(context.previousChapterContent, observed.batchEdit);
        fieldsRead(context.previousChapterContent, chosen.prose);
      }
      observed.written.push(order);
      const result = await graph.createChapterStream({
        novelId,
        novelTitle: assembled.novel.title,
        chapter: assembled.chapter,
        contextPackage: context,
        options: { provider: options.provider, model: options.model, deferArtifactBackgroundSync: true },
      });
      let text = "";
      for await (const chunk of result.stream) text += chunk.content;
      const saved = await result.onDone(text);
      assert.equal(saved.finalContent, draft(order));
      const sync = await artifacts.syncChapterArtifacts(novelId, row.id, saved.finalContent, {
        artifactSyncPolicy: "director_v2",
        directorRunId: directorNext.runId,
        artifactSyncMode: "strict",
        skipLegacySummaryAndFacts: true,
        provider: options.provider,
        model: options.model,
      });
      assert.equal(sync.status, "completed", sync.reason);
      await chapterLifecycleService.markGenerationState(row.id, "approved");
    }
    return prisma.generationJob.create({
      data: { novelId, startOrder, endOrder, status: "succeeded", payload: JSON.stringify({ directorNext }) },
    });
  });
}
module.exports = { installWritingJob, draft };
