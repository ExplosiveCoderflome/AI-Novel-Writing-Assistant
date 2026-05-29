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

test("auto director progress panel uses dashboard view for main container state", () => {
  assert.match(source, /const dashboardView = snapshot\?\.dashboardView \?\? null/);
  assert.match(source, /mapDashboardModeToContainerMode\(dashboardView\?\.mode \?\? null\)/);
  assert.match(source, /dashboardView\?\.mode === "running" \|\| dashboardView\?\.mode === "queued"[\s\S]*\? null[\s\S]*: rawChapterTitleWarning/);
  assert.doesNotMatch(source, /runtimeProjectionForDisplay\?\.status === "waiting_approval"/);
  assert.doesNotMatch(source, /runtimeProjectionForDisplay\?\.requiresUserAction/);
  assert.doesNotMatch(source, /const runtimeRequiresUserAction/);
});
