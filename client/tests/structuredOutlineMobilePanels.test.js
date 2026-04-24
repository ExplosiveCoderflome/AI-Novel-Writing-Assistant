import test from "node:test";
import assert from "node:assert/strict";
import { formatMobileStructuredPanelSummary } from "../src/pages/novels/components/structuredOutlineMobilePanels.ts";

test("formatMobileStructuredPanelSummary combines selected beat and chapter", () => {
  assert.equal(
    formatMobileStructuredPanelSummary({ beatLabel: "推进承诺", visibleChapterCount: 6, selectedChapterOrder: 12 }),
    "推进承诺 · 6章 · 当前第12章",
  );
});

test("formatMobileStructuredPanelSummary falls back to all chapters", () => {
  assert.equal(
    formatMobileStructuredPanelSummary({ beatLabel: null, visibleChapterCount: 18, selectedChapterOrder: null }),
    "全部节奏 · 18章",
  );
});
