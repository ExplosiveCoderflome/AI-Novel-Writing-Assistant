const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildFallbackVolumesFromLegacy,
  parseLegacyStructuredOutline,
} = require("../dist/services/novel/volume/volumePlanUtils.js");

test("legacy structured outline migration upgrades old volume payloads into normalized v2 volumes and merges arc signals", () => {
  const structuredOutline = JSON.stringify({
    volumes: [{
      volumeTitle: "旧第一卷",
      summary: "旧卷摘要",
      chapters: [{
        order: 1,
        title: "旧第1章",
        summary: "旧章摘要",
        purpose: "建立压迫",
      }],
    }],
  });
  const volumes = buildFallbackVolumesFromLegacy("novel-1", {
    structuredOutline,
    arcPlans: [{
      externalRef: "1",
      title: "卷一起势",
      objective: "主角第一次完成反压",
      phaseLabel: "起势",
      hookTarget: "更强敌人即将入场",
      rawPlanJson: JSON.stringify({
        climax: "卷末反压成立",
        openPayoffs: ["伏笔A"],
      }),
    }],
  });

  assert.equal(volumes.length, 1);
  assert.equal(volumes[0].novelId, "novel-1");
  assert.equal(volumes[0].title, "旧第一卷");
  assert.equal(volumes[0].mainPromise, "主角第一次完成反压");
  assert.equal(volumes[0].escalationMode, "起势");
  assert.equal(volumes[0].climax, "卷末反压成立");
  assert.deepEqual(volumes[0].openPayoffs, ["伏笔A"]);
  assert.equal(volumes[0].chapters[0].chapterOrder, 1);
  assert.equal(volumes[0].chapters[0].purpose, "建立压迫");
});

test("legacy chapter-only projects fall back to synthesized volume skeletons instead of staying half-migrated", () => {
  const volumes = buildFallbackVolumesFromLegacy("novel-legacy", {
    outline: "一个被压制的小人物逐步反压。",
    chapters: [
      {
        order: 1,
        title: "第1章",
        expectation: "主角开局被压制",
        targetWordCount: 3000,
        conflictLevel: 75,
        revealLevel: 10,
        mustAvoid: "不要解释过多世界观",
        taskSheet: "先立压迫",
      },
      {
        order: 2,
        title: "第2章",
        expectation: "主角第一次试探反击",
        targetWordCount: 3200,
        conflictLevel: 80,
        revealLevel: 20,
        mustAvoid: "不要直接赢",
        taskSheet: "试探反压",
      },
    ],
  });

  assert.equal(volumes.length, 1);
  assert.equal(volumes[0].title, "第1卷");
  assert.equal(volumes[0].mainPromise, "主角开局被压制");
  assert.equal(volumes[0].chapters.length, 2);
  assert.equal(volumes[0].chapters[0].summary, "主角开局被压制");
  assert.equal(volumes[0].chapters[1].taskSheet, "试探反压");
});

test("parseLegacyStructuredOutline accepts flat chapter arrays and turns them into a single normalized volume", () => {
  const parsed = parseLegacyStructuredOutline(JSON.stringify([
    {
      order: 1,
      title: "第1章",
      summary: "开局压迫",
    },
    {
      order: 2,
      title: "第2章",
      summary: "第一次试探反压",
    },
  ]));

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].title, "第1卷");
  assert.equal(parsed[0].chapters.length, 2);
  assert.equal(parsed[0].chapters[1].chapterOrder, 2);
});
