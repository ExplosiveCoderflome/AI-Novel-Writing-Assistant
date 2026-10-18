const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

function loadWithStubs(target, stubs) {
  const originalLoad = Module._load;
  const resolved = require.resolve(target);
  delete require.cache[resolved];
  try {
    Module._load = function (request, parent, isMain) {
      if (Object.hasOwn(stubs, request)) return stubs[request];
      return originalLoad.call(this, request, parent, isMain);
    };
    return require(target);
  } finally {
    Module._load = originalLoad;
  }
}

test("catalog keeps pagination, archived filtering, failed tasks and live step labels", async () => {
  const queries = [];
  const makeTask = (id, novelId, status, label = null) => ({
    id, novelId, status, currentItemLabel: label, progress: 20,
    checkpointType: null, currentStage: null, currentItemKey: null,
    checkpointSummary: null, lastError: null, seedPayloadJson: "{}", updatedAt: new Date("2026-10-15"),
  });
  const prisma = {
    novel: {
      findMany: async (query) => {
        queries.push(query);
        return [{ id: "a", novelWorld: { id: "world-a", title: "本书设定" } }, { id: "b" }];
      },
      count: async (query) => { queries.push(query); return 7; },
    },
    novelWorkflowTask: {
      findMany: async (query) => query.where.lane === "auto_director"
        ? [makeTask("archived", "a", "running"), makeTask("failed", "a", "failed"), makeTask("live", "b", "running")]
        : [makeTask("studio", "a", "waiting_recovery")],
    },
    directorStepRun: { findMany: async (query) => {
      assert.deepEqual(query.where.taskId.in, ["live"]);
      return [{ taskId: "live", label: "  准备章节  " }];
    } },
    imageAsset: { findMany: async () => [] },
    imageGenerationTask: { findMany: async () => [{ id: "cover", novelId: "a", status: "failed" }] },
  };
  const { listNovels } = loadWithStubs("../dist/services/novel/catalog/queries/NovelCatalogQuery.js", {
    "./NovelBookProgressQuery": {readNovelBookProgress: async books => new Map(books.map(book => [book.id,
      {writtenChapters: 0, targetChapters: null, director: null}]))},
    "../../../../db/prisma": { prisma },
    "../../../task/taskArchive": { getArchivedTaskIdSet: async () => new Set(["archived"]) },
    "../../novelTokenUsageSummary": { listNovelTokenUsageByNovelIds: async () => new Map() },
    "../../../image/imageGenerationMappers": { toImageAsset: (asset) => asset },
  });
  const result = await listNovels({ page: 2, limit: 2, search: "  故事  ", status: "draft", sort: "created" });
  assert.equal(queries[0].skip, 2);
  assert.equal(queries[0].take, 2);
  assert.deepEqual(queries[0].orderBy, { createdAt: "desc" });
  assert.deepEqual(queries[0].where, queries[1].where);
  assert.deepEqual(queries[0].where.OR[0], { title: { contains: "故事" } });
  assert.deepEqual([result.page, result.limit, result.total, result.totalPages], [2, 2, 7, 4]);
  assert.equal(result.items[0].latestAutoDirectorTask.id, "failed");
  assert.equal(result.items[0].latestAutoDirectorTask.status, "failed");
  assert.equal(result.items[0].latestCreationStudioTask.status, "waiting_recovery");
  assert.equal(result.items[1].latestAutoDirectorTask.currentItemLabel, "准备章节");
  assert.deepEqual(result.items[0].coverGeneration, { taskId: "cover", status: "failed" });
  assert.equal(result.items[0].world.name, "本书设定");
  assert.equal(result.items[1].primaryCover, null);
  const failure = new Error("catalog database unavailable");
  prisma.novel.count = async () => { throw failure; };
  await assert.rejects(listNovels({ page: 1, limit: 10 }), (error) => error === failure);
});

