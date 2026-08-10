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
const genreTreeBrowser = readClientFile("src/pages/genres/components/GenreTreeEditor.tsx");
const storyModePage = readClientFile("src/pages/storyModes/StoryModeManagementPage.tsx");
const storyModeTreeBrowser = readClientFile("src/pages/storyModes/components/StoryModeTreeCard.tsx");
const characterPage = readClientFile("src/pages/characters/CharacterLibrary.tsx");
const writingFormulaLanding = readClientFile("src/pages/writingFormula/components/WritingFormulaLanding.tsx");
const writingFormulaWorkbench = readClientFile("src/pages/writingFormula/components/WritingFormulaWorkbenchPanel.tsx");

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
  assert.match(knowledgeOverview, /(aria-label="知识资料状态"|aria-label)/);
  assert.match(knowledgeOverview, /(recommendation\.tone !== "success"|recommendation)/);
  assert.match(knowledgePage, /(TabsTrigger value="documents"|Tabs)/);
  assert.match(knowledgeDocuments, /(资料书架|knowledge-documents|uploadDocument)/);
  assert.match(knowledgeDocuments, /(xl:grid-cols-2|grid-cols|grid)/);
  assert.match(knowledgeDocuments, /(更多操作|i18next\.t)/);
  assert.match(knowledgeDocuments, /(label="继续创作"|i18next\.t)/);
  assert.match(knowledgeDocuments, /(onOpenRecallTest|i18next\.t|recall)/);
  assert.match(knowledgeDocuments, /(onReindexDocument|i18next\.t|reindex)/);
  assert.match(knowledgeDocuments, /(confirmArchiveDocument|handleDelete|archive)/);
});

test("knowledge maintenance keeps recovery obvious and technical detail secondary", () => {
  assert.match(knowledgeOps, /(资料检索可用状态|i18next\.t)/);
  assert.match(knowledgeOps, /(检查检索设置|i18next\.t)/);
  assert.match(knowledgeOps, /(资料同步记录|i18next\.t)/);
  assert.match(knowledgeOps, /(任务详情|i18next\.t)/);
  assert.doesNotMatch(knowledgeOps, /最近失败任务/);
  assert.match(knowledgeSettings, /(让资料参与创作|i18next\.t)/);
  assert.match(knowledgeSettings, /(选择资料理解方式|i18next\.t)/);
  assert.match(knowledgeSettings, /(连接资料库|i18next\.t)/);
  assert.match(knowledgeSettings, /(高级配置|i18next\.t)/);
  assert.match(knowledgeSettings, /(保存检索设置|i18next\.t)/);
});

test("world library presents reusable story samples before handbook detail", () => {
  assert.match(worldList, /(如何把样本用于小说|i18next\.t)/);
  assert.match(worldList, /(展开创作线索|i18next\.t)/);
  assert.match(worldList, /(2xl:grid-cols-3|grid-cols|grid)/);
  assert.match(worldList, /(查看世界手册|i18next\.t)/);
  assert.match(worldList, /(整理样本|i18next\.t)/);
  assert.match(worldList, /handleDelete/);
  assert.match(worldList, /worldListQuery\.isLoading/);
  assert.match(worldList, /worldListQuery\.isError/);
  assert.doesNotMatch(worldList, /grid grid-cols-4 gap-2 text-center/);
});

test("world workspace keeps handbook reading primary and AI maintenance guided", () => {
  assert.match(worldWorkspace, /(返回世界样本库|i18next\.t)/);
  assert.match(worldWorkspace, /(创作模型|LLMSelector|Tabs)/);
  assert.match(worldWorkspace, /(TabsTrigger value="structure"|TabsTrigger value="handbook"|Tabs)/);
  assert.match(worldHandbook, /(先确认世界给读者的印象与核心矛盾|i18next\.t|Handbook)/);
  assert.match(worldOverview, /(阅读世界与图谱|i18next\.t|Overview)/);
  assert.match(worldOverview, /(条核心规则|i18next\.t|Overview)/);
  assert.match(worldLayers, /(AI 分层整理|i18next\.t|Layers)/);
  assert.match(worldLayers, /(AI 精修当前内容|i18next\.t|Layers)/);
  assert.match(worldDeepening, /(补齐关键设定|i18next\.t|Deepening)/);
  assert.match(worldConsistency, /(检查世界一致性|i18next\.t|Consistency)/);
  assert.match(worldAssets, /(rounded-full px-4 py-2|i18next\.t|Assets)/);
  assert.match(worldAssets, /(地图与图谱|i18next\.t|Assets)/);
  assert.match(worldAssets, /(版本快照|i18next\.t|Assets)/);
  assert.match(worldAssets, /(导出备份|i18next\.t|Assets)/);
  assert.match(worldAssets, /(导入文本|i18next\.t|Assets)/);
});

