const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

test("drama prompt assets are registered", () => {
  const { hasRegisteredPromptAsset } = require("../dist/prompting/registry.js");
  const prompts = [
    ["drama.source.original_bundle", "v1"],
    ["drama.source.text_bundle", "v1"],
    ["drama.track.recommendation", "v1"],
    ["drama.source.supplement", "v1"],
    ["drama.strategy", "v1"],
    ["drama.episodeOutline", "v1"],
    ["drama.episode.script", "v1"],
    ["drama.episode.quality", "v1"],
    ["drama.episode.repair", "v1"],
    ["drama.storyboard", "v1"],
    ["drama.video.prompt", "v1"],
  ];
  for (const [id, version] of prompts) {
    assert.equal(hasRegisteredPromptAsset(id, version), true, `${id}@${version} should be registered`);
  }
});

test("drama video provider registry exposes mock provider", async () => {
  const { videoProviderRegistry } = require("../dist/services/drama/video/VideoProviderPort.js");
  const provider = videoProviderRegistry.resolve("mock");
  const providers = videoProviderRegistry.listProviders();
  assert.equal(providers.some((item) => item.provider === "mock"), true);
  assert.equal(providers.find((item) => item.provider === "mock")?.supportsRefImages, true);
  const result = await provider.createTask({
    prompt: "vertical drama shot",
    aspectRatio: "9:16",
    durationSec: 5,
    refImages: ["https://example.test/character-sheet.png"],
  });
  assert.match(result.providerTaskId, /^mock_/);
  assert.equal(result.status, "queued");
  assert.deepEqual(result.raw.refImages, ["https://example.test/character-sheet.png"]);
});

test("http drama video provider maps create and status responses", async () => {
  const createBodies = [];
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST" && req.url === "/create") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        createBodies.push(body ? JSON.parse(body) : {});
        res.end(JSON.stringify({ taskId: "task_1", status: "processing" }));
      });
      return;
    }
    if (req.method === "GET" && req.url === "/status/task_1") {
      res.end(JSON.stringify({ taskId: "task_1", status: "completed", resultUrl: "https://example.test/video.mp4" }));
      return;
    }
    if (req.method === "GET" && req.url === "/status/task_fail") {
      res.end(JSON.stringify({ taskId: "task_fail", status: "error", message: "quota exceeded" }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const { HttpVideoProvider } = require("../dist/services/drama/video/VideoProviderPort.js");
    const provider = new HttpVideoProvider({
      provider: "http-test",
      createUrl: `${baseUrl}/create`,
      statusUrl: `${baseUrl}/status/{taskId}`,
      supportsRefImages: true,
    });
    const created = await provider.createTask({
      prompt: "vertical drama shot",
      aspectRatio: "9:16",
      refImages: ["https://example.test/character-sheet.png"],
    });
    assert.equal(created.providerTaskId, "task_1");
    assert.equal(created.status, "running");
    assert.deepEqual(createBodies[0].refImages, ["https://example.test/character-sheet.png"]);

    const providerWithoutRefImages = new HttpVideoProvider({
      provider: "http-test-no-refs",
      createUrl: `${baseUrl}/create`,
    });
    await providerWithoutRefImages.createTask({
      prompt: "vertical drama shot",
      aspectRatio: "9:16",
      refImages: ["https://example.test/character-sheet.png"],
    });
    assert.equal(Object.hasOwn(createBodies[1], "refImages"), false);

    const refreshed = await provider.getTask("task_1");
    assert.equal(refreshed.status, "succeeded");
    assert.equal(refreshed.resultUrl, "https://example.test/video.mp4");
    assert.equal(refreshed.failureReason, undefined);

    const failed = await provider.getTask("task_fail");
    assert.equal(failed.status, "failed");
    assert.equal(failed.failureReason, "quota exceeded");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("drama migrations include pipeline tables for sqlite and postgres", () => {
  const root = path.join(__dirname, "..", "src", "prisma");
  const sqlite = fs.readFileSync(
    path.join(root, "migrations.sqlite", "20260609120000_drama_forge_pipeline", "migration.sql"),
    "utf8",
  );
  const postgres = fs.readFileSync(
    path.join(root, "migrations", "20260609120000_drama_forge_pipeline", "migration.sql"),
    "utf8",
  );
  for (const sql of [sqlite, postgres]) {
    assert.match(sql, /DramaProject/);
    assert.match(sql, /DramaEpisode/);
    assert.match(sql, /DramaStoryboard/);
    assert.match(sql, /DramaVideoPrompt/);
  }
  const sqliteProjectionSql = fs.readFileSync(
    path.join(root, "migrations.sqlite", "20260609170000_drama_video_task_projection", "migration.sql"),
    "utf8",
  );
  const postgresProjectionSql = fs.readFileSync(
    path.join(root, "migrations", "20260609170000_drama_video_task_projection", "migration.sql"),
    "utf8",
  );
  for (const sql of [sqliteProjectionSql, postgresProjectionSql]) {
    assert.match(sql, /resultUrl/);
    assert.match(sql, /failureReason/);
  }
});
