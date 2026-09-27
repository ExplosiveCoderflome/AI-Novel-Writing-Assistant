import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripLegacyTaskUrlParams } from "../src/lib/legacyTaskUrlParams.ts";

test("direct chapter workspace entry strips task URL identity and keeps chapter route state", () => {
  const source = readFileSync(resolve(import.meta.dirname, "../src/pages/novels/NovelChapterEdit.tsx"), "utf8");
  assert.match(source, /stripLegacyTaskUrlParams\(searchParams\)/);
  assert.match(source, /setSearchParams\(cleaned,\s*\{ replace: true \}\)/);

  const chapterRoute = new URL("/novels/book/chapters/chapter-1?stage=chapter&directorTaskId=old&chapterId=chapter-1&volumeId=volume-2&workspaceTaskId=manual&tag=first&tag=second#editor", "https://novel.local");
  const cleaned = stripLegacyTaskUrlParams(chapterRoute.searchParams);
  const href = `${chapterRoute.pathname}?${cleaned.toString()}${chapterRoute.hash}`;
  assert.equal(href, "/novels/book/chapters/chapter-1?stage=chapter&chapterId=chapter-1&volumeId=volume-2&tag=first&tag=second#editor");
});
