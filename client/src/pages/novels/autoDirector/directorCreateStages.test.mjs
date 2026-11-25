import assert from "node:assert/strict";
import test from "node:test";

import { parseEstimatedChapterCountInput } from "./estimatedChapterCountInput.ts";
import { authorEstimatedChapterCount, createDefaultNovelBasicFormState, patchNovelBasicForm } from "../novelBasicInfo.shared.ts";
import { buildAutoDirectorRequestPayload } from "../components/NovelAutoDirectorDialog.shared.ts";

test('AI recommended chapter count is not replaced by an untouched form default, while explicit and legacy choices survive', () => {
  const initial=createDefaultNovelBasicFormState();
  const payload=form=>buildAutoDirectorRequestPayload(form,'十二章完结',{provider:'deepseek',model:'test'},'full_book_autopilot');
  assert.equal(payload(initial).estimatedChapterCount,undefined);
  assert.equal(payload(initial).userPreferredVolumeCount,undefined);
  const fixed=patchNovelBasicForm(initial,{userPreferredVolumeCount:4});
  assert.equal(payload(patchNovelBasicForm(initial,JSON.parse(JSON.stringify(fixed)))).userPreferredVolumeCount,4);
  assert.equal(payload(patchNovelBasicForm(fixed,{userPreferredVolumeCount:undefined})).userPreferredVolumeCount,undefined);
  assert.equal(payload(patchNovelBasicForm(initial,{estimatedChapterCount:12})).estimatedChapterCount,12);
  assert.equal(payload(patchNovelBasicForm(initial,{estimatedChapterCount:80})).estimatedChapterCount,80);
  const legacy={...initial}; delete legacy.estimatedChapterCountSource;
  assert.equal(payload(legacy).estimatedChapterCount,80);
  const restored=patchNovelBasicForm(initial,JSON.parse(JSON.stringify(initial)));
  assert.equal(payload(restored).estimatedChapterCount,undefined);
});

test("parseEstimatedChapterCountInput keeps an empty numeric field as an editing state", () => {
  assert.equal(parseEstimatedChapterCountInput(""), null);
  assert.equal(parseEstimatedChapterCountInput("30"), 30);
});

test("restoring a persisted null chapter count keeps AI recommendation through refinement and confirmation", () => {
  const initial = createDefaultNovelBasicFormState();
  const previous = patchNovelBasicForm(initial, {estimatedChapterCount: 12});
  for (const source of [undefined, "default", "user"]) {
    const saved = JSON.parse(JSON.stringify({estimatedChapterCount: null, estimatedChapterCountSource: source}));
    const restored = patchNovelBasicForm(previous, saved);
    assert.equal(restored.estimatedChapterCountSource, "default");
    assert.equal(restored.estimatedChapterCount, initial.estimatedChapterCount);
    const request = buildAutoDirectorRequestPayload(restored, "原想法及修正", {provider: "deepseek", model: "test"}, "auto_to_ready", "saved-task");
    assert.equal(request.estimatedChapterCount, undefined);
    assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(request)), "estimatedChapterCount"), false);
    const explicit = patchNovelBasicForm(restored, {estimatedChapterCount: 260});
    assert.equal(explicit.estimatedChapterCount, 260);
    assert.equal(explicit.estimatedChapterCountSource, "user");
  }
});

test("parseEstimatedChapterCountInput only accepts the supported chapter range", () => {
  assert.equal(parseEstimatedChapterCountInput("1"), 1);
  assert.equal(parseEstimatedChapterCountInput("2000"), 2000);
  assert.equal(parseEstimatedChapterCountInput("0"), null);
  assert.equal(parseEstimatedChapterCountInput("2001"), null);
  assert.equal(parseEstimatedChapterCountInput("30.5"), null);
});

test("clearing a manual chapter count removes the constraint used by execution ranges", () => {
  const manual = patchNovelBasicForm(createDefaultNovelBasicFormState(), {estimatedChapterCount: 250});
  assert.equal(authorEstimatedChapterCount(manual), 250);
  const cleared = patchNovelBasicForm(manual, {estimatedChapterCountSource: "default"});
  assert.equal(authorEstimatedChapterCount(cleared), undefined);
});
