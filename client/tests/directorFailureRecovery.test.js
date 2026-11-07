import test from "node:test";
import assert from "node:assert/strict";
import {usesOpeningRetry} from "../src/pages/novels/autoDirector/recovery/index.ts";

test("pre-book V1 failures use workflow resume and V2 failures use opening retry", () => {
  assert.equal(usesOpeningRetry({meta: {directorVersion: "v1"}}, "v2"), false);
  assert.equal(usesOpeningRetry({meta: {directorVersion: "v2"}}, "v1"), true);
  assert.equal(usesOpeningRetry(null, "v1"), false);
  assert.equal(usesOpeningRetry(null, "v2"), true);
  for (const directorVersion of ["v1", "v2"]) {
    assert.equal(usesOpeningRetry({meta: {directorVersion}, resumeTarget: {novelId: "saved-book"}}, "v2"), false);
  }
});
