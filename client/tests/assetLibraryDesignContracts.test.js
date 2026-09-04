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
const genreTreeBrowser = readClientFile("src/pages/genres/components/GenreTreeBrowser.tsx");
const storyModePage = readClientFile("src/pages/storyModes/StoryModeManagementPage.tsx");
const storyModeCreateDialog = readClientFile("src/pages/storyModes/components/StoryModeCreateDialog.tsx");
const storyModeExpansionDialog = readClientFile("src/pages/storyModes/components/StoryModeExpansionDialog.tsx");
const storyModeProfileFields = readClientFile("src/pages/storyModes/components/StoryModeProfileFields.tsx");
const storyModeTreeBrowser = readClientFile("src/pages/storyModes/components/StoryModeTreeBrowser.tsx");
const storyModeProfileDetails = readClientFile("src/components/storyModes/StoryModeProfileDetails.tsx");
const assetTreeNavigator = readClientFile("src/components/assetLibrary/AssetTreeNavigator.tsx");
const characterPage = readClientFile("src/pages/characters/CharacterLibrary.tsx");
const writingFormulaLanding = readClientFile("src/pages/writingFormula/components/WritingFormulaLanding.tsx");
const writingFormulaWorkbench = readClientFile("src/pages/writingFormula/components/WritingFormulaWorkbenchPanel.tsx");
const writingFormulaCreateDialog = readClientFile("src/pages/writingFormula/components/WritingFormulaCreateDialog.tsx");

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

