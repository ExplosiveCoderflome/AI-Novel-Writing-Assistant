import test from "node:test";
import assert from "node:assert/strict";
import { formatMobileOutlineVolumeOptionLabel } from "../src/pages/novels/components/outlineMobileUi.ts";

test("formatMobileOutlineVolumeOptionLabel keeps selected volume compact", () => {
  assert.equal(
    formatMobileOutlineVolumeOptionLabel({ sortOrder: 4, title: "山海归墟", planningModeLabel: "硬规划", chapterCount: 32 }),
    "第4卷 · 山海归墟 · 硬规划 · 32章",
  );
});

test("formatMobileOutlineVolumeOptionLabel falls back without empty title", () => {
  assert.equal(
    formatMobileOutlineVolumeOptionLabel({ sortOrder: 1, title: "", planningModeLabel: null, chapterCount: 0 }),
    "第1卷 · 未拆章",
  );
});
