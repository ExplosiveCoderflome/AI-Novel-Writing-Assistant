const test = require("node:test");
const assert = require("node:assert/strict");
const {
  serializeNovelWorldAssetRows,
} = require("../dist/services/novel/worldContext/novelWorldAssets.js");

test("serializeNovelWorldAssetRows returns all standard world asset entries", () => {
  const assets = serializeNovelWorldAssetRows([]);
  assert.deepEqual(assets.map((asset) => asset.assetType), [
    "map",
    "faction_diagram",
    "timeline",
    "character_network",
    "power_system_tree",
  ]);
  assert.equal(assets.every((asset) => asset.status === "placeholder"), true);
  assert.equal(assets.every((asset) => asset.id === null), true);
});

test("serializeNovelWorldAssetRows keeps latest row for duplicated asset type", () => {
  const assets = serializeNovelWorldAssetRows([
    {
      id: "asset-old",
      assetType: "map",
      title: "旧版地图",
      description: "旧地图",
      status: "draft",
      thumbnailUrl: null,
      version: 2,
      renderDataJson: null,
      updatedAt: "2026-05-30T00:00:00.000Z",
    },
    {
      id: "asset-new",
      assetType: "map",
      title: "新版地图",
      description: "最新地图",
      status: "ready",
      thumbnailUrl: "https://example.test/map.png",
      version: 3,
      renderDataJson: "{\"regions\":[]}",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
  ]);
  const mapAsset = assets.find((asset) => asset.assetType === "map");
  assert.ok(mapAsset);
  assert.equal(mapAsset.id, "asset-new");
  assert.equal(mapAsset.title, "新版地图");
  assert.equal(mapAsset.status, "ready");
  assert.equal(mapAsset.hasRenderData, true);
  assert.equal(mapAsset.version, 3);
});
