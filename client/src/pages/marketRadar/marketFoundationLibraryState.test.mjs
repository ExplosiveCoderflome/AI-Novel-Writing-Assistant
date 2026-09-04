import assert from "node:assert/strict";
import test from "node:test";

import { resolveMarketFoundationLibraryState } from "./marketFoundationLibraryState.ts";

test("existing radar assets are shown as reusable instead of needing a new sync", () => {
  const state = resolveMarketFoundationLibraryState({
    genre: { existingId: "genre-1", name: "西方魔幻", reason: "证据" },
    primaryStoryMode: { existingId: "mode-1", name: "升级成长", reason: "证据" },
    secondaryStoryMode: { existingId: "mode-2", name: "治愈日常", reason: "证据" },
  }, null);

  assert.equal(state.genreNeedsSync, false);
  assert.equal(state.storyModesNeedSync, false);
  assert.equal(state.genreId, "genre-1");
  assert.equal(state.secondaryStoryModeId, "mode-2");
});

test("only missing radar assets require manual sync", () => {
  const state = resolveMarketFoundationLibraryState({
    genre: { existingId: null, name: "新题材", reason: "证据" },
    primaryStoryMode: { existingId: "mode-1", name: "升级成长", reason: "证据" },
    secondaryStoryMode: { existingId: null, name: "新推进", reason: "证据" },
  }, null);

  assert.equal(state.genreNeedsSync, true);
  assert.equal(state.storyModesNeedSync, true);
});
