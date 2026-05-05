const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const hookPath = path.join(root, "src", "pages", "novels", "hooks", "useNovelEditQueries.ts");

test("NovelEdit query hook exists and exposes the core query factory surface", () => {
  assert.equal(fs.existsSync(hookPath), true, "expected useNovelEditQueries.ts to exist");
  const source = fs.readFileSync(hookPath, "utf8");
  assert.match(source, /export function useNovelEditQueries\(/);
  assert.match(source, /novelDetailQuery/);
  assert.match(source, /volumeWorkspaceQuery/);
  assert.match(source, /pipelineJobQuery/);
  assert.match(source, /genreOptions/);
  assert.match(source, /storyModeOptions/);
  assert.match(source, /payoffLedgerChapterOrder/);
});
