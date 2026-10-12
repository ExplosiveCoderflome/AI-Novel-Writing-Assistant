const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");

const prismaPath = require.resolve("../dist/db/prisma.js");
const statePath = require.resolve("../dist/services/novel/director/state/index.js");
const routePath = require.resolve("../dist/modules/novel/setup/http/novelBaseRoutes.js");

test("simple shelf projects the book's current director task even when an older task was updated later", async () => {
  const original = new Map([prismaPath, statePath, routePath].map((path) => [path, require.cache[path]]));
  const novel = {
    id: "book-1",
    title: "Book",
    description: null,
    bookSellingPoint: null,
    competingFeel: null,
    first30ChapterPromise: null,
    creationExperience: "simple",
    estimatedChapterCount: 1,
    world: null,
    bookContract: null,
    characters: [],
    volumePlans: [],
    chapters: [],
    _count: { characters: 0, volumePlans: 0 },
    workflowTasks: [{
      id: "old-running",
      status: "running",
      progress: 75,
      currentItemLabel: "Old work",
      pendingManualRecovery: false,
      lastError: null,
      checkpointType: null,
      seedPayloadJson: null,
      directorEvents: [],
    }],
  };
  const currentTask = {
    id: "new-failed",
    status: "failed",
    progress: 30,
    currentItemLabel: "Needs recovery",
    pendingManualRecovery: false,
    lastError: "Paused at chapter",
    checkpointType: "replan_required",
    seedPayloadJson: null,
    directorEvents: [],
  };
  const calls = [];
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: { prisma: {
      novel: { findUnique: async () => novel },
      novelWorkflowTask: { findUnique: async (query) => {
        calls.push(query.where.id);
        return currentTask;
      } },
    } },
  };
  require.cache[statePath] = {
    id: statePath,
    filename: statePath,
    loaded: true,
    exports: { resolveCurrentDirectorTask: async (novelId) => {
      assert.equal(novelId, "book-1");
      return currentTask;
    } },
  };
  delete require.cache[routePath];
  let server;
  try {
    const { registerNovelBaseRoutes } = require(routePath);
    const app = express();
    const router = express.Router();
    registerNovelBaseRoutes({ router, novelService: {} });
    app.use("/novels", router);
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/novels/book-1/simple-shelf`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.progress.directorTaskId, "new-failed");
    assert.equal(body.data.progress.status, "failed");
    assert.deepEqual(calls, ["new-failed"]);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    for (const [path, entry] of original) {
      if (entry) require.cache[path] = entry;
      else delete require.cache[path];
    }
  }
});
