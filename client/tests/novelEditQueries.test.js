import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
