import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("client/src/pages/autoDirectorFollowUps/components/AutoDirectorFollowUpOverview.tsx", "utf8");

test("auto director follow-up reason cards use a mobile 2x2 grid", () => {
  assert.match(source, /auto-director-follow-up-reason-grid/);
  assert.match(source, /grid-cols-2/);
  assert.match(source, /sm:contents/);
});
