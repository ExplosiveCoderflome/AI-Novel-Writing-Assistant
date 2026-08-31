import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAutoDirectorCreateDraftScope,
  clearAutoDirectorCreateDraft,
  loadAutoDirectorCreateDraft,
  saveAutoDirectorCreateDraft,
} from "./autoDirectorCreateDraft.ts";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const basicForm = {
  title: "测试小说",
  description: "",
  worldId: "",
};

test("creation draft restores the pre-task idea and last safe stage", () => {
  const storage = createMemoryStorage();
  const scopeKey = buildAutoDirectorCreateDraftScope({});

  assert.equal(saveAutoDirectorCreateDraft(storage, scopeKey, {
    idea: "一个普通人发现城市每天都会重置。",
    basicForm,
    activeStage: "world_style",
    completedStages: ["idea", "basic"],
    runMode: "auto_to_ready",
    worldSetupMode: "auto_generate",
    selectedStyleProfileId: "style-1",
  }), true);

  assert.deepEqual(loadAutoDirectorCreateDraft(storage, scopeKey), {
    version: 1,
    scopeKey,
    idea: "一个普通人发现城市每天都会重置。",
    basicForm,
    activeStage: "world_style",
    completedStages: ["idea", "basic"],
    runMode: "auto_to_ready",
    worldSetupMode: "auto_generate",
    selectedStyleProfileId: "style-1",
    savedAt: loadAutoDirectorCreateDraft(storage, scopeKey)?.savedAt,
  });
});

test("candidate stage falls back to the last pre-task stage", () => {
  const storage = createMemoryStorage();
  const scopeKey = buildAutoDirectorCreateDraftScope({ marketBriefId: "brief-1" });

  saveAutoDirectorCreateDraft(storage, scopeKey, {
    idea: "测试",
    basicForm,
    activeStage: "candidates",
    completedStages: ["idea", "basic", "world_style", "model_run", "candidates"],
    runMode: "auto_to_ready",
    worldSetupMode: "skip",
    selectedStyleProfileId: "",
  });

  const draft = loadAutoDirectorCreateDraft(storage, scopeKey);
  assert.equal(draft?.activeStage, "model_run");
  assert.deepEqual(draft?.completedStages, ["idea", "basic", "world_style", "model_run"]);
});

test("drafts are isolated by creation source and cleared after task creation", () => {
  const storage = createMemoryStorage();
  const plainScope = buildAutoDirectorCreateDraftScope({});
  const marketScope = buildAutoDirectorCreateDraftScope({ marketBriefId: "brief-1" });

  saveAutoDirectorCreateDraft(storage, plainScope, {
    idea: "普通开书",
    basicForm,
    activeStage: "idea",
    completedStages: [],
    runMode: "auto_to_ready",
    worldSetupMode: "auto_generate",
    selectedStyleProfileId: "",
  });

  assert.equal(loadAutoDirectorCreateDraft(storage, marketScope), null);
  assert.equal(clearAutoDirectorCreateDraft(storage, plainScope), true);
  assert.equal(loadAutoDirectorCreateDraft(storage, plainScope), null);
});

test("invalid or unavailable storage never breaks the creation page", () => {
  const brokenStorage = {
    getItem: () => "{bad json",
    setItem: () => { throw new Error("quota"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  const scopeKey = buildAutoDirectorCreateDraftScope({});

  assert.equal(loadAutoDirectorCreateDraft(brokenStorage, scopeKey), null);
  assert.equal(saveAutoDirectorCreateDraft(brokenStorage, scopeKey, {
    idea: "测试",
    basicForm,
    activeStage: "idea",
    completedStages: [],
    runMode: "auto_to_ready",
    worldSetupMode: "auto_generate",
    selectedStyleProfileId: "",
  }), false);
  assert.equal(clearAutoDirectorCreateDraft(brokenStorage, scopeKey), false);
});
