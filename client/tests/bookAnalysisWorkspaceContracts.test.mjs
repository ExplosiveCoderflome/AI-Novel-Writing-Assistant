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

test("book analysis reserves the large header and guidance for states that need them", () => {
  const page = read("src/pages/bookAnalysis/BookAnalysisPage.tsx");
  const toolbar = read("src/pages/bookAnalysis/components/BookAnalysisWorkspaceToolbar.tsx");

  assert.match(page, /!workspace\.selectedAnalysisId \? \(/);
  assert.match(page, /<WorkspaceHeader/);
  assert.match(page, /<WorkspaceNextAction/);
  assert.match(page, /nextAction\.tone !== "success"/);
  assert.match(page, /<WorkspaceStateNotice/);
  assert.match(toolbar, /<OpenInCreativeHubButton/);
  assert.match(toolbar, /bookAnalysisId: selectedAnalysis\.id/);
});

test("book analysis keeps status budget and publishing actions in the compact result toolbar", () => {
  const toolbar = read("src/pages/bookAnalysis/components/BookAnalysisWorkspaceToolbar.tsx");
  assert.match(toolbar, /formatStatus\(selectedAnalysis\.status\)/);
  assert.match(toolbar, /预算/);
  assert.match(toolbar, /onPublish/);
  assert.match(toolbar, /onDownload/);
  assert.match(toolbar, /onCreateStyleProfile/);
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
  assert.match(page, /className="order-2 min-w-0 xl:order-1[^\"]*"/);
  assert.match(page, /className="order-1 min-w-0 space-y-\d+ xl:order-2"/);
  assert.match(page, /id="book-analysis-results"/);
});

test("book analysis selection uses URL as the single source before local query state sync", () => {
  const workspaceHook = read("src/pages/bookAnalysis/hooks/useBookAnalysisWorkspace.ts");
  const blockStart = workspaceHook.indexOf("const openAnalysis =");
  const blockEnd = workspaceHook.indexOf("const createMutation", blockStart);
  const openAnalysisBlock = workspaceHook.slice(blockStart, blockEnd);

  assert.ok(blockStart >= 0 && blockEnd > blockStart);
  assert.match(openAnalysisBlock, /setSearchParams/);
  assert.match(openAnalysisBlock, /next\.set\("analysisId", analysisId\)/);
  assert.match(openAnalysisBlock, /next\.set\("documentId", documentId\)/);
  assert.doesNotMatch(openAnalysisBlock, /setSelectedAnalysisId/);
  assert.doesNotMatch(openAnalysisBlock, /setSelectedDocumentId/);
});

test("book analysis history rows are route links instead of event-only buttons", () => {
  const page = read("src/pages/bookAnalysis/BookAnalysisPage.tsx");
  const sidebar = read("src/pages/bookAnalysis/components/BookAnalysisSidebar.tsx");

  assert.match(sidebar, /import \{ Link \} from "react-router-dom"/);
  assert.match(sidebar, /<Link/);
  assert.match(sidebar, /pathname: "\/book-analysis"/);
  assert.match(sidebar, /analysisId: item\.id/);
  assert.match(sidebar, /documentId: item\.documentId/);
  assert.match(sidebar, /className=\{`relative block w-full/);
  assert.doesNotMatch(page, /workspace\.openAnalysis\(analysisId, documentId\)/);
});

test("book analysis character profiles prioritize reading over maintenance controls", () => {
  const panel = read("src/pages/bookAnalysis/components/BookAnalysisCharacterPanel.tsx");
  const candidate = read("src/pages/bookAnalysis/components/BookAnalysisCharacterCandidateCard.tsx");

  assert.match(panel, /<details className="group overflow-hidden rounded-2xl/);
  assert.match(panel, /生成与添加角色/);
  assert.match(panel, /aria-pressed=\{selectedDimensions\.includes\(dimension\)\}/);
  assert.match(panel, /<article/);
  assert.match(panel, /成长轨迹/);
  assert.match(panel, /关键场景/);
  assert.match(panel, /形象与视觉资料/);
  assert.match(candidate, /rounded-xl bg-background\/75/);
  assert.doesNotMatch(panel, /rounded-md bg-muted\/30 p-2/);
});

test("book analysis character appearance reads as a visual timeline", () => {
  const appearance = read("src/pages/bookAnalysis/components/BookAnalysisCharacterAppearancePanel.tsx");
  const images = read("src/pages/bookAnalysis/components/BookAnalysisCharacterImagePanel.tsx");

  assert.match(appearance, /当前形象/);
  assert.match(appearance, /aspect-\[4\/3\]/);
  assert.match(appearance, /aria-pressed=\{targetPercent === value\}/);
  assert.match(appearance, /章节形象记录/);
  assert.match(appearance, /border-l border-primary\/20/);
  assert.doesNotMatch(appearance, /type="range"/);
  assert.match(images, /border-t border-border\/35/);
  assert.match(images, /rounded-xl bg-muted\/20/);
});

test("book analysis stays on semantic tokens without decorative gradients", () => {
  const sources = listSourceFiles(bookAnalysisRoot).map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(sources, /#[0-9a-f]{3,8}/i);
  assert.doesNotMatch(sources, /(?:slate|amber|yellow|emerald|sky|rose|red|green|blue)-\d/);
  assert.doesNotMatch(sources, /bg-gradient/);
});
