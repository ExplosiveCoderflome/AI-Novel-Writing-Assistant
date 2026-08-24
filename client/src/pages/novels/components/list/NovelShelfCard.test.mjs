import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./NovelShelfCard.tsx", import.meta.url), "utf8");

test("continue cards offer the same delete action as shelf cards", () => {
  const continueCard = source.slice(source.indexOf("export function NovelContinueCard"));
  assert.match(continueCard, /onDelete: \(novelId: string, title: string\) => void/);
  assert.match(continueCard, /title="删除作品"/);
  assert.match(continueCard, /props\.onDelete\(novel\.id, novel\.title\)/);
});
