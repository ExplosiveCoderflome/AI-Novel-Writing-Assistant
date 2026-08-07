import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("auto-director idea stage uses shared tree dialogs for optional creation foundations", () => {
  const source = read("src/pages/novels/autoDirector/StageIdea.tsx");

  assert.match(source, /CreationFoundationPickerDialog/);
  assert.match(source, /创作偏好（可选）/);
  assert.match(source, /故事类型/);
  assert.match(source, /推进方式/);
  assert.doesNotMatch(source, /<select/);
});

test("changing a creation foundation invalidates persisted and local candidates", () => {
  const source = read("src/pages/novels/autoDirector/useAutoDirectorCreateController.ts");

  assert.match(source, /旧方向需要重新适配/);
  assert.match(source, /productionFoundation: null/);
  assert.match(source, /batches: \[\]/);
  assert.match(source, /setBatches\(\[\]\)/);
});

test("candidate cards disclose whether foundations came from the user or AI", () => {
  const source = read("src/pages/novels/components/NovelAutoDirectorCandidateBatches.tsx");

  assert.match(source, /你的选择/);
  assert.match(source, /AI 补充/);
  assert.match(source, /candidate\.productionFoundation\.genre\.source/);
});

test("idea inspirations receive readable genre and story-mode context", () => {
  const page = read("src/pages/novels/autoDirector/AutoDirectorCreatePage.tsx");
  const controller = read("src/pages/novels/autoDirector/useAutoDirectorCreateController.ts");

  assert.match(page, /storyModeOptions,/);
  assert.match(controller, /primaryStoryModeLabel: primaryStoryMode\?\.path/);
  assert.match(controller, /primaryStoryModeDescription: primaryStoryMode\?\.description/);
  assert.match(controller, /secondaryStoryModeLabel: secondaryStoryMode\?\.path/);
});