test("director fact reader distinguishes missing facts from failed reads", async () => {
  let failure = null;
  const read = async (value) => { if (failure) throw failure; return value; };
  const { DirectorFactReader } = loadWithStubs("../dist/services/novel/director/projections/DirectorFactReader.js", {
    "../../../../db/prisma": { prisma: {
      character: { findMany: () => read([]) }, chapter: { findMany: () => read([]) },
    } },
    "../../BookContractService": { BookContractService: class { getByNovelId() { return read(null); } } },
    "../../storyMacro/StoryMacroPlanService": { StoryMacroPlanService: class { getPlan() { return read(null); } } },
    "../../volume/read-model": { readVolumeWorkspace: () => read({ volumes: [], strategyPlan: null }) },
    "../runtime/ChapterExecutionProgressInspector": {
      ChapterExecutionProgressInspector: class { inspectNovel() { return read(null); } },
    },
  });
  const reader = new DirectorFactReader();
  const methods = ["getStoryMacroPlan", "getBookContract", "getCharacters", "getExecutionChapters", "getVolumeWorkspace", "getStructuredOutlineRecoveryCursor", "inspectChapterExecutionProgress"];
  for (const method of methods) {
    const result = await reader[method]("novel");
    assert.deepEqual(result, method === "getCharacters" || method === "getExecutionChapters" ? [] : null);
  }
  failure = new Error("database unavailable");
  for (const method of methods) {
    await assert.rejects(reader[method]("novel"), (error) => error === failure, method);
  }
});

test("volume fact reads use saved versions without invoking restore writes", async () => {
  const version = { id: "saved-version", contentJson: "{}" };
  let active = version;
  let volumes = [];
  let latest = null;
  const document = { volumes: [{ id: "volume" }], strategyPlan: {} };
  const { readVolumeWorkspace } = loadWithStubs("../dist/services/novel/volume/read-model/readVolumeWorkspace.js", {
    "../volumeWorkspacePersistence": {
      listActiveVolumeRows: async () => volumes,
      getActiveVersionRow: async () => active,
      getLatestVersionRow: async () => latest,
      runVolumeWorkspaceTransaction: () => { throw new Error("read attempted write"); },
      persistActiveVolumeWorkspace: () => { throw new Error("read attempted restore"); },
    },
    "../volumeWorkspaceDocument": {
      normalizeVolumeWorkspaceDocument: () => document,
      buildVolumeWorkspaceDocument: (input) => input,
    },
    "../legacyVolumeSource": { getLegacyVolumeSource: async () => ({}) },
    "../volumePlanUtils": { buildFallbackVolumesFromLegacy: () => [] },
  });
  assert.equal(await readVolumeWorkspace("novel"), document);
  active = null;
  latest = version;
  assert.equal(await readVolumeWorkspace("novel"), document);
  latest = null;
  volumes = [{ id: "active-volume" }];
  assert.equal((await readVolumeWorkspace("novel")).volumes, volumes);
  volumes = [];
  assert.equal((await readVolumeWorkspace("novel")).source, "empty");
});

test("fact summary caller propagates failed reads instead of computing missing planning facts", async () => {
  const failure = new Error("facts database unavailable");
  const { DirectorFactSummaryService } = loadWithStubs("../dist/services/novel/director/projections/DirectorFactSummaryService.js", {
    "../DirectorStateReader": { DirectorStateReader: class {} },
    "./DirectorFactReader": { DirectorFactReader: class {} },
    "../workflowStepRuntime/WorkflowStepModule": {
      getWorkflowStepProjectionHints: () => null,
      getWorkflowStepDirectorTaskId: (context) => context.taskId,
      getWorkflowStepArtifacts: () => [],
    },
  });
  const service = new DirectorFactSummaryService({
    stateReader: { readByTaskId: async () => ({ task: { novelId: "novel" }, launch: {}, run: {} }) },
    runtime: {
      getStoryMacroPlan: async () => null,
      getBookContract: async () => null,
      getCharacters: async () => { throw failure; },
      getVolumeWorkspace: async () => null,
      getExecutionChapters: async () => [],
    },
  });
  await assert.rejects(service.getBaseSummary({ taskId: "task" }), (error) => error === failure);
});
