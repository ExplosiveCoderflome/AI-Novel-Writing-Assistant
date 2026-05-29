import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./NovelAutoDirectorProgressPanel.tsx", import.meta.url), "utf8");

test("auto director progress panel uses the snapshot query key for full task snapshots", () => {
  assert.match(source, /queryKey:\s*queryKeys\.tasks\.directorTaskSnapshot\(runtimeTaskId \|\| "none"\)/);
  assert.doesNotMatch(source, /queryKey:\s*queryKeys\.tasks\.directorRuntime\(runtimeTaskId \|\| "none"\)/);
});

test("auto director progress panel keeps previous snapshot data during polling", () => {
  assert.match(source, /placeholderData:\s*\(previousData\)\s*=>\s*previousData/);
});
