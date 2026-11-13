import test from "node:test";
import assert from "node:assert/strict";
import { buildOutlineOpeningLaunchInput } from "../src/components/outlines/openingLaunchInput.ts";

test("opening preparation request explicitly authorizes only the selected chapter", () => {
  assert.deepEqual(buildOutlineOpeningLaunchInput({
    storyInput: "故事方向", estimatedChapterCount: 20, worldMode: "skip",
    provider: "openai", model: "model-a", chapterOrder: 4,
  }), {
    storyInput: "故事方向", estimatedChapterCount: 20, worldMode: "skip",
    provider: "openai", model: "model-a", temperature: undefined,
    targetMode: "opening", executionRange: { from: 4, to: 4 },
  });
});
