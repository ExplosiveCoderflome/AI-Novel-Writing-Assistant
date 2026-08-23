const test = require("node:test");
const assert = require("node:assert/strict");

const {
  selectMarketAnalysisSnapshots,
} = require("../dist/modules/marketRadar/application/MarketRadarService.js");
const {
  marketPlatformDigestSchema,
  marketTrendReportSchema,
} = require("../dist/prompting/prompts/marketRadar/marketRadar.promptSchemas.js");

test("market radar analyzes only new-book lists when a platform has one", () => {
  const snapshots = [
    { platform: "fanqie", listKey: "new_book" },
    { platform: "fanqie", listKey: "reading" },
    { platform: "qidian", listKey: "hotsales" },
  ];

  assert.deepEqual(selectMarketAnalysisSnapshots(snapshots), [
    snapshots[0],
    snapshots[2],
  ]);
});

test("market radar schemas reject oversized signal lists", () => {
  const signal = {
    id: "signal",
    kind: "genre",
    label: "热门题材",
    summary: "这是一个用于验证市场信号输出数量限制的有效摘要内容。",
    direction: "current",
    heat: 50,
    crowding: 50,
    evidenceItemIds: ["evidence"],
    recommended: false,
  };

  assert.equal(marketPlatformDigestSchema.safeParse({ platformSummary: "这是满足最小长度的平台市场归纳摘要。", signals: Array(11).fill(signal) }).success, false);
  assert.equal(marketTrendReportSchema.safeParse({ summary: "这是满足最小长度的跨平台市场综合分析摘要文本。", signals: Array(13).fill(signal) }).success, false);
});
