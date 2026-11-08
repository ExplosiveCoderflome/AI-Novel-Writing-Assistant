import assert from "node:assert/strict";
import test from "node:test";
import { getDirectionGenerationDisabledReasons } from "./generationReadiness.ts";

const ready = {
  idea: "城市每天重置，只有邮差记得昨日。",
  directorVersion: "v2",
  availableVersions: ["v1", "v2"],
  versionsLoading: false,
  versionsError: false,
  isGenerating: false,
  requireCreativeCarryoverAdopted: false,
  creativeCarryoverAdopted: false,
};

test("direction generation lists every unmet prerequisite and accepts a ready opening", () => {
  assert.deepEqual(getDirectionGenerationDisabledReasons(ready), []);
  assert.deepEqual(getDirectionGenerationDisabledReasons({
    ...ready, idea: " \n ", availableVersions: ["v1"], isGenerating: true,
    requireCreativeCarryoverAdopted: true,
  }), [
    "请返回第 1 步填写单书构想。",
    "所选导演版本不可用，请选择可用版本。",
    "正在生成整书方向，请等待本次生成完成。",
    "请打开创作方案并采用推荐方案。",
  ]);
  assert.deepEqual(getDirectionGenerationDisabledReasons({
    ...ready, requireCreativeCarryoverAdopted: true, creativeCarryoverAdopted: true,
  }), []);
});

test("version loading and fetch failure have distinct actionable reasons", () => {
  assert.deepEqual(getDirectionGenerationDisabledReasons({
    ...ready, availableVersions: [], versionsLoading: true,
  }), ["正在读取可用导演版本，请稍候。"]);
  assert.deepEqual(getDirectionGenerationDisabledReasons({
    ...ready, versionsError: true,
  }), ["可用导演版本读取失败，请重试。"]);
});
