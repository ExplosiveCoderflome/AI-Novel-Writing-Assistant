import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const clientRoot = resolve(import.meta.dirname, "..");
const read = (relativePath) => readFileSync(resolve(clientRoot, relativePath), "utf8");

test("title studio keeps one primary navigation and a focused factory flow", () => {
  const page = read("src/pages/titles/TitleStudioPage.tsx");
  const factory = read("src/pages/titles/components/TitleFactoryPanel.tsx");

  assert.match(page, /max-w-6xl/);
  assert.match(page, /TabsTrigger value="factory" className="rounded-full"/);
  assert.match(page, /TabsTrigger value="library" className="rounded-full"/);
  assert.match(factory, /TabsTrigger value="novel" className="rounded-full"/);
  assert.doesNotMatch(factory, /<h2[^>]*>\{modeCopy\.title\}<\/h2>/);
  assert.match(factory, /layout="grid"/);
  assert.match(factory, /generateMutation\.error/);
});

test("title suggestions use gallery cards in the studio without changing embedded lists", () => {
  const suggestions = read("src/pages/titles/components/TitleSuggestionList.tsx");
  const library = read("src/pages/titles/components/TitleLibraryPanel.tsx");

  assert.match(suggestions, /layout\?: "list" \| "grid"/);
  assert.match(suggestions, /layout = "list"/);
  assert.match(suggestions, /md:grid-cols-2/);
  assert.match(suggestions, /等待第一批标题灵感/);
  assert.match(library, /grid gap-3 md:grid-cols-2/);
  assert.match(library, /markUsedMutation\.mutate/);
  assert.match(library, /deleteMutation\.mutate/);
});
