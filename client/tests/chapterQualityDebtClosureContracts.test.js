import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const shelfSource = read("../src/pages/novels/simpleCreation/SimpleNovelShelfPage.tsx");
const referencePanelSource = read("../src/pages/novels/components/chapterInsights/ChapterExecutionReferencePanel.tsx");

test("simple shelf explains quality debt and routes editing through the shared chapter editor", () => {
  assert.match(shelfSource, /selectedChapter\.qualityDebt\.reason/);
  assert.match(shelfSource, /formatQualityDebtSource/);
  assert.match(shelfSource, /formatQualityDebtAttempts/);
  assert.match(shelfSource, /修改并重新审校/);
  assert.match(shelfSource, /\/novels\/\$\{id\}\/chapters\/\$\{encodeURIComponent\(selectedChapter\.id\)\}/);
  assert.doesNotMatch(shelfSource, /reviewNovelChapter/);
});

test("professional chapter diagnostics use the same stored quality debt and expose its repair entry", () => {
  assert.match(referencePanelSource, /readChapterQualityDebtDetails\(selectedChapter\.riskFlags\)/);
  assert.match(referencePanelSource, /qualityDebt\.reason/);
  assert.match(referencePanelSource, /formatQualityDebtAttempts/);
  assert.match(referencePanelSource, /stage=pipeline&chapterId=/);
  assert.match(referencePanelSource, /进入质量修复/);
});
