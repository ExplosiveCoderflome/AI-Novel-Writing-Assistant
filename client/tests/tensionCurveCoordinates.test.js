import test from "node:test";
import assert from "node:assert/strict";
import {
  MIN_WIDTH,
  PADDING,
  PLOT_BOTTOM,
  computeHeightFitZoom,
  clampScore,
  snapScore,
  clampY,
  chartWidth,
  pointX,
  selectedScopeMatches,
  buildBeatBands,
} from "../src/components/tensionCurve/curveCoordinates.ts";

test("clampScore clamps between 0 and 100 and rounds", () => {
  assert.equal(clampScore(-10), 0);
  assert.equal(clampScore(120), 100);
  assert.equal(clampScore(45.6), 46);
  assert.equal(clampScore(0), 0);
  assert.equal(clampScore(100), 100);
});

test("snapScore rounds to nearest multiple of 5 when precise is false", () => {
  assert.equal(snapScore(42, false), 40);
  assert.equal(snapScore(43, false), 45);
  assert.equal(snapScore(42, true), 42);
  assert.equal(snapScore(-5, false), 0);
  assert.equal(snapScore(105, false), 100);
});

test("clampY clamps Y coordinates between PADDING.top and PLOT_BOTTOM", () => {
  assert.equal(clampY(10), PADDING.top);
  assert.equal(clampY(300), PLOT_BOTTOM);
  assert.equal(clampY(150), 150);
});

test("chartWidth calculates fit width based on pointCount", () => {
  assert.equal(chartWidth(0), MIN_WIDTH);
  assert.equal(chartWidth(1), MIN_WIDTH);
  assert.equal(chartWidth(2), MIN_WIDTH);
  assert.equal(chartWidth(15), 52 + 36 + 14 * 56);
});

test("pointX calculates X coordinate for each point index", () => {
  assert.equal(pointX(0, 1), PADDING.left + (MIN_WIDTH - PADDING.left - PADDING.right) / 2);
  assert.equal(pointX(0, 5), PADDING.left);
  assert.equal(pointX(2, 5), PADDING.left + 2 * 56);
});

test("computeHeightFitZoom bounds height fit zoom factor", () => {
  assert.equal(computeHeightFitZoom(236), 0.6);
  assert.equal(Number(computeHeightFitZoom(430).toFixed(2)), 1.06);
  assert.equal(computeHeightFitZoom(1000), 1.2);
});

test("selectedScopeMatches matches selected viewport key", () => {
  const point = { index: 0, score: 50, beatKey: "beat-1" };
  assert.equal(selectedScopeMatches(point, "all"), true);
  assert.equal(selectedScopeMatches(point, "beat-1"), true);
  assert.equal(selectedScopeMatches(point, "beat-2"), false);
});

test("buildBeatBands aggregates points into layout bands", () => {
  const points = [
    { index: 0, score: 50, beatKey: "beat-1" },
    { index: 1, score: 60, beatKey: "beat-1" },
    { index: 2, score: 70, beatKey: "beat-2" },
  ];

  const bands = buildBeatBands(points, "beat-1");

  assert.equal(bands.length, 2);
  assert.equal(bands[0].key, "beat-1");
  assert.equal(bands[0].active, true);
  assert.equal(bands[0].x, 24);
  assert.equal(bands[0].width, 112);

  assert.equal(bands[1].key, "beat-2");
  assert.equal(bands[1].active, false);
});
