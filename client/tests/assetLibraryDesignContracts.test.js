import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readClientFile = (relativePath) => readFileSync(join(clientRoot, relativePath), "utf8");

const css = readClientFile("src/index.css");
const tailwindConfig = readClientFile("tailwind.config.ts");
const assetLibraryHeader = readClientFile("src/components/assetLibrary/AssetLibraryHeader.tsx");
const assetLibraryStatus = readClientFile("src/components/assetLibrary/AssetLibraryStatusGrid.tsx");
const assetLibrarySection = readClientFile("src/components/assetLibrary/AssetLibrarySection.tsx");
const knowledgePage = readClientFile("src/pages/knowledge/KnowledgePage.tsx");
const knowledgeDocuments = readClientFile("src/pages/knowledge/components/KnowledgeDocumentsTab.tsx");
const knowledgeOverview = readClientFile("src/pages/knowledge/components/KnowledgeLibraryOverview.tsx");
const knowledgeOps = readClientFile("src/pages/knowledge/components/KnowledgeOpsTab.tsx");
const knowledgeSettings = readClientFile("src/pages/knowledge/components/KnowledgeEmbeddingSettingsCard.tsx");
const worldList = readClientFile("src/pages/worlds/WorldList.tsx");
const worldWorkspace = readClientFile("src/pages/worlds/WorldWorkspace.tsx");
const worldHandbook = readClientFile("src/pages/worlds/components/workspace/WorldHandbookEditor.tsx");
const worldOverview = readClientFile("src/pages/worlds/components/workspace/WorldOverviewTab.tsx");
const worldLayers = readClientFile("src/pages/worlds/components/workspace/WorldLayersTab.tsx");
const worldDeepening = readClientFile("src/pages/worlds/components/workspace/WorldDeepeningTab.tsx");
const worldConsistency = readClientFile("src/pages/worlds/components/workspace/WorldConsistencyTab.tsx");
const worldAssets = readClientFile("src/pages/worlds/components/workspace/WorldAssetsTab.tsx");
const worldVisualization = readClientFile("src/pages/worlds/components/WorldVisualizationBoard.tsx");
const worldGraphCanvas = readClientFile("src/pages/worlds/components/visualization/WorldGraphCanvas.tsx");
const worldGraphElements = readClientFile("src/pages/worlds/components/visualization/WorldGraphElements.tsx");
const worldGraphLayout = readClientFile("src/pages/worlds/components/visualization/worldGraphLayout.ts");
const worldTimeline = readClientFile("src/pages/worlds/components/visualization/WorldTimelinePanel.tsx");
const genrePage = readClientFile("src/pages/genres/GenreManagementPage.tsx");
const characterPage = readClientFile("src/pages/characters/CharacterLibrary.tsx");

test("asset library semantic status colors are registered as theme tokens", () => {
  for (const token of ["success", "warning", "info"]) {
    assert.match(css, new RegExp(`--${token}:`));
    assert.match(tailwindConfig, new RegExp(`${token}:\\s*\\{`));
  }
});

