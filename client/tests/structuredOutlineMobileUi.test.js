import test from "node:test";
import assert from "node:assert/strict";
import { formatMobileVolumeOptionLabel } from "../src/pages/novels/components/structuredOutlineMobileUi.ts";

test("formatMobileVolumeOptionLabel includes volume title and progress", () => {
  assert.equal(
    formatMobileVolumeOptionLabel({ sortOrder: 2, title: "龙虎卷", chapterCount: 24, refinedCount: 8 }),
    "第2卷 · 龙虎卷 · 24章 · 8章已细化",
  );
});

test("formatMobileVolumeOptionLabel falls back to chapter progress without blank title", () => {
  assert.equal(
    formatMobileVolumeOptionLabel({ sortOrder: 3, title: "", chapterCount: 12, refinedCount: 0 }),
    "第3卷 · 12章 · 0章已细化",
  );
});
