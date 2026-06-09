const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
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
  const result = await provider.createTask({
    prompt: "vertical drama shot",
    aspectRatio: "9:16",
    durationSec: 5,
  });
  assert.match(result.providerTaskId, /^mock_/);
  assert.equal(result.status, "queued");
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
});
