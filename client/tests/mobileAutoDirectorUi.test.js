import test from "node:test";
import assert from "node:assert/strict";
import {
  getMobileAutoDirectorModeLabel,
  getMobileAutoDirectorStickyLabel,
  shouldShowMobileAutoDirectorProgress,
} from "../src/pages/novels/mobile/mobileAutoDirectorUi.ts";

test("getMobileAutoDirectorModeLabel keeps mobile labels short", () => {
  assert.equal(getMobileAutoDirectorModeLabel("running"), "接管中");
  assert.equal(getMobileAutoDirectorModeLabel("waiting"), "待确认");
  assert.equal(getMobileAutoDirectorModeLabel("action_required"), "待处理");
  assert.equal(getMobileAutoDirectorModeLabel("failed"), "异常");
  assert.equal(getMobileAutoDirectorModeLabel("loading"), "加载中");
});

test("getMobileAutoDirectorStickyLabel prefers current action over description", () => {
  assert.equal(
    getMobileAutoDirectorStickyLabel({ title: "《长夜》正在自动导演", currentAction: "正在生成第 2 卷节奏板", description: "后台推进中" }),
    "正在生成第 2 卷节奏板",
  );
  assert.equal(
    getMobileAutoDirectorStickyLabel({ title: "《长夜》正在自动导演", currentAction: "", description: "等待你确认卷骨架" }),
    "等待你确认卷骨架",
  );
});

test("shouldShowMobileAutoDirectorProgress only shows known progress values", () => {
  assert.equal(shouldShowMobileAutoDirectorProgress(0), true);
  assert.equal(shouldShowMobileAutoDirectorProgress(68), true);
  assert.equal(shouldShowMobileAutoDirectorProgress(null), false);
  assert.equal(shouldShowMobileAutoDirectorProgress(undefined), false);
});
