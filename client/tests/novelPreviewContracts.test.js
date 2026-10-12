import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const preview = fs.readFileSync(new URL("../src/pages/novels/NovelPreview.tsx", import.meta.url), "utf8");

test("preview keeps its content offset synchronized with the chapter directory", () => {
  assert.match(preview, /showChapters && "lg:pl-\[22\.5rem\]"/);
  assert.match(preview, /!showChapters \? \(/);
  assert.doesNotMatch(preview, /onClick=\{\(\) => setShowChapters\(\(value\) => !value\)\}/);
});

test("preview downloads the full novel and the active chapter", () => {
  assert.match(preview, /downloadNovelExport\(id, "txt", "full"/);
  assert.match(preview, /handleDownloadChapter/);
  assert.match(preview, /下载本章/);
  assert.match(preview, /下载整本/);
});
