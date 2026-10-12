import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_DIRECTOR_FOLLOW_MEMORY,
  resolveStructuredOutlineDirectorFollow,
} from "./structuredOutlineDirectorFollow.ts";

function makeVolumes() {
  return [
    {
      id: "vol-1",
      chapters: [
        { id: "ch-1", chapterId: null },
        { id: "ch-2", chapterId: null },
      ],
    },
    {
      id: "vol-8",
      chapters: [
        { id: "ch-36", chapterId: null },
        { id: "ch-37", chapterId: null },
        { id: "ch-38", chapterId: null },
      ],
    },
  ];
}

const baseParams = {
  novelId: "novel-1",
  activeTab: "structured",
  directorChapterId: "ch-1",
  volumes: makeVolumes(),
  memory: { ...EMPTY_DIRECTOR_FOLLOW_MEMORY },
};

test("导演目标变化且工作区未对齐时，跟随到导演目标", () => {
  const { patch, memory } = resolveStructuredOutlineDirectorFollow({
    ...baseParams,
    workspace: { selectedVolumeId: "vol-8", selectedChapterId: "ch-38", selectedBeatKey: "beat-a" },
  });

  assert.deepEqual(patch, {
    selectedVolumeId: "vol-1",
    selectedChapterId: "ch-1",
    selectedBeatKey: "all",
  });
  assert.deepEqual(memory, { novelId: "novel-1", chapterId: "ch-1" });
});

test("issue #172 回归：导演目标未变化时，即使用户改了草稿也不再抢回", () => {
  // 第一次：跟随导演目标 ch-1
  const first = resolveStructuredOutlineDirectorFollow({
    ...baseParams,
    workspace: { selectedVolumeId: "vol-8", selectedChapterId: "ch-38", selectedBeatKey: "beat-a" },
  });
  assert.ok(first.patch, "首次应跟随");

  // 用户手动选回第 8 卷第 38 章，随后每敲一次键盘 effect 重跑（memory 已记录 ch-1）
  const second = resolveStructuredOutlineDirectorFollow({
    ...baseParams,
    workspace: { selectedVolumeId: "vol-8", selectedChapterId: "ch-38", selectedBeatKey: "beat-a" },
    memory: first.memory,
  });
  assert.equal(second.patch, null);
  assert.deepEqual(second.memory, first.memory);

  // 再敲一次键盘：依然不抢回
  const third = resolveStructuredOutlineDirectorFollow({
    ...baseParams,
    workspace: { selectedVolumeId: "vol-8", selectedChapterId: "ch-38", selectedBeatKey: "beat-a" },
    memory: second.memory,
  });
  assert.equal(third.patch, null);
});

test("导演推进到新章节时，再次跟随", () => {
  const first = resolveStructuredOutlineDirectorFollow({
    ...baseParams,
    workspace: { selectedVolumeId: "vol-1", selectedChapterId: "ch-1", selectedBeatKey: "all" },
  });
  assert.equal(first.patch, null); // 已对齐，无需 patch，但记录 memory
  assert.deepEqual(first.memory, { novelId: "novel-1", chapterId: "ch-1" });

  const second = resolveStructuredOutlineDirectorFollow({
    ...baseParams,
    directorChapterId: "ch-2",
    workspace: { selectedVolumeId: "vol-1", selectedChapterId: "ch-1", selectedBeatKey: "all" },
    memory: first.memory,
  });
  assert.deepEqual(second.patch, {
    selectedVolumeId: "vol-1",
    selectedChapterId: "ch-2",
    selectedBeatKey: "all",
  });
});

test("工作区已对齐导演目标时不产生 patch", () => {
  const { patch, memory } = resolveStructuredOutlineDirectorFollow({
    ...baseParams,
    workspace: { selectedVolumeId: "vol-1", selectedChapterId: "ch-1", selectedBeatKey: "all" },
  });
  assert.equal(patch, null);
  assert.deepEqual(memory, { novelId: "novel-1", chapterId: "ch-1" });
});

test("无导演目标时不跟随并清空记忆", () => {
  const { patch, memory } = resolveStructuredOutlineDirectorFollow({
    ...baseParams,
    directorChapterId: "",
    memory: { novelId: "novel-1", chapterId: "ch-1" },
  });
  assert.equal(patch, null);
  assert.deepEqual(memory, EMPTY_DIRECTOR_FOLLOW_MEMORY);
});

test("不在 structured 页签时不跟随", () => {
  const { patch } = resolveStructuredOutlineDirectorFollow({
    ...baseParams,
    activeTab: "chapter",
  });
  assert.equal(patch, null);
});

test("目标卷尚未加载时不跟随且不记录记忆，下次再试", () => {
  const { patch, memory } = resolveStructuredOutlineDirectorFollow({
    ...baseParams,
    directorChapterId: "ch-999",
    memory: { ...EMPTY_DIRECTOR_FOLLOW_MEMORY },
  });
  assert.equal(patch, null);
  assert.deepEqual(memory, EMPTY_DIRECTOR_FOLLOW_MEMORY);
});

test("支持通过 chapterId（执行章节 id）匹配目标", () => {
  const volumes = [
    { id: "vol-1", chapters: [{ id: "plan-ch-1", chapterId: "exec-ch-1" }] },
  ];
  const { patch } = resolveStructuredOutlineDirectorFollow({
    ...baseParams,
    volumes,
    directorChapterId: "exec-ch-1",
    workspace: { selectedVolumeId: "vol-8", selectedChapterId: "ch-38", selectedBeatKey: "all" },
  });
  assert.deepEqual(patch, {
    selectedVolumeId: "vol-1",
    selectedChapterId: "exec-ch-1",
    selectedBeatKey: "all",
  });
});