test("asset library shared shells stay restrained and token based", () => {
  const sharedSource = [assetLibraryHeader, assetLibraryStatus, assetLibrarySection].join("\n");
  assert.match(sharedSource, /AssetLibraryHeader/);
  assert.match(sharedSource, /AssetLibraryRecommendation/);
  assert.match(sharedSource, /AssetLibraryEmptyState/);
  assert.match(sharedSource, /text-warning/);
  assert.match(sharedSource, /text-success/);
  assert.match(sharedSource, /text-info/);
  assert.doesNotMatch(sharedSource, /#[0-9a-f]{3,8}/i);
  assert.doesNotMatch(sharedSource, /(?:slate|amber|emerald|sky|rose|red|blue|green)-\d/);
  assert.doesNotMatch(sharedSource, /gradient|rounded-(?:xl|2xl|3xl)|shadow-(?:sm|md|lg|xl|2xl)/);
});

test("phase one asset pages expose purpose status recommendation and recovery states", () => {
  for (const source of [knowledgeOverview, genrePage, characterPage]) {
    assert.match(source, /AssetLibraryHeader/);
    assert.match(source, /AssetLibrary(?:StatusGrid|Recommendation)/);
  }

  assert.match(knowledgePage, /KnowledgeLibraryOverview/);
  assert.match(knowledgeDocuments, /isLoading/);
  assert.match(knowledgeDocuments, /errorMessage/);
  assert.match(knowledgeDocuments, /onRetry/);
  assert.match(knowledgeDocuments, /AssetLibraryEmptyState/);
  assert.match(genrePage, /genreTreeQuery\.isLoading/);
  assert.match(genrePage, /genreTreeQuery\.isError/);
  assert.match(characterPage, /characterListQuery\.isLoading/);
  assert.match(characterPage, /characterListQuery\.isError/);
});
  assert.match(worldVisualization, /WorldTimelinePanel/);
  assert.match(worldGraphCanvas, /ReactFlow/);
  assert.match(worldGraphCanvas, /WorldGraphNode/);
  assert.match(worldGraphCanvas, /WorldGraphEdge/);
  assert.match(worldGraphCanvas, /getVisibleEdgeLabelIds/);
  assert.match(worldGraphCanvas, /edgeHoverTimerRef/);
  assert.match(worldGraphCanvas, /window\.setTimeout/);
  assert.match(worldGraphCanvas, /拖动地点整理空间/);
  assert.match(worldGraphCanvas, /悬停连线查看双方与完整关系/);
  assert.match(worldGraphCanvas, /FullscreenView/);
  assert.match(worldGraphCanvas, /全屏查看图谱/);
  assert.match(worldGraphCanvas, /退出图谱全屏/);
  assert.match(worldGraphElements, /EdgeLabelRenderer/);
  assert.match(worldGraphElements, /interactionWidth=\{28\}/);
  assert.match(worldGraphElements, /line-clamp-2/);
  assert.match(worldGraphElements, /group-focus-within:block/);
  assert.match(worldGraphElements, /点击画布空白处收起/);
  assert.match(worldGraphLayout, /forceSimulation/);
  assert.match(worldGraphLayout, /forceLink/);
  assert.match(worldGraphLayout, /forceX/);
=======
  assert.match(worldGraphCanvas, /buildEdgeLabelPlacements/);
  assert.match(worldGraphCanvas, /节点按势力类型分散排布/);
  assert.match(worldGraphCanvas, /地点按相对方位铺开/);
  assert.match(worldGraphCanvas, /FullscreenView/);
  assert.match(worldGraphCanvas, /全屏查看图谱/);
  assert.match(worldGraphCanvas, /退出图谱全屏/);
  assert.match(worldGraphLayout, /buildFactionLayout/);
>>>>>>> 6721e833 (fix(ui): refine world map fullscreen layout)
  assert.match(worldGraphLayout, /spreadAxis/);
  assert.match(worldGraphLayout, /seededRandom/);
  assert.match(worldGraphLayout, /getVisibleEdgeLabelIds/);
  assert.match(worldTimeline, /横向世界时间线，可左右滚动/);
  assert.match(worldTimeline, /gridTemplateColumns/);
  assert.match(worldTimeline, /bottom-\[calc\(50%\+38px\)\]/);
  assert.match(worldTimeline, /md:hidden/);
  assert.match(worldTimeline, /FullscreenView/);
  assert.ok(worldVisualization.split("\n").length < 350);
  assert.ok(worldGraphCanvas.split("\n").length < 500);
  assert.ok(worldGraphElements.split("\n").length < 350);
  assert.ok(worldGraphLayout.split("\n").length < 500);
  assert.ok(worldTimeline.split("\n").length < 250);
});

test("genre library uses a compact tree browser with a separate detail surface", () => {
  assert.match(genrePage, /GenreTreeBrowser/);
  assert.match(genreTreeBrowser, /AssetTreeNavigator/);
  assert.match(assetTreeNavigator, /role="tree"/);
  assert.match(assetTreeNavigator, /role="treeitem"/);
  assert.match(genreTreeBrowser, /题材目录/);
  assert.match(genreTreeBrowser, /selected-genre-title/);
  assert.match(genreTreeBrowser, /lg:grid-cols-\[320px_minmax\(0,1fr\)\]/);
  assert.match(genreTreeBrowser, /viewportClassName="max-h-\[380px\]"/);
  assert.doesNotMatch(genreTreeBrowser, /min-h-\[520px\]/);
  assert.doesNotMatch(genreTreeBrowser, /shadow-(?:sm|md|lg|xl|2xl)/);
});

test("story mode library reuses the tree navigator and keeps mode contracts in the detail pane", () => {
  assert.match(storyModePage, /StoryModeTreeBrowser/);
  assert.match(storyModeTreeBrowser, /AssetTreeNavigator/);
  assert.match(storyModeTreeBrowser, /推进模式目录/);
  assert.match(storyModeTreeBrowser, /核心驱动/);
  assert.match(storyModeTreeBrowser, /读者回报/);
  assert.match(storyModeTreeBrowser, /推进单元/);
  assert.match(storyModeTreeBrowser, /冲突上限/);
  assert.doesNotMatch(storyModeTreeBrowser, /shadow-(?:sm|md|lg|xl|2xl)/);
});
>>>>>>> 7beea60c (refactor(ui): migrate world graphs to react flow)
