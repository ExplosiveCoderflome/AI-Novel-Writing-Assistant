const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findMarketFoundationAsset,
  parseStoredMarketBriefSelection,
  toMarketFoundationCandidate,
  selectMarketAnalysisItems,
  selectMarketAnalysisSnapshots,
} = require("../dist/modules/marketRadar/application/MarketRadarService.js");
const {
  marketPlatformDigestSchema,
  marketTrendReportSchema,
} = require("../dist/prompting/prompts/marketRadar/marketRadar.promptSchemas.js");

const storyModeProfile = {
  coreDrive: "持续解决身份与能力带来的阶段目标。",
  readerReward: "稳定获得成长、反转和关系推进。",
  progressionUnits: ["能力成长", "线索推进"],
  allowedConflictForms: ["身份冲突", "目标竞争"],
  forbiddenConflictForms: ["无关支线拖延"],
  conflictCeiling: "high",
  resolutionStyle: "通过选择、行动和能力兑现解决冲突。",
  chapterUnit: "每章完成一个局部目标并留下新压力。",
  volumeReward: "卷末兑现阶段成长与关键真相。",
  mandatorySignals: ["持续成长", "目标推进"],
  antiSignals: ["重复受挫", "长期无进展"],
};

function productionFoundation() {
  const base = {
    existingId: null,
    name: "都市异能",
    description: "现代城市中由异常能力推动的成长与冲突故事。",
    template: "围绕能力代价、身份暴露和城市危机持续推进。",
    reason: "榜单证据显示读者持续关注身份反差与能力成长。",
    evidenceItemIds: ["evidence"],
  };
  return {
    genre: base,
    primaryStoryMode: { ...base, name: "能力成长", profile: storyModeProfile },
    secondaryStoryMode: null,
  };
}

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

test("market radar honors the lists explicitly selected for AI analysis", () => {
  const snapshots = [
    { platform: "fanqie", listKey: "new_book" },
    { platform: "fanqie", listKey: "reading" },
    { platform: "qidian", listKey: "hotsales" },
  ];

  assert.deepEqual(selectMarketAnalysisSnapshots(snapshots, [
    { platform: "fanqie", listKey: "reading" },
    { platform: "qidian", listKey: "hotsales" },
  ]), [snapshots[1], snapshots[2]]);
});

test("market radar limits AI evidence to explicitly selected books", () => {
  const items = [{ id: "book-1" }, { id: "book-2" }, { id: "book-3" }];
  assert.deepEqual(selectMarketAnalysisItems(items, ["book-1", "book-3"]), [items[0], items[2]]);
  assert.deepEqual(selectMarketAnalysisItems(items), items);
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
  assert.equal(marketTrendReportSchema.safeParse({
    summary: "这是满足最小长度的跨平台市场综合分析摘要文本。",
    signals: Array(13).fill(signal),
    productionFoundation: productionFoundation(),
  }).success, false);
});

test("market foundation assets reuse explicit ids or normalized names", () => {
  const options = [{ id: "genre-1", name: "都市异能" }];
  assert.equal(findMarketFoundationAsset(options, { existingId: "genre-1", name: "其他名称" })?.id, "genre-1");
  assert.equal(findMarketFoundationAsset(options, { existingId: null, name: " 都市异能 " })?.id, "genre-1");
  assert.equal(findMarketFoundationAsset(options, { existingId: null, name: "仙侠" }), null);
});

test("market briefs read both legacy signal arrays and unified foundation payloads", () => {
  const signals = [{ id: "signal-1" }];
  assert.deepEqual(parseStoredMarketBriefSelection(JSON.stringify(signals)), { signals });

  const foundation = { summary: "统一生产底座" };
  assert.deepEqual(parseStoredMarketBriefSelection(JSON.stringify({ signals, productionFoundation: foundation })), {
    signals,
    productionFoundation: foundation,
  });
});

test("legacy automatic foundation references become manual candidates without a synced state", () => {
  const candidate = toMarketFoundationCandidate({
    signals: [],
    productionFoundation: {
      summary: "推荐方向",
      genre: { id: "genre-existing", name: "西方魔幻", path: "奇幻 / 西方魔幻", reason: "题材证据", source: "market_recommended" },
      primaryStoryMode: { id: "mode-existing", name: "升级成长", path: "成长冒险 / 升级成长", reason: "推进证据", source: "market_recommended" },
      secondaryStoryMode: null,
      caution: null,
      recommendedAt: "2026-08-26T00:00:00.000Z",
    },
  });

  assert.deepEqual(candidate, {
    genre: { existingId: "genre-existing", name: "西方魔幻", reason: "题材证据" },
    primaryStoryMode: { existingId: "mode-existing", name: "升级成长", reason: "推进证据" },
    secondaryStoryMode: null,
  });
});
