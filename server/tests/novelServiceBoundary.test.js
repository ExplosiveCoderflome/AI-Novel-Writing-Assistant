const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(repoRoot, "src");

function readSource(...segments) {
  return fs.readFileSync(path.join(repoRoot, "src", ...segments), "utf8");
}

function walkTsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkTsFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

test("novel routes depend on application capabilities instead of NovelService", () => {
  const routeFiles = walkTsFiles(path.join(repoRoot, "src", "routes"));
  const offenders = routeFiles.filter((file) => readSource(path.relative(path.join(repoRoot, "src"), file)).includes("NovelService"));

  assert.deepEqual(offenders.map((file) => path.relative(repoRoot, file)), []);
});

test("NovelService compatibility facade does not inherit the legacy service chain", () => {
  const novelServiceSource = readSource("services", "novel", "NovelService.ts");
  assert.equal(/class\s+NovelService\s+extends/.test(novelServiceSource), false);

  for (const fileName of [
    "NovelArtifactService.ts",
    "NovelGenerationService.ts",
    "NovelReviewService.ts",
    "NovelPipelineService.ts",
  ]) {
    const source = readSource("services", "novel", fileName);
    assert.equal(source.includes("extends Novel"), false, `${fileName} must not extend another Novel service`);
  }
});

test("production code uses the application capability layer instead of new NovelService", () => {
  const sourceFiles = walkTsFiles(srcRoot);
  const offenders = sourceFiles
    .filter((file) => !file.endsWith(path.join("services", "novel", "NovelService.ts")))
    .filter((file) => readSource(path.relative(srcRoot, file)).includes("new NovelService"));

  assert.deepEqual(offenders.map((file) => path.relative(repoRoot, file)), []);
});

test("shared novel application services returns one process-level instance", () => {
  const {
    getSharedNovelServices,
    _resetSharedNovelServicesForTest,
  } = require("../dist/services/novel/application/sharedNovelServices.js");

  _resetSharedNovelServicesForTest();
  const first = getSharedNovelServices();
  const second = getSharedNovelServices();
  assert.equal(first, second);

  _resetSharedNovelServicesForTest();
  const third = getSharedNovelServices();
  assert.notEqual(first, third);
});

test("production code gets application capabilities through the shared singleton", () => {
  const allowedDirectFactoryFiles = new Set([
    path.join("services", "novel", "application", "NovelApplicationServices.ts"),
    path.join("services", "novel", "application", "sharedNovelServices.ts"),
    path.join("services", "novel", "NovelService.ts"),
    path.join("services", "novel", "NovelArtifactService.ts"),
    path.join("services", "novel", "NovelGenerationService.ts"),
    path.join("services", "novel", "NovelPipelineService.ts"),
    path.join("services", "novel", "NovelReviewService.ts"),
  ]);
  const offenders = walkTsFiles(srcRoot)
    .filter((file) => {
      const relativePath = path.relative(srcRoot, file);
      return !allowedDirectFactoryFiles.has(relativePath);
    })
    .filter((file) => /\bcreateNovelApplicationServices\s*\(/.test(readSource(path.relative(srcRoot, file))));

  assert.deepEqual(offenders.map((file) => path.relative(repoRoot, file)), []);
});

test("novel event handlers enqueue durable side effect jobs instead of running heavy services inline", () => {
  const source = readSource("events", "handlers", "registerNovelEventHandlers.ts");

  assert.equal(source.includes("createNovelApplicationServices"), false);
  assert.equal(source.includes("new CharacterDynamicsService"), false);
  assert.equal(source.includes("createNovelSnapshot"), false);
  assert.equal(source.includes("enqueueJob"), true);
});

test("event handlers do not import heavy side-effect executors directly", () => {
  const source = readSource("events", "handlers", "registerNovelEventHandlers.ts");

  assert.equal(/from\s+["'].*services\/rag/.test(source), false);
  assert.equal(/from\s+["'].*VectorStore/.test(source), false);
  assert.equal(/from\s+["'].*CharacterDynamicsService/.test(source), false);
  assert.equal(/from\s+["'].*sharedNovelServices/.test(source), false);
});

test("global replan callers require an explicit stop_for_replan action", () => {
  const plannerSource = readSource("services", "planner", "PlannerService.ts");
  const reviewSource = readSource("services", "novel", "novelCoreReviewService.ts");
  const pipelineSource = readSource("services", "novel", "novelCorePipelineService.ts");

  assert.equal(plannerSource.includes(').action === "stop_for_replan"'), true);
  assert.equal(reviewSource.includes('replanRecommendation.action === "stop_for_replan"'), true);
  assert.equal(pipelineSource.includes('replanRecommendation.action === "stop_for_replan"'), true);
});

test("RAG keeps its dedicated persisted index queue", () => {
  const schema = readSource("prisma", "schema.prisma");
  const ragService = readSource("services", "rag", "RagIndexService.ts");

  assert.equal(schema.includes("model RagIndexJob"), true);
  assert.equal(ragService.includes("prisma.ragIndexJob"), true);
});

test("core chapter generation delegates to production capabilities instead of runtime coordinator", () => {
  const source = readSource("services", "novel", "novelCoreGenerationService.ts");

  assert.equal(source.includes("ChapterRuntimeCoordinator"), false);
  assert.equal(source.includes("chapterRuntimeCoordinator"), false);
  assert.equal(source.includes("getSharedNovelServices"), true);
});

test("application chapter generation stays on the unified production orchestrator path", () => {
  const source = readSource("services", "novel", "application", "NovelApplicationServices.ts");

  assert.equal(source.includes("novelProductionOrchestrator.runStage"), true);
  assert.equal(source.includes("stage: \"chapter_execution\""), true);
  assert.equal(source.includes("this.core.createChapterStream"), false);
});
