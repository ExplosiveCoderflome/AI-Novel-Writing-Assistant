const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "book-analysis-source-notes-"));
process.env.AI_NOVEL_RUNTIME = "desktop";
process.env.DATABASE_URL = `file:${path.join(tempDir, "fixture.db").replaceAll("\\", "/")}`;
process.env.BOOK_ANALYSIS_NOTES_CONCURRENCY = "1";

const { prisma } = require("../dist/db/prisma.js");
const { ensureRuntimeDatabaseReady } = require("../dist/db/runtimeMigrations.js");
const promptRunner = require("../dist/prompting/core/promptRunner.js");
const { BookAnalysisSourceCacheService } = require("../dist/services/bookAnalysis/caching/bookAnalysis.cache.js");
const { BookAnalysisGenerationService } = require("../dist/services/bookAnalysis/bookAnalysis.generation.js");
const { BookAnalysisCommandService } = require("../dist/services/bookAnalysis/application/BookAnalysisCommandService.js");
const { BookAnalysisQueryService } = require("../dist/services/bookAnalysis/application/BookAnalysisQueryService.js");

test.before(() => ensureRuntimeDatabaseReady());
test.after(() => prisma.$disconnect());

async function createFixture(budgetTokens) {
  const headings = ["第一章 相遇", "第二章 分离", "第三章 归来"];
  const content = headings.map((heading) => `${heading}\n${"原文正文".repeat(90)}`).join("\n\n");
  const document = await prisma.knowledgeDocument.create({ data: { title: "拆书用例", fileName: "source.txt" } });
  const version = await prisma.knowledgeDocumentVersion.create({ data: {
    documentId: document.id,
    versionNumber: 1,
    content,
    contentHash: createHash("sha256").update(content).digest("hex"),
    charCount: content.length,
  } });
  const analysis = await prisma.bookAnalysis.create({ data: {
    documentId: document.id,
    documentVersionId: version.id,
    title: document.title,
    status: "succeeded",
    budgetTokens,
  } });
  return {
    headings,
    analysis,
    input: { analysisId: analysis.id, documentVersionId: version.id, content, provider: "deepseek" },
  };
}

function usage(totalTokens) {
  return { tokenUsage: { promptTokens: totalTokens - 5, completionTokens: 5, totalTokens } };
}

async function readUsage(analysisId) {
  const row = await prisma.bookAnalysis.findUniqueOrThrow({ where: { id: analysisId } });
  return row.usedTokens;
}

test("source note generation keeps completed notes and counts paid calls once when resuming with a larger budget", async (t) => {
  const { headings, analysis, input } = await createFixture(100);
  const calls = [];
  t.mock.method(promptRunner, "runStructuredPrompt", async ({ promptInput }) => {
    calls.push(promptInput.segmentLabel);
    return { output: { summary: promptInput.segmentLabel }, meta: usage(60) };
  });

  await assert.rejects(new BookAnalysisSourceCacheService().getOrBuildSourceNotes(input), /budget_exceeded/);
  assert.deepEqual(calls, headings.slice(0, 2));
  assert.equal(await readUsage(analysis.id), 120);

  await prisma.bookAnalysis.update({ where: { id: analysis.id }, data: { budgetTokens: 500 } });
  const resumed = await new BookAnalysisSourceCacheService().getOrBuildSourceNotes(input);
  assert.deepEqual(resumed.notes.map((note) => note.summary), headings);
  assert.deepEqual(calls, headings);
  assert.equal(await readUsage(analysis.id), 180);

  const cached = await new BookAnalysisSourceCacheService().getOrBuildSourceNotes(input);
  assert.equal(cached.cacheHit, true);
  assert.deepEqual(calls, headings);
  assert.equal(await readUsage(analysis.id), 180);
});

test("source note generation retries only the missing notes after a model failure", async (t) => {
  const { headings, analysis, input } = await createFixture(500);
  const calls = [];
  let interrupted = true;
  t.mock.method(promptRunner, "runStructuredPrompt", async ({ promptInput }) => {
    const heading = promptInput.segmentLabel;
    calls.push(heading);
    if (interrupted && heading === headings[1]) throw new Error("model unavailable");
    return { output: { summary: heading }, meta: usage(60) };
  });

  await assert.rejects(new BookAnalysisSourceCacheService().getOrBuildSourceNotes(input), /model unavailable/);
  assert.equal(await readUsage(analysis.id), 60);

  interrupted = false;
  const resumed = await new BookAnalysisSourceCacheService().getOrBuildSourceNotes(input);
  assert.deepEqual(resumed.notes.map((note) => note.summary), headings);
  assert.deepEqual(calls, [headings[0], headings[1], headings[1], headings[2]]);
  assert.equal(await readUsage(analysis.id), 180);
});

test("concurrent source notes all persist in source order and each call is recorded", { timeout: 5000 }, async (t) => {
  process.env.BOOK_ANALYSIS_NOTES_CONCURRENCY = "2";
  t.after(() => { process.env.BOOK_ANALYSIS_NOTES_CONCURRENCY = "1"; });
  const { headings, analysis, input } = await createFixture(500);
  let inFlight = 0;
  let peak = 0;
  let release;
  const bothStarted = new Promise((resolve) => { release = resolve; });
  t.mock.method(promptRunner, "runStructuredPrompt", async ({ promptInput }) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    if (inFlight === 2) release();
    await bothStarted;
    inFlight -= 1;
    return { output: { summary: promptInput.segmentLabel }, meta: usage(60) };
  });

  await new BookAnalysisSourceCacheService().getOrBuildSourceNotes(input);
  assert.equal(peak, 2);
  assert.equal(await readUsage(analysis.id), 180);

  const cached = await new BookAnalysisSourceCacheService().getOrBuildSourceNotes(input);
  assert.equal(cached.cacheHit, true);
  assert.deepEqual(cached.notes.map((note) => note.summary), headings);
  assert.equal(await readUsage(analysis.id), 180);
});

