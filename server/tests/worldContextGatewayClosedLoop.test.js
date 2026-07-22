const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { WorldContextGateway } = require("../dist/services/novel/worldContext/WorldContextGateway.js");

test("WorldContextGateway - Closed loop closed-loop assembly of Sandbox Camera Feed", async () => {
  const original = {
    branchFindFirst: prisma.sandboxBranch.findFirst,
    chronologyFindFirst: prisma.sandboxChronology.findFirst,
    ensureFromLegacyNovel: WorldContextGateway.prototype.hasActiveWorld
  };

  // Mock Active World Source
  let branchQueried = false;
  prisma.sandboxBranch.findFirst = async ({ where }) => {
    branchQueried = true;
    return { id: "branch-123", name: "Main", novelId: where.novelId };
  };

  let chronologyQueried = false;
  prisma.sandboxChronology.findFirst = async () => {
    chronologyQueried = true;
    return {
      id: "chron-123",
      observableDetails: `
# VIRTUAL CAMERA OBSERVATION FEED
**Location:** 潇湘馆 (Elevation: 48m)
**Atmosphere:** Temp 22.5°C | Illumination 80000 Lux

## Scene Composition
- **Flora Cover:** 90%
- **Active Agents present:** 林黛玉
      `.trim()
    };
  };

  // Mock WorldContextGateway private services
  const gateway = new WorldContextGateway();

  // Stub services
  gateway.worldSliceService.ensureStoryWorldSlice = async () => ({
    worldId: "world-123",
    coreWorldFrame: "红楼底色",
    appliedRules: [{ name: "规则1", summary: "付出代价", whyItMatters: "重要" }],
    forbiddenCombinations: ["配搭禁忌"],
    activeForces: [],
    activeLocations: [],
    pressureSources: [],
    conflictCandidates: [],
    recommendedEntryPoints: [],
    mysterySources: [],
    suggestedStoryAxes: [],
    metadata: {}
  });

  gateway.novelWorldService.ensureFromLegacyNovel = async () => ({ id: "novel-world-123" });
  gateway.novelWorldService.persistStorySlice = async () => {};

  try {
    const block = await gateway.getWorldContextBlock("novel-123", {
      purpose: "chapter",
      forceRefresh: false
    });

    assert.ok(block);
    assert.ok(branchQueried, "Should look for sandbox branch");
    assert.ok(chronologyQueried, "Should look for latest sandbox chronology");
    assert.ok(block.promptBlock.includes("【环境与物理传感器观察】"), "Observation header must be in promptBlock");
    assert.ok(block.promptBlock.includes("Location:** 潇湘馆"), "Location name must be matched in observation feed");
    assert.ok(block.promptBlock.includes("Temp 22.5°C"), "Temperature metric must be resolved in observation feed");
    assert.ok(block.promptBlock.includes("林黛玉"), "Active character name must be in the sensor feed");

  } finally {
    prisma.sandboxBranch.findFirst = original.branchFindFirst;
    prisma.sandboxChronology.findFirst = original.chronologyFindFirst;
  }
});
