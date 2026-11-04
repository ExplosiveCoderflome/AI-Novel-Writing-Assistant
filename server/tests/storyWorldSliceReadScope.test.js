const test = require("node:test");
const assert = require("node:assert/strict");
const {
  withStoryWorldSliceReadScope,
  storyWorldSliceReadOnly,
  shouldGenerateStoryWorldSlice,
} = require("../dist/services/novel/storyWorldSlice/readScope.js");

test("story world slice read scope defaults to generation allowed", async () => {
  assert.equal(storyWorldSliceReadOnly(), false);
  assert.equal(shouldGenerateStoryWorldSlice(true), true);
  assert.equal(shouldGenerateStoryWorldSlice(false), false);
});

test("read scope marks ensure as read-only across awaits and restores afterwards", async () => {
  const inside = await withStoryWorldSliceReadScope(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return storyWorldSliceReadOnly();
  });
  assert.equal(inside, true);
  assert.equal(storyWorldSliceReadOnly(), false);
});

test("stale slice must not be regenerated inside a read-only scope", async () => {
  await withStoryWorldSliceReadScope(async () => {
    // Kernel preparation assembles chapter context inside this scope: the
    // saved slice is reused as-is, because any model request here would be
    // an unregistered physical request and is fenced off by preparation.
    assert.equal(shouldGenerateStoryWorldSlice(true), false);
    assert.equal(shouldGenerateStoryWorldSlice(false), false);
  });
  // Outside the scope the historical lazy-generation behavior is preserved.
  assert.equal(shouldGenerateStoryWorldSlice(true), true);
});
