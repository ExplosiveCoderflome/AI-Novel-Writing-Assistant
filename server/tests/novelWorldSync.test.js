const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildSyncDiffItems,
  buildSyncPendingChangesPayload,
} = require("../dist/services/novel/worldContext/NovelWorldSyncService.js");

function buildStructure(overrides = {}) {
  return {
    profile: {
      summary: "",
      identity: "",
      tone: "",
      themes: [],
      coreConflict: "",
      ...overrides.profile,
    },
    rules: {
      summary: "",
      axioms: [],
      taboo: [],
      sharedConsequences: [],
      ...overrides.rules,
    },
    factions: overrides.factions ?? [],
    forces: overrides.forces ?? [],
    locations: overrides.locations ?? [],
    relations: {
      forceRelations: [],
      locationControls: [],
      ...overrides.relations,
    },
    metadata: {
      schemaVersion: 1,
    },
  };
}

test("buildSyncPendingChangesPayload summarizes pending sections", () => {
  const payload = buildSyncPendingChangesPayload([
    {
      section: "rules",
      label: "核心规则",
      status: "changed",
      summary: "本书世界与世界库的「核心规则」不一致。",
    },
    {
      section: "forces",
      label: "势力",
      status: "library_only",
      summary: "世界库有「势力」，本书世界缺少这一部分。",
    },
  ]);

  assert.ok(payload);
  const parsed = JSON.parse(payload);
  assert.equal(parsed.differenceCount, 2);
  assert.deepEqual(parsed.sections, ["rules", "forces"]);
  assert.match(parsed.summary, /核心规则/);
  assert.match(parsed.summary, /势力/);
  assert.match(parsed.computedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("buildSyncPendingChangesPayload clears empty pending changes", () => {
  assert.equal(buildSyncPendingChangesPayload([]), null);
});

test("buildSyncDiffItems includes readable section previews", () => {
  const differences = buildSyncDiffItems(
    buildStructure({
      rules: {
        summary: "星核透支会损伤寿命。",
        axioms: [{ id: "rule-1", name: "星核代价", summary: "力量有代价" }],
        taboo: ["不能无代价升级"],
        sharedConsequences: [],
      },
      forces: [
        { id: "force-a", name: "北境星核司" },
        { id: "force-b", name: "裂星盟" },
      ],
    }),
    buildStructure({
      rules: {
        summary: "星核力量来自古代遗迹。",
        axioms: [{ id: "rule-2", name: "遗迹共鸣", summary: "古物唤醒力量" }],
        taboo: [],
        sharedConsequences: [],
      },
      forces: [
        { id: "force-c", name: "天机阁" },
      ],
    }),
  );

  const ruleDiff = differences.find((item) => item.section === "rules");
  const forceDiff = differences.find((item) => item.section === "forces");
  assert.match(ruleDiff?.summary ?? "", /星核透支/);
  assert.match(ruleDiff?.summary ?? "", /遗迹共鸣/);
  assert.match(forceDiff?.summary ?? "", /北境星核司/);
  assert.match(forceDiff?.summary ?? "", /天机阁/);
});

test("novel world sync input accepts close sync direction", async () => {
  const { novelWorldSyncInputSchema } = await import("@ai-novel/shared/types/novelWorld");
  assert.deepEqual(novelWorldSyncInputSchema.parse({ direction: "none" }), {
    direction: "none",
  });
});
