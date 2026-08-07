import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEdgeLabelPlacements,
  buildFactionLayout,
  buildLabelPlacements,
  buildMapLayout,
} from "./worldGraphLayout.ts";

const factionNodes = Array.from({ length: 9 }, (_, index) => ({
  id: `faction-${index}`,
  label: `测试势力${index + 1}`,
  type: index < 6 ? "organization" : "faction",
}));

test("faction layout uses the wide canvas instead of clustering in the center", () => {
  const positions = buildFactionLayout(factionNodes, 960, 480);
  const xs = [...positions.values()].map((point) => point.x);
  const ys = [...positions.values()].map((point) => point.y);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 400);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 200);
});

test("map layout expands narrow AI coordinate ranges and separates duplicates", () => {
  const nodes = [
    { id: "a", label: "地点甲", x: 48, y: 49 },
    { id: "b", label: "地点乙", x: 50, y: 50 },
    { id: "c", label: "地点丙", x: 52, y: 53 },
    { id: "d", label: "地点丁", x: 50, y: 50 },
  ];
  const positions = buildMapLayout(nodes, 1040, 540);
  const xs = [...positions.values()].map((point) => point.x);
  const points = [...positions.values()];
  const uniquePoints = new Set([...positions.values()].map((point) => `${Math.round(point.x)}:${Math.round(point.y)}`));
  assert.ok(Math.max(...xs) - Math.min(...xs) > 450);
  assert.equal(uniquePoints.size, nodes.length);
  const distances = points.flatMap((point, index) => points.slice(index + 1).map((other) => Math.hypot(point.x - other.x, point.y - other.y)));
  assert.ok(Math.min(...distances) > 90);
});

test("node and relation labels receive independent placements", () => {
  const positions = buildFactionLayout(factionNodes, 960, 480);
  const nodeLabels = buildLabelPlacements(factionNodes, positions, 960, 480, "graph");
  const edges = factionNodes.slice(1).map((node, index) => ({
    source: factionNodes[index].id,
    target: node.id,
    relation: `关系${index + 1}`,
  }));
  const edgeLabels = buildEdgeLabelPlacements(edges, positions, nodeLabels, 960, 480, "graph");
  assert.equal(nodeLabels.size, factionNodes.length);
  assert.equal(edgeLabels.length, edges.length);
  assert.ok(edgeLabels.every((label) => label.width > 0 && label.height > 0 && Number.isFinite(label.x) && Number.isFinite(label.y)));
  const overlaps = (first, second) => first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
  assert.ok(edgeLabels.every((edgeLabel) => [...nodeLabels.values()].every((nodeLabel) => !overlaps(edgeLabel, nodeLabel))));
});
