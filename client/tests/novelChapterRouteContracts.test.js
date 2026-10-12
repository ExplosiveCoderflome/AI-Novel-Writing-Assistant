import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMemoryRouter } from "react-router-dom";
import { stripLegacyTaskUrlParams } from "../src/lib/legacyTaskUrlParams.ts";

test("direct chapter cleanup replaces the URL while retaining path, search state, and hash", async () => {
  const source = readFileSync(resolve(import.meta.dirname, "../src/pages/novels/NovelChapterEdit.tsx"), "utf8");
  const cleanupEffect = source.match(/useEffect\(\(\) => \{([\s\S]*?)\}, \[[^\]]+\]\);/)?.[1];
  assert.ok(cleanupEffect?.includes("stripLegacyTaskUrlParams(searchParams)"));

  const router = createMemoryRouter(
    [{ path: "/novels/:id/chapters/:chapterId", element: null }],
    { initialEntries: ["/novels/book/chapters/chapter-1?stage=chapter&directorTaskId=old&chapterId=chapter-1&volumeId=volume-2&workspaceTaskId=manual&tag=first&tag=second#editor"] },
  );
  const location = router.state.location;
  let navigation;
  const navigate = (to, options) => { navigation = router.navigate(to, options); };
  const setSearchParams = (params, options) => { navigation = router.navigate(`?${params.toString()}`, options); };

  // Execute the page's cleanup effect against React Router's real memory navigation.
  new Function("location", "navigate", "setSearchParams", "stripLegacyTaskUrlParams", cleanupEffect)(
    location, navigate, setSearchParams, stripLegacyTaskUrlParams,
  );
  await navigation;

  assert.equal(router.state.historyAction, "REPLACE");
  assert.equal(router.state.location.pathname, "/novels/book/chapters/chapter-1");
  assert.equal(router.state.location.search, "?stage=chapter&chapterId=chapter-1&volumeId=volume-2&tag=first&tag=second");
  assert.equal(router.state.location.hash, "#editor");
});
