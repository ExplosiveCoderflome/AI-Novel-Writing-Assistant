import assert from "node:assert/strict";
import test from "node:test";

import { parseEstimatedChapterCountInput } from "./estimatedChapterCountInput.ts";
import { createDefaultNovelBasicFormState, patchNovelBasicForm } from "../novelBasicInfo.shared.ts";
import { buildAutoDirectorRequestPayload } from "../components/NovelAutoDirectorDialog.shared.ts";

test('AI recommended chapter count is not replaced by an untouched form default, while explicit and legacy choices survive', () => {
  const initial=createDefaultNovelBasicFormState();
  const payload=form=>buildAutoDirectorRequestPayload(form,'十二章完结',{provider:'deepseek',model:'test'},'full_book_autopilot');
  assert.equal(payload(initial).estimatedChapterCount,undefined);
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

test("parseEstimatedChapterCountInput only accepts the supported chapter range", () => {
  assert.equal(parseEstimatedChapterCountInput("1"), 1);
  assert.equal(parseEstimatedChapterCountInput("2000"), 2000);
  assert.equal(parseEstimatedChapterCountInput("0"), null);
  assert.equal(parseEstimatedChapterCountInput("2001"), null);
  assert.equal(parseEstimatedChapterCountInput("30.5"), null);
});