test("knowledge library presents a document shelf before maintenance controls", () => {
  assert.match(knowledgeOverview, /aria-label="知识资料状态"/);
  assert.match(knowledgeOverview, /recommendation\.tone !== "success"/);
  assert.match(knowledgePage, /TabsTrigger value="documents" className="rounded-full/);
  assert.match(knowledgeDocuments, /资料书架/);
  assert.match(knowledgeDocuments, /xl:grid-cols-2/);
  assert.match(knowledgeDocuments, /更多操作/);
  assert.match(knowledgeDocuments, /label="继续创作"/);
  assert.match(knowledgeDocuments, /onOpenRecallTest/);
  assert.match(knowledgeDocuments, /onReindexDocument/);
  assert.match(knowledgeDocuments, /confirmArchiveDocument/);
});

test("knowledge maintenance keeps recovery obvious and technical detail secondary", () => {
  assert.match(knowledgeOps, /资料检索可用状态/);
  assert.match(knowledgeOps, /检查检索设置/);
  assert.match(knowledgeOps, /资料同步记录/);
  assert.match(knowledgeOps, /任务详情/);
  assert.doesNotMatch(knowledgeOps, /最近失败任务/);
  assert.match(knowledgeSettings, /让资料参与创作/);
  assert.match(knowledgeSettings, /选择资料理解方式/);
  assert.match(knowledgeSettings, /连接资料库/);
  assert.match(knowledgeSettings, /高级配置/);
  assert.match(knowledgeSettings, /保存检索设置/);
});

test("world library presents reusable story samples before handbook detail", () => {
  assert.match(worldList, /如何把样本用于小说/);
  assert.match(worldList, /展开创作线索/);
  assert.match(worldList, /2xl:grid-cols-3/);
  assert.match(worldList, /查看世界手册/);
  assert.match(worldList, /整理样本/);
  assert.match(worldList, /handleDelete/);
  assert.match(worldList, /worldListQuery\.isLoading/);
  assert.match(worldList, /worldListQuery\.isError/);
  assert.doesNotMatch(worldList, /grid grid-cols-4 gap-2 text-center/);
});

test("world workspace keeps handbook reading primary and AI maintenance guided", () => {
  assert.match(worldWorkspace, /返回世界样本库/);
  assert.match(worldWorkspace, /创作模型/);
  assert.match(worldWorkspace, /TabsTrigger value="structure" className="rounded-full/);
  assert.match(worldHandbook, /先确认世界给读者的印象与核心矛盾/);
  assert.match(worldOverview, /阅读世界与图谱/);
  assert.match(worldOverview, /条核心规则/);
  assert.match(worldLayers, /AI 分层整理/);
  assert.match(worldLayers, /AI 精修当前内容/);
  assert.match(worldDeepening, /补齐关键设定/);
  assert.match(worldConsistency, /检查世界一致性/);
  assert.match(worldAssets, /rounded-full px-4 py-2/);
  assert.match(worldAssets, /地图与图谱/);
  assert.match(worldAssets, /版本快照/);
  assert.match(worldAssets, /导出备份/);
  assert.match(worldAssets, /导入文本/);
});

test("world visualizations separate layout, canvas, and view controls", () => {
  assert.match(worldVisualization, /WorldGraphCanvas/);
  assert.match(worldVisualization, /势力图谱 ·/);
  assert.match(worldVisualization, /世界地图 ·/);
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
  assert.match(storyModeTreeBrowser, /StoryModeProfileDetails/);
  assert.match(storyModeProfileDetails, /核心驱动/);
  assert.match(storyModeProfileDetails, /读者回报/);
  assert.match(storyModeProfileDetails, /推进单元/);
  assert.match(storyModeProfileDetails, /冲突上限/);
  assert.doesNotMatch(storyModeTreeBrowser, /shadow-(?:sm|md|lg|xl|2xl)/);
});

test("writing formula keeps a compact asset list and reveals the selected profile in place", () => {
  assert.match(writingFormulaLanding, /先选一套写法，再决定要编辑、应用还是去 AI 味/);
  assert.match(writingFormulaLanding, /isSelected \? \(/);
  assert.match(writingFormulaLanding, /读感与定位/);
  assert.match(writingFormulaLanding, /规则摘要/);
  assert.match(writingFormulaLanding, /资产概览/);
  assert.match(writingFormulaLanding, /编辑设定/);
  assert.match(writingFormulaLanding, /应用与测试/);
  assert.match(writingFormulaLanding, /去 AI 味/);
  assert.doesNotMatch(writingFormulaLanding, /xl:sticky xl:top-4/);
  assert.match(writingFormulaCreateDialog, /从一种读感开始/);
  assert.match(writingFormulaCreateDialog, /用模板开始/);
  assert.match(writingFormulaCreateDialog, /说一句想法/);
  assert.match(writingFormulaCreateDialog, /从素材学习/);
  assert.match(writingFormulaCreateDialog, /AI 帮我先搭一套/);
  assert.ok(writingFormulaLanding.split("\n").length < 450);
  assert.ok(writingFormulaWorkbench.split("\n").length < 350);
  assert.ok(writingFormulaCreateDialog.split("\n").length < 700);
});

test("story mode creation keeps AI assistance beside a grouped, independently scrolling draft", () => {
  assert.match(storyModePage, /StoryModeCreateDialog/);
  assert.match(storyModeCreateDialog, /AppDialogContent/);
  assert.match(storyModeCreateDialog, /lg:grid-cols-\[340px_minmax\(0,1fr\)\]/);
  assert.match(storyModeCreateDialog, /lg:overflow-y-auto/);
  assert.match(storyModeCreateDialog, /让 AI 起草/);
  assert.match(storyModeCreateDialog, /同时创建的子类/);
  assert.match(storyModeCreateDialog, /高级设置：人工提示补充/);
  assert.doesNotMatch(storyModeCreateDialog, /max-h-\[90vh\].*overflow-auto/);

  for (const section of ["核心体验", "推进节奏", "边界与防跑偏"]) {
    assert.match(storyModeProfileFields, new RegExp(section));
  }
});

test("story mode expansion recommends distinct additions from the existing library", () => {
  assert.match(storyModePage, /StoryModeExpansionDialog/);
  assert.match(storyModePage, /generateStoryModeExpansion/);
  assert.match(storyModePage, /扩展推进模式/);
  assert.match(storyModeExpansionDialog, /扩展范围/);
  assert.match(storyModeExpansionDialog, /推荐新方向/);
  assert.match(storyModeExpansionDialog, /推进单元/);
  assert.match(storyModeExpansionDialog, /加入模式库/);
  assert.doesNotMatch(storyModeExpansionDialog, /shadow-(?:sm|md|lg|xl|2xl)/);
});
