import test from "node:test";
import assert from "node:assert/strict";
import {
  getMobileFloatingSaveLabel,
  getMobileStickyDirectorTopClass,
} from "../src/pages/novels/mobile/mobileFloatingActions.ts";

test("getMobileFloatingSaveLabel keeps save action compact", () => {
  assert.equal(getMobileFloatingSaveLabel(false), "保存");
  assert.equal(getMobileFloatingSaveLabel(true), "保存中");
});

test("getMobileStickyDirectorTopClass clears the mobile header", () => {
  assert.equal(getMobileStickyDirectorTopClass(), "top-[6.5rem]");
});
