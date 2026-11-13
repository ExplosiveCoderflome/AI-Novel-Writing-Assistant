const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// Regression for issue #197: a fresh book only has a single empty initialization
// placeholder volume. Strategy recovery used to adopt that placeholder as the
// author's chosen volume count, persist a one-volume strategy and return it as
// the saved skeleton, so a 200-chapter target still produced one volume. This
// test drives the real director volume-strategy step against a fresh book with a
// 200-chapter target and asserts the persisted plan has more than one volume.
test("director volume strategy produces multiple volumes for a fresh book with a long target", () => {
  const root = path.resolve(__dirname, "../..");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "issue-197-volume-one-"));
  const script = path.join(dir, "verify.cjs");
  fs.writeFileSync(script, String.raw`
const assert = require("node:assert/strict");
const path = require("node:path");
const server = path.join(process.env.DIRECTOR_NEXT_REPO_ROOT, "server");
const { prisma } = require(path.join(server, "dist/db/prisma"));
const { ensureRuntimeDatabaseReady } = require(path.join(server, "dist/db/runtimeMigrations"));
const { NovelVolumeService } = require(path.join(server, "dist/services/novel/volume/NovelVolumeService"));
const { createVolumeStrategyStepHandler } = require(path.join(server, "dist/modules/director/steps/planning/volumeStrategy"));
const { buildVolumeCountGuidance } = require(path.join(process.env.DIRECTOR_NEXT_REPO_ROOT, "shared/dist/types/volumePlanning.js"));

function strategyFor(count) {
  return {
    recommendedVolumeCount: count,
    hardPlannedVolumeCount: Math.min(count, 3),
    readerRewardLadder: "回报梯度", escalationLadder: "压力梯度", midpointShift: "中盘转向", notes: "卷战略",
    volumes: Array.from({ length: count }, (_, index) => ({
      sortOrder: index + 1,
      planningMode: index < Math.min(count, 3) ? "hard" : "soft",
      roleLabel: "阶段" + (index + 1),
      coreReward: "阶段回报",
      escalationFocus: "阶段压力",
      uncertaintyLevel: index < 3 ? "low" : "medium",
    })),
    uncertainties: [],
  };
}
function skeletonFor(count) {
  return Array.from({ length: count }, (_, index) => ({
    title: "第" + (index + 1) + "卷", summary: "卷摘要", openingHook: "开卷抓手", mainPromise: "主承诺",
    primaryPressureSource: "主压力", coreSellingPoint: "卖点", escalationMode: "升级", protagonistChange: "变化",
    midVolumeRisk: "风险", climax: "高潮", payoffType: "兑现", nextVolumeHook: "钩子", openPayoffs: [],
  }));
}

(async () => {
  await ensureRuntimeDatabaseReady();
  await prisma.novel.create({ data: { id: "fresh-book", title: "新书", directorVersion: "v2", estimatedChapterCount: 200 } });

  const calls = [];
  const original = NovelVolumeService.prototype.generateVolumes;
  NovelVolumeService.prototype.generateVolumes = async function (novelId, input) {
    const workspace = await this.getVolumes(novelId, { hydrateCanonical: false });
    calls.push({
      scope: input.scope,
      userPreferredVolumeCount: input.userPreferredVolumeCount,
      respectExistingVolumeCount: input.respectExistingVolumeCount,
      skeletonVolumeCount: input.skeletonVolumeCount,
    });
    if (input.scope === "strategy") {
      const count = input.userPreferredVolumeCount
        ?? buildVolumeCountGuidance({ chapterBudget: input.estimatedChapterCount ?? 0 }).recommendedVolumeCount;
      return { ...workspace, volumes: [], strategyPlan: strategyFor(count) };
    }
    const strategyPlan = input.draftWorkspace?.strategyPlan ?? workspace.strategyPlan;
    if (input.scope === "strategy_critique") {
      return { ...workspace, strategyPlan, critiqueReport: { overallRisk: "low", summary: "ok", issues: [], recommendedActions: [] } };
    }
    if (input.scope === "skeleton") {
      const count = input.skeletonVolumeCount ?? strategyPlan?.recommendedVolumeCount ?? 1;
      return {
        ...workspace,
        strategyPlan,
        critiqueReport: { overallRisk: "low", summary: "ok", issues: [], recommendedActions: [] },
        volumes: skeletonFor(count).map((volume, index) => ({
          ...volume, id: "volume-" + (index + 1), novelId, sortOrder: index + 1,
          primaryPressureSource: "主压力", resetPoint: null, status: "active", sourceVersionId: null,
          chapters: [], createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
        })),
      };
    }
    throw new Error("unexpected scope: " + input.scope);
  };

  try {
    const handler = createVolumeStrategyStepHandler({
      inputProvider: async () => ({ provider: "stub", model: "stub", estimatedChapterCount: 200 }),
      volumeService: new NovelVolumeService(),
      contentHash: () => "hash",
    });
    const result = await handler({ runId: "run-1", contract: { novelId: "fresh-book", scope: "book" } });
    assert.ok(result.artifact, "strategy step must save an artifact");

    const strategyCall = calls.find((call) => call.scope === "strategy");
    assert.equal(strategyCall.respectExistingVolumeCount, false);
    assert.equal(strategyCall.userPreferredVolumeCount, undefined, "the placeholder must not act as a fixed user count");

    const workspace = await new NovelVolumeService().getVolumes("fresh-book", { hydrateCanonical: false });
    assert.ok(workspace.strategyPlan, "strategy plan must be persisted");
    assert.ok(workspace.strategyPlan.recommendedVolumeCount > 1);
    assert.equal(workspace.volumes.length, workspace.strategyPlan.recommendedVolumeCount);
    assert.ok(workspace.volumes.length > 1, "a 200-chapter book must not lock to a single volume");
  } finally {
    NovelVolumeService.prototype.generateVolumes = original;
  }
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
`);
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    timeout: 120000,
    env: {
      ...process.env,
      NODE_ENV: "test",
      AI_NOVEL_RUNTIME: "desktop",
      AI_NOVEL_APP_DATA_DIR: dir,
      DIRECTOR_NEXT_REPO_ROOT: root,
      DATABASE_URL: "file:" + path.join(dir, "volume.db").replace(/\\/g, "/"),
    },
  });
  assert.equal(result.status, 0, result.stderr + "\n" + result.stdout);
});
