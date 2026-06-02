import test from "node:test";
import assert from "node:assert/strict";

import { parseDirectorTaskNotice } from "./directorTaskNotice.ts";

test("parseDirectorTaskNotice keeps a valid open_structured_outline action", () => {
  const result = parseDirectorTaskNotice({
    taskNotice: {
      code: "CHAPTER_TITLE_DIVERSITY",
      summary: "章节标题重复，需要修复。",
      action: {
        type: "open_structured_outline",
        label: "去修复",
        volumeId: "vol-1",
      },
    },
  });

  assert.ok(result);
  assert.ok(result.action);
  assert.equal(result.action.type, "open_structured_outline");
  assert.equal(result.action.label, "去修复");
  assert.equal(result.action.volumeId, "vol-1");
});

test("parseDirectorTaskNotice rejects an action with an unknown type instead of forcing it", () => {
  const result = parseDirectorTaskNotice({
    taskNotice: {
      code: "CHAPTER_TITLE_DIVERSITY",
      summary: "章节标题重复，需要修复。",
      // Untrusted server data carrying an action type that is NOT in the allowed union.
      action: {
        type: "redirect_to_evil_site",
        label: "点我",
        volumeId: "vol-9",
      },
    },
  });

  assert.ok(result, "notice itself stays valid (code + summary present)");
  // The current tautology silently coerces ANY type to "open_structured_outline".
  // An unknown/untrusted action type must be dropped, not laundered into a valid one.
  assert.equal(result.action, null);
});