test("AI optimization counts its returned draft even if it reaches the budget, then blocks another call", async (t) => {
  const { analysis } = await createFixture(100);
  await prisma.bookAnalysisSection.create({ data: {
    analysisId: analysis.id,
    sectionKey: "plot_structure",
    title: "剧情结构",
    sortOrder: 1,
    aiContent: "现有分析",
  } });
  const prompt = t.mock.method(promptRunner, "runStructuredPrompt", async () => ({
    output: { optimizedDraft: "优化分析" },
    meta: usage(120),
  }));
  const runner = new BookAnalysisGenerationService({
    getOrBuildSourceNotes: async () => ({ notes: [], segmentCount: 3, cacheHit: true }),
  });
  const input = { analysisId: analysis.id, sectionKey: "plot_structure", currentDraft: "现有分析", instruction: "提炼冲突" };

  assert.equal(await runner.optimizeSectionPreview(input), "优化分析");
  assert.equal(await readUsage(analysis.id), 120);
  await assert.rejects(runner.optimizeSectionPreview(input), /budget_exceeded/);
  assert.equal(prompt.mock.callCount(), 1);
});

test("regenerating an edited overview keeps the saved text active until the reviewed AI version is saved", async () => {
  const { analysis } = await createFixture(500);
  await prisma.bookAnalysisSection.create({ data: {
    analysisId: analysis.id,
    sectionKey: "overview",
    title: "拆书总览",
    sortOrder: 0,
    aiContent: "旧生成版",
    status: "succeeded",
  } });
  const queryService = new BookAnalysisQueryService();
  const command = new BookAnalysisCommandService(queryService);
  await command.updateSection(analysis.id, "overview", { editedContent: "手改总览" });

  let generatedText = "AI 重做总览";
  const runner = new BookAnalysisGenerationService({
    getOrBuildSourceNotes: async () => ({ notes: [], segmentCount: 3, cacheHit: true }),
  }, {
    generateSection: async () => ({
      markdown: generatedText,
      structuredData: { genreTags: ["悬疑"] },
      evidence: [],
      normalizationWarnings: [],
    }),
  });
  await runner.runSingleSection(analysis.id, "overview");
  const regenerated = await queryService.getAnalysisById(analysis.id);
  assert.equal(regenerated.summary, "手改总览");
  assert.equal(regenerated.sections[0].editedContent, "手改总览");
  assert.equal(regenerated.sections[0].aiContent, "AI 重做总览");

  const adopted = await command.updateSection(analysis.id, "overview", { editedContent: regenerated.sections[0].aiContent });
  assert.equal(adopted.summary, "AI 重做总览");
  assert.equal(adopted.sections[0].editedContent, null);
  assert.deepEqual(adopted.sections[0].structuredData.genreTags, ["悬疑"]);

  generatedText = "另一份 AI 总览";
  await runner.runSingleSection(analysis.id, "overview");
  const reviewed = await command.updateSection(analysis.id, "overview", { editedContent: regenerated.sections[0].aiContent });
  assert.equal(reviewed.summary, "AI 重做总览");
  assert.equal(reviewed.sections[0].editedContent, "AI 重做总览");
  assert.equal(reviewed.sections[0].aiContent, "另一份 AI 总览");
});

test("full regeneration feeds dependent sections from the active edited overview", async () => {
  const { analysis } = await createFixture(500);
  await prisma.bookAnalysisSection.createMany({ data: [{
    analysisId: analysis.id,
    sectionKey: "overview",
    title: "拆书总览",
    sortOrder: 0,
    aiContent: "旧生成定位",
    editedContent: "手改定位",
    status: "idle",
  }, {
    analysisId: analysis.id,
    sectionKey: "plot_structure",
    title: "剧情结构",
    sortOrder: 1,
    status: "idle",
  }] });
  const overviewContexts = [];
  const runner = new BookAnalysisGenerationService({
    getOrBuildSourceNotes: async () => ({ notes: [], segmentCount: 3, cacheHit: true }),
  }, {
    generateSection: async (key, _notes, _provider, _model, _temperature, _maxTokens, options) => {
      if (key === "plot_structure") overviewContexts.push(options.overviewContext);
      return {
        markdown: key === "overview" ? "AI 生成新定位" : "AI 生成剧情结构",
        structuredData: key === "overview" ? { oneLinePositioning: "AI 生成新定位" } : {},
        evidence: [],
        normalizationWarnings: [],
      };
    },
  });

  await runner.runFullAnalysis(analysis.id);
  assert.equal(overviewContexts.length, 1);
  assert.equal(overviewContexts[0].markdownSummary, "手改定位");
  assert.equal(overviewContexts[0].oneLinePositioning, undefined);
  const regenerated = await new BookAnalysisQueryService().getAnalysisById(analysis.id);
  assert.equal(regenerated.status, "succeeded");
  assert.equal(regenerated.summary, "手改定位");
  assert.equal(regenerated.sections[0].aiContent, "AI 生成新定位");
});
