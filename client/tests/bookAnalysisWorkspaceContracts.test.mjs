import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const clientRoot = resolve(import.meta.dirname, "..");
const bookAnalysisRoot = resolve(clientRoot, "src/pages/bookAnalysis");
const read = (relativePath) => readFileSync(resolve(clientRoot, relativePath), "utf8");

function listSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(path);
    }
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

test("book analysis exposes the shared workspace header and recommended action", () => {
  const page = read("src/pages/bookAnalysis/BookAnalysisPage.tsx");
  assert.match(page, /<WorkspaceHeader/);
  assert.match(page, /<WorkspaceNextAction/);
  assert.match(page, /<WorkspaceStateNotice/);
});

test("book analysis keeps source version range stage and progress in the first-view contract", () => {
  const page = read("src/pages/bookAnalysis/BookAnalysisPage.tsx");
  assert.match(page, /来源：/);
  assert.match(page, /documentVersionNumber/);
  assert.match(page, /范围：/);
  assert.match(page, /阶段：/);
  assert.match(page, /进度：/);
  assert.match(page, /计划小节：/);
});

test("book analysis provides loading error and retry states for list and detail queries", () => {
  const page = read("src/pages/bookAnalysis/BookAnalysisPage.tsx");
  const sidebar = read("src/pages/bookAnalysis/components/BookAnalysisSidebar.tsx");
  assert.match(page, /analysesLoading/);
  assert.match(page, /analysesError/);
  assert.match(page, /retryAnalyses/);
  assert.match(page, /detailLoading/);
  assert.match(page, /detailError/);
  assert.match(page, /retryDetail/);
  assert.match(sidebar, /loading/);
  assert.match(sidebar, /errorMessage/);
  assert.match(sidebar, /onRetry/);
});

test("source and chapter failures only degrade comparison and expose a retry", () => {
  const page = read("src/pages/bookAnalysis/BookAnalysisPage.tsx");
  const detail = read("src/pages/bookAnalysis/components/BookAnalysisDetailPanel.tsx");
  assert.match(page, /sourceLoading/);
  assert.match(page, /sourceError/);
  assert.match(page, /chaptersLoading/);
  assert.match(page, /chaptersError/);
  assert.match(detail, /拆书结果仍可继续查看/);
  assert.match(detail, /已生成的拆书结果不会被隐藏或删除/);
  assert.match(detail, /onRetrySource/);
  assert.match(detail, /onRetryChapters/);
  assert.match(detail, /enabled=\{isDualPane && !sourceError && !chaptersError\}/);
  assert.match(detail, /<BookAnalysisSectionCard/);
});

test("book analysis puts current results before the history list below extra-wide screens", () => {
  const page = read("src/pages/bookAnalysis/BookAnalysisPage.tsx");
  assert.match(page, /className="order-2 min-w-0 xl:order-1"/);
  assert.match(page, /className="order-1 min-w-0 space-y-4 xl:order-2"/);
  assert.match(page, /id="book-analysis-results"/);
});

test("book analysis stays on semantic tokens without decorative gradients", () => {
  const sources = listSourceFiles(bookAnalysisRoot).map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(sources, /#[0-9a-f]{3,8}/i);
  assert.doesNotMatch(sources, /(?:slate|amber|yellow|emerald|sky|rose|red|green|blue)-\d/);
  assert.doesNotMatch(sources, /bg-gradient/);
});
