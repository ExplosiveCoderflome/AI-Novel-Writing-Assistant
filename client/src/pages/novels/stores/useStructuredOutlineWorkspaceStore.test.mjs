import assert from "node:assert/strict";
import test from "node:test";

import { useStructuredOutlineWorkspaceStore } from "./useStructuredOutlineWorkspaceStore.ts";

function freshStore() {
  useStructuredOutlineWorkspaceStore.setState({ workspaces: {} });
  return useStructuredOutlineWorkspaceStore.getState();
}

test("patchWorkspace 会忽略 undefined 字段，不清空已有选中（issue #172）", () => {
  const api = freshStore();
  api.ensureWorkspace("novel-1", { selectedVolumeId: "vol-8", selectedChapterId: "ch-38" });

  // 模拟 NovelEdit 挂载 effect 在 URL 无参数时的调用
  api.patchWorkspace("novel-1", {
    selectedVolumeId: undefined,
    selectedChapterId: undefined,
  });

  const ws = useStructuredOutlineWorkspaceStore.getState().workspaces["novel-1"];
  assert.equal(ws.selectedVolumeId, "vol-8");
  assert.equal(ws.selectedChapterId, "ch-38");
});

test("patchWorkspace 正常应用有值的字段", () => {
  const api = freshStore();
  api.ensureWorkspace("novel-1", {});

  api.patchWorkspace("novel-1", {
    selectedVolumeId: "vol-8",
    selectedChapterId: "ch-38",
    showChapterAdvanced: true,
  });

  const ws = useStructuredOutlineWorkspaceStore.getState().workspaces["novel-1"];
  assert.equal(ws.selectedVolumeId, "vol-8");
  assert.equal(ws.selectedChapterId, "ch-38");
  assert.equal(ws.showChapterAdvanced, true);
});

test("patchWorkspace 混合 undefined 与有值字段时只应用有值部分", () => {
  const api = freshStore();
  api.ensureWorkspace("novel-1", { selectedVolumeId: "vol-8", selectedChapterId: "ch-38" });

  api.patchWorkspace("novel-1", {
    selectedVolumeId: undefined,
    selectedBeatKey: "beat-a",
  });

  const ws = useStructuredOutlineWorkspaceStore.getState().workspaces["novel-1"];
  assert.equal(ws.selectedVolumeId, "vol-8");
  assert.equal(ws.selectedBeatKey, "beat-a");
});

test("ensureWorkspace 不会覆盖已存在的工作区", () => {
  const api = freshStore();
  api.ensureWorkspace("novel-1", { selectedVolumeId: "vol-8", selectedChapterId: "ch-38" });
  api.ensureWorkspace("novel-1", { selectedVolumeId: "vol-1", selectedChapterId: "ch-1" });

  const ws = useStructuredOutlineWorkspaceStore.getState().workspaces["novel-1"];
  assert.equal(ws.selectedVolumeId, "vol-8");
  assert.equal(ws.selectedChapterId, "ch-38");
});
