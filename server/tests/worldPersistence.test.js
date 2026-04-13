const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeGeneratedWorldPayload } = require("../dist/services/world/worldPersistence.js");

test("normalizeGeneratedWorldPayload flattens object world fields into strings", () => {
  const payload = normalizeGeneratedWorldPayload({
    description: "抗日奇侠传世界设定",
    geography: {
      terrain: "华北平原与山地交错",
      climate: "四季分明，冬季严寒",
    },
    cultures: {
      summary: "民间侠义与家国情怀并存",
    },
    magicSystem: {
      content: "奇术源于民间秘法，使用需付出寿元代价。",
    },
    conflict: {
      main: "侵略势力与民间抗争持续升级",
    },
    selectedDimensions: {
      geography: true,
      history: true,
    },
    layerStates: {
      foundation: {
        key: "foundation",
        status: "pending",
      },
    },
  }, "fallback");

  assert.equal(payload.description, "抗日奇侠传世界设定");
  assert.match(payload.geography ?? "", /terrain：华北平原与山地交错/);
  assert.equal(payload.cultures, "民间侠义与家国情怀并存");
  assert.equal(payload.magicSystem, "奇术源于民间秘法，使用需付出寿元代价。");
  assert.match(payload.conflicts ?? "", /main：侵略势力与民间抗争持续升级/);
  assert.equal(payload.selectedDimensions, JSON.stringify({ geography: true, history: true }));
  assert.equal(payload.layerStates, JSON.stringify({
    foundation: {
      key: "foundation",
      status: "pending",
    },
  }));
});
