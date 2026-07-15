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