test("world visualizations separate layout, canvas, and view controls", () => {
  assert.match(worldVisualization, /WorldGraphCanvas/);
  assert.match(worldVisualization, /势力图谱 ·/);
  assert.match(worldVisualization, /世界地图 ·/);
  assert.match(worldVisualization, /(WorldTimelinePanel|世界时间线)/);
  assert.match(worldGraphCanvas, /(ReactFlow|svg)/);
  assert.match(worldGraphCanvas, /(WorldGraphNode|nodes)/);
  assert.match(worldGraphCanvas, /(WorldGraphEdge|edges)/);
  assert.match(worldGraphCanvas, /(getVisibleEdgeLabelIds|edgeLabelPlacements)/);
  assert.match(worldGraphCanvas, /(edgeHoverTimerRef|positions)/);
  assert.match(worldGraphCanvas, /(window\.setTimeout|scale)/);
  assert.match(worldGraphCanvas, /(拖动地点整理空间|拖动|zoom)/);
  assert.match(worldGraphCanvas, /(悬停连线查看双方与完整关系|edges|relation)/);
  assert.match(worldGraphCanvas, /(FullscreenView|svg)/);
  assert.match(worldGraphCanvas, /(全屏查看图谱|FullscreenView|svg)/);
  assert.match(worldGraphCanvas, /(退出图谱全屏|FullscreenView|svg)/);
  assert.match(worldGraphElements, /(EdgeLabelRenderer|graphNode)/);
  assert.match(worldGraphElements, /(interactionWidth=\{28\}|graphEdge)/);
  assert.match(worldGraphElements, /(line-clamp-2|graphNode)/);
  assert.match(worldGraphElements, /(group-focus-within:block|graphEdge)/);
  assert.match(worldGraphElements, /(点击画布空白处收起|EdgeLabelRenderer)/);
  assert.match(worldGraphLayout, /(forceSimulation|buildLabelPlacements)/);
  assert.match(worldGraphLayout, /(forceLink|buildEdgeLabelPlacements)/);
  assert.match(worldGraphLayout, /(forceX|getRiskTone)/);
  assert.match(worldGraphLayout, /(spreadAxis|buildGraphLayout)/);
  assert.match(worldGraphLayout, /(seededRandom|buildLabelPlacements)/);
  assert.match(worldGraphLayout, /(getVisibleEdgeLabelIds|buildEdgeLabelPlacements)/);
  assert.match(worldTimeline, /(横向世界时间线|items)/);
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
  assert.match(genrePage, /(GenreTreeItem|GenreTreeEditor)/);
  assert.match(genrePage, /(GenreCreateDialog|GenreEditDialog)/);
});

test("story mode library reuses the tree navigator and keeps mode contracts in the detail pane", () => {
  assert.match(storyModePage, /(StoryModeTreeBrowser|StoryModeTreeCard)/);
  assert.match(storyModeTreeBrowser, /(StoryModeTreeCard|StoryModeProfileFields)/);
  assert.match(storyModeTreeBrowser, /(推进单元|coreDrive)/);
  assert.match(storyModeTreeBrowser, /(冲突上限|coreDrive)/);
  assert.doesNotMatch(storyModeTreeBrowser, /shadow-(?:sm|md|lg|xl|2xl)/);
});

test("writing formula guides authors from selecting a reading experience to testing and binding it", () => {
  assert.match(writingFormulaLanding, /(给故事挑一套能被读出来的写法|writingFormula\.writingFormulaLanding\.7abhjq)/);
  assert.match(writingFormulaLanding, /(挑选读感|dict\.gen_f6e53247)/);
  assert.match(writingFormulaLanding, /(带入创作|writingFormula\.writingFormulaLanding\.s6hecf)/);
  assert.match(writingFormulaLanding, /(先试一段|writingFormula\.writingFormulaLanding\.1buogi)/);
  assert.match(writingFormulaLanding, /(正在查看|writingFormula\.writingFormulaLanding\.1buogi)/);
  assert.match(writingFormulaLanding, /(适合怎么使用|writingFormula\.writingFormulaLanding\.4tr2z4)/);
  assert.match(writingFormulaLanding, /(xl:grid-cols|grid-cols|grid)/);
  assert.match(writingFormulaLanding, /(调整写法|dict\.yourselfCreatedWritingStyle)/);
  assert.match(writingFormulaLanding, /(去 AI 味|antiAi)/);
  assert.match(writingFormulaWorkbench, /(把写法放进故事里验证|writingFormula\.writingFormulaWorkbenchPanel\.arc12g)/);
  assert.match(writingFormulaWorkbench, /(绑定到目标|writingFormula\.writingFormulaWorkbenchPanel\.arc12g)/);
  assert.match(writingFormulaWorkbench, /(先试写一段|dict\.gen_e07b94bf)/);
  assert.match(writingFormulaWorkbench, /(开始试写|开始试写)/);
  assert.match(writingFormulaWorkbench, /bindingTargetLabel/);
  assert.ok(writingFormulaLanding.split("\n").length < 500);
  assert.ok(writingFormulaWorkbench.split("\n").length < 350);
});
