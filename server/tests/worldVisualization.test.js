const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildFallbackWorldVisualizationPayload,
} = require("../dist/services/world/worldVisualization.js");

test("buildFallbackWorldVisualizationPayload extracts chinese faction types and relations", () => {
  const payload = buildFallbackWorldVisualizationPayload({
    id: "world-1",
    name: "抗战世界",
    worldType: "history",
    description: "以沦陷区抗战为核心的近代历史世界。",
    background: "卢沟桥事变后，北平周边迅速沦为多方势力角力区。",
    geography: "卢沟桥\n平汉线\n北平城郊\n沦陷区",
    cultures: null,
    magicSystem: null,
    politics: "国民政府与地下抗日组织保持脆弱合作，共同对抗日军。",
    races: null,
    religions: null,
    technology: "步枪作战\n铁路运输\n电台联络",
    conflicts: "日军长期围剿地下抗日组织，并与国民政府持续对抗。",
    history: "1937年 卢沟桥事变爆发\n1938年 沦陷区情报线形成",
    economy: null,
    factions: "国民政府\n日军\n地下抗日组织",
  });

  const nodeByLabel = Object.fromEntries(payload.factionGraph.nodes.map((node) => [node.label, node]));
  assert.equal(nodeByLabel["国民政府"].type, "state");
  assert.equal(nodeByLabel["日军"].type, "organization");
  assert.equal(nodeByLabel["地下抗日组织"].type, "organization");

  const relations = payload.factionGraph.edges.map((edge) => edge.relation);
  assert.ok(relations.some((item) => item === "合作" || item === "同盟"));
  assert.ok(relations.some((item) => item === "对抗" || item === "敌对"));
});

test("buildFallbackWorldVisualizationPayload keeps timeline and geography usable", () => {
  const payload = buildFallbackWorldVisualizationPayload({
    id: "world-2",
    name: "边境奇谭",
    worldType: "fantasy",
    description: null,
    background: null,
    geography: "王城\n灰岭\n黑河谷",
    cultures: null,
    magicSystem: "见习术士\n军团术士\n王庭大法师",
    politics: null,
    races: "人族\n狼族",
    religions: null,
    technology: null,
    conflicts: "狼族与王城守军长期对峙。",
    history: "1203年 黑河谷失守\n1205年 王城重建北境军团",
    economy: null,
    factions: "王城守军\n狼族部落",
  });

  assert.ok(payload.geographyMap.nodes.length >= 3);
  assert.ok(payload.powerTree.length >= 3);
  assert.equal(payload.timeline[0].year, "1203年");
  assert.match(payload.timeline[0].event, /黑河谷失守/);
});
