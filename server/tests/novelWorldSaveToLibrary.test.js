const test = require("node:test");
const assert = require("node:assert/strict");

test("NovelWorldLibrarySaveService exports save method", async () => {
  const { NovelWorldLibrarySaveService } = await import("../dist/services/novel/worldContext/NovelWorldLibrarySaveService.js");
  const service = new NovelWorldLibrarySaveService({});
  assert.equal(typeof service.saveNovelWorldToLibrary, "function");
});

test("novel world save-to-library input defaults to empty payload", async () => {
  const { novelWorldSaveToLibraryInputSchema } = await import("@ai-novel/shared/types/novelWorld");
  assert.deepEqual(novelWorldSaveToLibraryInputSchema.parse({}), {});
  assert.deepEqual(novelWorldSaveToLibraryInputSchema.parse({ syncEnabled: false }), {
    syncEnabled: false,
  });
});
