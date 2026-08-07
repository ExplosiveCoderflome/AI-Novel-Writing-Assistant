import test from "node:test";
import assert from "node:assert/strict";
import {
  GRAPH_NODE_SIZE,
  buildGraphLayout,
  getShortRelation,
  getVisibleEdgeLabelIds,
} from "./worldGraphLayout.ts";

const factionNodes = Array.from({ length: 9 }, (_, index) => ({
  id: `faction-${index}`,
  label: `测试势力${index + 1}`,
  type: index < 6 ? "organization" : "faction",
}));
const factionEdges = factionNodes.slice(1).map((node, index) => ({
  source: factionNodes[index].id,
  target: node.id,
  relation: index % 2 === 0 ? "合作" : "竞争",
}));

test("faction force layout is deterministic and uses the available canvas", () => {
  assert.ok(GRAPH_NODE_SIZE.graph.width >= 200);
  assert.ok(GRAPH_NODE_SIZE.graph.height >= 80);
  const first = buildGraphLayout(factionNodes, factionEdges, 1040, 560, "graph");
  const second = buildGraphLayout(factionNodes, factionEdges, 1040, 560, "graph");
  assert.deepEqual([...first], [...second]);
  const xs = [...first.values()].map((point) => point.x);
  const ys = [...first.values()].map((point) => point.y);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 440);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 240);
  const distances = [...first.values()].flatMap((point, index, points) => (
    points.slice(index + 1).map((other) => Math.hypot(point.x - other.x, point.y - other.y))
  ));
  assert.ok(Math.min(...distances) > 120);
});

test("map force layout keeps direction semantics and separates duplicate coordinates", () => {
  const directionalNodes = [
    { id: "north", label: "北境", x: 50, y: 5, directionHint: "north" },
    { id: "south", label: "南境", x: 50, y: 95, directionHint: "south" },
    { id: "west", label: "西境", x: 5, y: 50, directionHint: "west" },
    { id: "east", label: "东境", x: 95, y: 50, directionHint: "east" },
  ];
  const directional = buildGraphLayout(directionalNodes, [], 1120, 620, "map");
  assert.ok(directional.get("north").y < directional.get("south").y);
  assert.ok(directional.get("west").x < directional.get("east").x);

  const duplicates = Array.from({ length: 4 }, (_, index) => ({
    id: `duplicate-${index}`,
    label: `重复地点${index + 1}`,
    x: 50,
    y: 50,
  }));
  const positions = buildGraphLayout(duplicates, [], 1120, 620, "map");
  const points = [...positions.values()];
  const distances = points.flatMap((point, index) => (
    points.slice(index + 1).map((other) => Math.hypot(point.x - other.x, point.y - other.y))
  ));
  assert.equal(new Set(points.map((point) => `${point.x}:${point.y}`)).size, duplicates.length);
  assert.ok(Math.min(...distances) > 120);
});

test("relation labels stay compact and only non-overlapping labels remain visible", () => {
  assert.equal(getShortRelation({ source: "a", target: "b", relation: "表面合作但暗中竞争" }), "表面合作…");
  assert.equal(getShortRelation({ source: "a", target: "b", relation: "" }), "关系");

  const positions = new Map([
    ["left", { x: 100, y: 100 }],
    ["right", { x: 500, y: 100 }],
    ["top", { x: 300, y: 20 }],
    ["bottom", { x: 300, y: 180 }],
  ]);
  const edges = [
    { id: "horizontal", source: "left", target: "right", relation: "合作" },
    { id: "same-midpoint", source: "top", target: "bottom", relation: "竞争" },
  ];
  const visible = getVisibleEdgeLabelIds(edges, positions, "graph");
  assert.ok(visible.has("horizontal"));
  assert.ok(!visible.has("same-midpoint"));
});
