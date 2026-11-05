import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("ZIP downloads retain the extension when Content-Disposition is unavailable", () => {
  const exports = {};
  const { outputText } = ts.transpileModule(read("../src/api/novel/shared.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  new Function("require", "exports", outputText)(require, exports);
  assert.match(exports.buildNovelExportFallbackFileName("我的小说", "zip"), /^我的小说-\d{8}-\d{6}\.zip$/);
});

test("list and editor export controls offer chapter ZIP alongside the existing formats", () => {
  const list = read("../src/pages/novels/NovelList.tsx");
  const editor = read("../src/pages/novels/components/NovelEditView.tsx");
  assert.match(list, /\["zip", "分章 ZIP"\]/);
  assert.match(list, /input\.novelId,\s*input\.format/);
  assert.match(editor, /onExportFull\("zip"\)/);
  for (const format of ["txt", "markdown", "json"]) assert.match(editor, new RegExp(`onExportFull\\("${format}"\\)`));
});
