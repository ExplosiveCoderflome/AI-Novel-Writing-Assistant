import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const homeRoot = dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => readFileSync(join(homeRoot, relativePath), "utf8");

test("home hero presents a consumer-facing creation journey", () => {
  const hero = read("components/HomeNextActionPanel.tsx");
  const status = read("components/HomeStatusStrip.tsx");
  const viewModel = read("homeViewModel.ts");

  assert.match(hero, /继续你的故事/);
  assert.match(hero, /整本创作旅程/);
  assert.match(hero, /primaryCover/);
  assert.doesNotMatch(hero, /bg-\[#122033\]/);
  assert.doesNotMatch(hero, /为什么是现在/);
  assert.match(status, /rounded-2xl/);
  assert.match(status, /home-status-metric-card/);
  assert.doesNotMatch(viewModel, /title: "失败任务"/);
  assert.match(viewModel, /title: "已沉淀章节"/);
});
